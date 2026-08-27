import logging
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from documents.models import Folder, Document
from documents.services import delete_document_and_files
from .models import Dataroom, DataroomDocument, DataroomFolder
from .utils import get_dataroom_storage_folder_name

logger = logging.getLogger(__name__)


def touch_dataroom_folder_ancestors(folder: DataroomFolder | None):
    """
    Updates the modification timestamp (updated_at) for the given DataroomFolder
    and all its ancestor folders up to the root in a single batch UPDATE query.
    """
    if not folder:
        return
    now = timezone.now()
    ancestor_ids = []
    visited = set()
    current = folder
    while current and current.id not in visited:
        visited.add(current.id)
        ancestor_ids.append(current.id)
        current = current.parent
    if ancestor_ids:
        DataroomFolder.objects.filter(id__in=ancestor_ids).update(updated_at=now)


def delete_dataroom(dataroom: Dataroom):
    """
    Explicitly deletes a Dataroom:
    1. Removes all dataroom items using reference-aware cleanup (preserving documents
       that are linked in other datarooms).
    2. Deletes or moves any remaining backing folder under 'Dataroom Uploads'.
    3. Deletes the Dataroom model record.
    """
    organization = dataroom.organization
    root_folder = Folder.objects.get_root_for_org(organization)

    # 1. Clean up all Dataroom items with reference counting
    all_doc_ids = list(dataroom.documents.values_list('id', flat=True))
    all_folder_ids = list(dataroom.folders.values_list('id', flat=True))
    if all_doc_ids or all_folder_ids:
        remove_dataroom_content(dataroom, dataroom_doc_ids=all_doc_ids, dataroom_folder_ids=all_folder_ids)

    # 2. Clean up backing storage folder under 'Dataroom Uploads'
    if root_folder:
        dataroom_uploads_query = Folder.objects.filter(
            organization=organization,
            parent=root_folder,
            name="Dataroom Uploads"
        )
        if dataroom.created_by:
            dataroom_uploads_query = dataroom_uploads_query.filter(created_by=dataroom.created_by)

        target_folder_name = get_dataroom_storage_folder_name(dataroom.name, dataroom)
        dataroom_folder = Folder.objects.filter(
            organization=organization,
            parent__in=dataroom_uploads_query,
            name=target_folder_name
        ).first()
        if dataroom_folder:
            dataroom_uploads_folder = dataroom_folder.parent
            # If there are any documents still in this folder (e.g. preserved shared files),
            # move them up to the parent 'Dataroom Uploads' folder before deleting this specific folder.
            descendants = dataroom_folder.get_descendants()
            folders_to_check = [dataroom_folder] + descendants
            remaining_docs = Document.objects.filter(folder__in=folders_to_check)
            if remaining_docs.exists():
                remaining_docs.update(folder=dataroom_uploads_folder)
            try:
                Folder.objects.filter(id__in=[f.id for f in folders_to_check]).delete()
            except Exception as e:
                logger.exception("Failed to clean up backing folder %s for dataroom %s: %s", dataroom_folder.id, dataroom.id, e)

    # 3. Delete the Dataroom record
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
        ).select_related('document', 'document__folder', 'folder')
    )
    ddoc_ids_to_remove = {d.id for d in ddocs_to_remove}

    # 3. Identify direct upload documents that have no other references
    root_folder = Folder.objects.get_root_for_org(dataroom.organization)
    dataroom_uploads_folders = []
    if root_folder:
        uploads_query = Folder.objects.filter(
            organization=dataroom.organization,
            parent=root_folder,
            name="Dataroom Uploads"
        )
        if dataroom.created_by:
            uploads_query = uploads_query.filter(created_by=dataroom.created_by)
        dataroom_uploads_folders = list(uploads_query)

    backing_docs_to_delete = []
    seen_doc_ids = set()

    for ddoc in ddocs_to_remove:
        doc = ddoc.document
        if not doc or doc.id in seen_doc_ids:
            continue
        seen_doc_ids.add(doc.id)

        # Check if direct upload
        # TODO: Optimize N+1 SQL queries on deep folder hierarchies by pre-collecting all
        # descendant folder IDs under 'Dataroom Uploads' into an in-memory set upfront,
        # then checking `doc.folder_id in direct_upload_folder_ids`.
        is_direct_upload = False
        if dataroom_uploads_folders:
            curr = doc.folder
            while curr:
                if curr in dataroom_uploads_folders:
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
    parent_folders_to_touch = set()
    for ddoc in ddocs_to_remove:
        if ddoc.folder and ddoc.folder.id not in all_folder_ids:
            parent_folders_to_touch.add(ddoc.folder)

    if dataroom_folder_ids:
        folders_being_deleted = DataroomFolder.objects.filter(
            id__in=dataroom_folder_ids,
            dataroom=dataroom
        ).select_related('parent')
        for folder in folders_being_deleted:
            if folder.parent and folder.parent.id not in all_folder_ids:
                parent_folders_to_touch.add(folder.parent)

    with transaction.atomic():
        if dataroom_doc_ids:
            DataroomDocument.objects.filter(id__in=dataroom_doc_ids, dataroom=dataroom).delete()
        if dataroom_folder_ids:
            DataroomFolder.objects.filter(id__in=dataroom_folder_ids, dataroom=dataroom).delete()
        for parent_folder in parent_folders_to_touch:
            touch_dataroom_folder_ancestors(parent_folder)

    # Delete backing documents and storage files for direct uploads with no other references (non-blocking)
    for doc in backing_docs_to_delete:
        try:
            delete_document_and_files(doc)
        except Exception as e:
            logger.exception("Failed to clean up backing document %s: %s", doc.id, e)

