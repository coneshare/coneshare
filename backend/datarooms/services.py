import logging
import os
from pathlib import Path
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


def get_or_create_dataroom_storage_folder(dataroom: Dataroom, requesting_user=None, relative_path=None) -> Folder:
    """
    Resolves or creates the physical Folder structure for a Dataroom based on its storage_version:
    - v2 (Modern System Vault): Org Root -> '__datarooms__' (created_by=None) -> '<dataroom_id>' (created_by=None) -> relative subfolders.
    - v1 (Legacy User-Scoped): Org Root -> 'Dataroom Uploads' -> '<Name> (<ID>)' -> relative subfolders.
    """
    organization = dataroom.organization
    root_folder = Folder.objects.get_root_for_org(organization)

    if dataroom.storage_version >= 2:
        # V2: System Storage Vault
        system_vault, _ = Folder.objects.get_or_create(
            organization=organization,
            parent=root_folder,
            name="__datarooms__",
            defaults={'created_by': None}
        )
        dataroom_folder, _ = Folder.objects.get_or_create(
            organization=organization,
            parent=system_vault,
            name=str(dataroom.id),
            defaults={'created_by': None}
        )
        current_folder = dataroom_folder

        if relative_path:
            folder_path, _ = os.path.split(relative_path)
            if folder_path:
                path_parts = Path(folder_path).parts
                for part in path_parts:
                    current_folder, _ = Folder.objects.get_or_create(
                        organization=organization,
                        parent=current_folder,
                        name=part,
                        defaults={'created_by': None}
                    )
        return current_folder
    else:
        # V1: Legacy User-Scoped Storage
        creator = dataroom.created_by or requesting_user
        dataroom_uploads_folder, _ = Folder.objects.get_or_create(
            organization=organization,
            parent=root_folder,
            name="Dataroom Uploads",
            created_by=creator
        )
        dataroom_folder, _ = Folder.objects.get_or_create(
            organization=organization,
            parent=dataroom_uploads_folder,
            name=get_dataroom_storage_folder_name(dataroom.name, dataroom),
            created_by=creator
        )
        current_folder = dataroom_folder

        if relative_path:
            folder_path, _ = os.path.split(relative_path)
            if folder_path:
                path_parts = Path(folder_path).parts
                for part in path_parts:
                    current_folder, _ = Folder.objects.get_or_create(
                        organization=organization,
                        parent=current_folder,
                        name=part,
                        defaults={'created_by': creator}
                    )
        return current_folder


