import logging
from django.db import transaction
from django.db.models import Q

from documents.models import Folder, Document
from documents.services import delete_folder_and_contents, delete_document_and_files
from .models import Dataroom, DataroomDocument, DataroomFolder
from .utils import get_dataroom_storage_folder_name

logger = logging.getLogger(__name__)


def delete_dataroom(dataroom: Dataroom):
    """
    Explicitly deletes a Dataroom:
    1. Finds the corresponding library folder under 'Dataroom Uploads' and deletes it
       along with all backing documents, storage files, and quota updates.
    2. Deletes the Dataroom model record (cascading cleanly to DataroomFolder,
       DataroomDocument, DataroomItemOrder, etc.).
    """
    organization = dataroom.organization
    user = dataroom.created_by
    root_folder = Folder.objects.get_root_for_org(organization)
    if root_folder and user:
        dataroom_uploads_folder = Folder.objects.filter(
            organization=organization,
            parent=root_folder,
            name="Dataroom Uploads",
            created_by=user
        ).first()
        if dataroom_uploads_folder:
            target_folder_name = get_dataroom_storage_folder_name(dataroom.name, dataroom)
            dataroom_folder = Folder.objects.filter(
                organization=organization,
                parent=dataroom_uploads_folder,
                name=target_folder_name,
                created_by=user
            ).first()
            if dataroom_folder:
                delete_folder_and_contents(dataroom_folder)

    # Delete the Dataroom record (cascades cleanly without hidden signal triggers)
    dataroom.delete()


def remove_dataroom_content(dataroom: Dataroom, dataroom_doc_ids: list = None, dataroom_folder_ids: list = None):
    """
    Explicitly removes documents and folders from a Dataroom:
    1. Identifies all DataroomDocument rows being deleted (including in subfolders).
    2. For direct uploads that have no other references in other datarooms, deletes
       the backing Document, storage files, and decrements quota.
    3. Deletes DataroomDocument and DataroomFolder records.
    """
    dataroom_doc_ids = dataroom_doc_ids or []
    dataroom_folder_ids = dataroom_folder_ids or []

    # 1. Expand all descendant folder IDs
    all_folder_ids = set(dataroom_folder_ids)
    if dataroom_folder_ids:
        folders_to_check = list(DataroomFolder.objects.filter(id__in=dataroom_folder_ids, dataroom=dataroom))
        stack = list(folders_to_check)
        while stack:
            f = stack.pop()
            for child in f.children.all():
                all_folder_ids.add(child.id)
                stack.append(child)

    # 2. Collect all DataroomDocument objects being removed
    ddocs_to_remove = list(
        DataroomDocument.objects.filter(
            Q(id__in=dataroom_doc_ids) | Q(folder_id__in=all_folder_ids),
            dataroom=dataroom
        ).select_related('document', 'document__folder')
    )
    ddoc_ids_to_remove = {d.id for d in ddocs_to_remove}

    # 3. Identify direct upload documents that have no other references
    root_folder = Folder.objects.get_root_for_org(dataroom.organization)
    dataroom_uploads = None
    if root_folder and dataroom.created_by:
        dataroom_uploads = Folder.objects.filter(
            organization=dataroom.organization,
            parent=root_folder,
            name="Dataroom Uploads",
            created_by=dataroom.created_by
        ).first()

    backing_docs_to_delete = []
    seen_doc_ids = set()

    for ddoc in ddocs_to_remove:
        doc = ddoc.document
        if not doc or doc.id in seen_doc_ids:
            continue
        seen_doc_ids.add(doc.id)

        # Check if direct upload
        is_direct_upload = False
        if dataroom_uploads:
            curr = doc.folder
            while curr:
                if curr == dataroom_uploads:
                    is_direct_upload = True
                    break
                curr = curr.parent

        if is_direct_upload:
            # Check if this document is referenced in any other DataroomDocument
            other_references_exist = (
                DataroomDocument.objects.filter(document=doc)
                .exclude(id__in=ddoc_ids_to_remove)
                .exists()
            )
            if not other_references_exist:
                backing_docs_to_delete.append(doc)

    # 4. Perform deletion
    with transaction.atomic():
        if dataroom_doc_ids:
            DataroomDocument.objects.filter(id__in=dataroom_doc_ids, dataroom=dataroom).delete()
        if dataroom_folder_ids:
            DataroomFolder.objects.filter(id__in=dataroom_folder_ids, dataroom=dataroom).delete()

        # Delete backing documents and storage files for direct uploads
        for doc in backing_docs_to_delete:
            delete_document_and_files(doc)