def delete_dataroom(dataroom: Dataroom):
    """
    Explicitly deletes a Dataroom:
    1. Removes all dataroom items using reference-aware cleanup (preserving documents
       that are linked in other datarooms).
    2. Deletes backing storage folder (__datarooms__/<id> for v2, or 'Dataroom Uploads'/<Name> for v1).
    3. Deletes the Dataroom model record.
    """
    organization = dataroom.organization
    root_folder = Folder.objects.get_root_for_org(organization)

    # 1. Clean up all Dataroom items with reference counting
    all_doc_ids = list(dataroom.documents.values_list('id', flat=True))
    all_folder_ids = list(dataroom.folders.values_list('id', flat=True))
    if all_doc_ids or all_folder_ids:
        remove_dataroom_content(dataroom, dataroom_doc_ids=all_doc_ids, dataroom_folder_ids=all_folder_ids)

    # 2. Clean up backing storage folder (both modern system vault and legacy uploads)
    if root_folder:
        # Modern v2 system vault cleanup
        system_vault = Folder.objects.filter(
            organization=organization,
            parent=root_folder,
            name="__datarooms__"
        ).first()
        if system_vault:
            storage_folder = Folder.objects.filter(
                organization=organization,
                parent=system_vault,
                name=str(dataroom.id)
            ).first()
            if storage_folder:
                descendants = storage_folder.get_descendants()
                folders_to_delete = [storage_folder] + descendants
                remaining_docs = Document.objects.filter(folder__in=folders_to_delete)
                if remaining_docs.exists():
                    remaining_docs.update(folder=system_vault)
                try:
                    Folder.objects.filter(id__in=[f.id for f in folders_to_delete]).delete()
                except Exception as e:
                    logger.exception("Failed to clean up v2 system vault folder for dataroom %s: %s", dataroom.id, e)

        # Legacy v1 uploads cleanup
        dataroom_uploads_query = Folder.objects.filter(
            organization=organization,
            parent=root_folder,
            name="Dataroom Uploads"
        )
        target_folder_name = get_dataroom_storage_folder_name(dataroom.name, dataroom)
        dataroom_folders = Folder.objects.filter(
            organization=organization,
            parent__in=dataroom_uploads_query,
            name=target_folder_name
        )
        for dataroom_folder in dataroom_folders:
            dataroom_uploads_folder = dataroom_folder.parent
            descendants = dataroom_folder.get_descendants()
            folders_to_check = [dataroom_folder] + descendants
            remaining_docs = Document.objects.filter(folder__in=folders_to_check)
            if remaining_docs.exists():
                remaining_docs.update(folder=dataroom_uploads_folder)
            try:
                Folder.objects.filter(id__in=[f.id for f in folders_to_check]).delete()
            except Exception as e:
                logger.exception("Failed to clean up v1 backing folder %s for dataroom %s: %s", dataroom_folder.id, dataroom.id, e)

    # 3. Delete the Dataroom record
    dataroom.delete()


def upgrade_dataroom_to_v2(dataroom: Dataroom) -> bool:
    """
    Upgrades a legacy (v1) Dataroom to modern (v2) System Storage Vault architecture:
    1. Creates/ensures '__datarooms__/<dataroom_id>' system vault folder.
    2. Moves any existing legacy backing subfolders & documents under 'Dataroom Uploads' to the vault.
    3. Cleans up empty legacy folders.
    4. Sets dataroom.storage_version = 2.
    """
    if dataroom.storage_version >= 2:
        return True

    organization = dataroom.organization
    root_folder = Folder.objects.get_root_for_org(organization)
    if not root_folder:
        return False

    with transaction.atomic():
        # 1. Ensure system vault folder
        system_vault, _ = Folder.objects.get_or_create(
            organization=organization,
            parent=root_folder,
            name="__datarooms__",
            defaults={'created_by': None}
        )
        vault_room_folder, _ = Folder.objects.get_or_create(
            organization=organization,
            parent=system_vault,
            name=str(dataroom.id),
            defaults={'created_by': None}
        )

        # 2. Locate legacy backing folders
        legacy_uploads = Folder.objects.filter(
            organization=organization,
            parent=root_folder,
            name="Dataroom Uploads"
        )
        legacy_name = get_dataroom_storage_folder_name(dataroom.name, dataroom)
        legacy_folders = list(Folder.objects.filter(
            organization=organization,
            parent__in=legacy_uploads,
            name=legacy_name
        ))

        # 3. Move direct contents into the system vault
        for old_folder in legacy_folders:
            # Move child documents
            Document.objects.filter(folder=old_folder).update(folder=vault_room_folder)
            # Move child subfolders
            Folder.objects.filter(parent=old_folder).update(parent=vault_room_folder)
            # Delete the empty legacy folder shell
            old_folder.delete()

        # 4. Mark storage_version as 2
        dataroom.storage_version = 2
        dataroom.save(update_fields=['storage_version', 'updated_at'])

    return True


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
    backing_docs_to_delete = []
    seen_doc_ids = set()

    for ddoc in ddocs_to_remove:
        doc = ddoc.document
        if not doc or doc.id in seen_doc_ids:
            continue
        seen_doc_ids.add(doc.id)

        if is_direct_upload_dataroom_document(ddoc):
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


def is_direct_upload_dataroom_document(ddoc: DataroomDocument) -> bool:
    """
    Determines if a DataroomDocument is a direct upload (vault-owned) vs linked from library.
    1. Fast path: If is_direct_upload is already explicitly set (True or False), returns immediately.
    2. Fallback path (Legacy records with is_direct_upload=None): Inspects ancestor folder hierarchy,
       and self-heals by saving the resolved boolean to DB.
    """
    if ddoc.is_direct_upload is not None:
        return ddoc.is_direct_upload

    doc = ddoc.document
    if not doc or not doc.folder_id:
        return False

    root_folder = Folder.objects.get_root_for_org(doc.organization)
    if not root_folder:
        return False

    storage_root_ids = set(Folder.objects.filter(
        organization=doc.organization,
        parent=root_folder,
        name__in=["__datarooms__", "Dataroom Uploads"]
    ).values_list('id', flat=True))

    curr = doc.folder
    is_direct = False
    while curr:
        if curr.id in storage_root_ids:
            is_direct = True
            break
        curr = curr.parent

    try:
        DataroomDocument.objects.filter(id=ddoc.id).update(is_direct_upload=is_direct)
        ddoc.is_direct_upload = is_direct
    except Exception:
        pass

    return is_direct


def sync_dataroom_rename(dataroom: Dataroom, old_name: str):
    """
    Synchronizes physical storage folders when a Dataroom is renamed:
    - v2 (Modern System Vault): No-op because storage folder is immutable '__datarooms__/<dataroom_id>/'.
    - v1 (Legacy User-Scoped): Renames legacy folders under 'Dataroom Uploads'.
    """
    if dataroom.storage_version >= 2 or dataroom.name == old_name:
        return

    organization = dataroom.organization
    root_folder = Folder.objects.get_root_for_org(organization)
    if not root_folder:
        return

    dataroom_uploads_folders = Folder.objects.filter(
        organization=organization,
        parent=root_folder,
        name="Dataroom Uploads"
    )
    old_storage_name = get_dataroom_storage_folder_name(old_name, dataroom)
    new_storage_name = get_dataroom_storage_folder_name(dataroom.name, dataroom)
    Folder.objects.filter(
        organization=organization,
        parent__in=dataroom_uploads_folders,
        name=old_storage_name
    ).update(name=new_storage_name)


def sync_dataroom_folder_rename(dfolder: DataroomFolder, old_name: str, new_name: str):
    """
    Synchronizes the backing physical Folder name when a visual DataroomFolder is renamed.
    """
    if not new_name or new_name == old_name:
        return

    dataroom = dfolder.dataroom
    organization = dataroom.organization
    root_folder = Folder.objects.get_root_for_org(organization)
    if not root_folder:
        return

    # Traverse up visual parent hierarchy
    names = []
    curr = dfolder.parent
    while curr:
        names.insert(0, curr.name)
        curr = curr.parent

    if dataroom.storage_version >= 2:
        path_names = ["__datarooms__", str(dataroom.id)] + names + [old_name]
    else:
        path_names = ["Dataroom Uploads", get_dataroom_storage_folder_name(dataroom.name, dataroom)] + names + [old_name]

    curr_folder = root_folder
    for name in path_names:
        curr_folder = Folder.objects.filter(
            organization=organization,
            parent=curr_folder,
            name=name
        ).first()
        if not curr_folder:
            break

    if curr_folder:
        curr_folder.name = new_name
        curr_folder.save(update_fields=['name'])


def sync_dataroom_document_rename(ddoc: DataroomDocument, new_name: str):
    """
    Synchronizes the backing physical Document name when a visual DataroomDocument is renamed,
    if the document was a direct upload in a Dataroom storage vault.
    """
    if not new_name or not ddoc.document:
        return

    if is_direct_upload_dataroom_document(ddoc):
        ddoc.document.name = new_name
        ddoc.document.save(update_fields=['name'])

