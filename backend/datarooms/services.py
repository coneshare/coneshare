import logging
import os
from pathlib import Path
from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from core.models import User
from documents.models import Folder, Document
from documents.services import (
    delete_document_and_files, _get_unique_document_name, _get_unique_folder_name,
    recalculate_user_document_size
)

from .models import Dataroom, DataroomDocument, DataroomFolder
from .utils import get_dataroom_storage_folder_name

logger = logging.getLogger(__name__)


def touch_dataroom(dataroom_or_id: Dataroom | str | None, now=None):
    """
    Updates the modification timestamp (updated_at) for the given Dataroom.
    Uses a direct update query to avoid signal cascades or overhead.
    """
    if not dataroom_or_id:
        return
    now = now or timezone.now()
    dataroom_id = getattr(dataroom_or_id, 'id', dataroom_or_id)
    Dataroom.objects.filter(id=dataroom_id).update(updated_at=now)


def touch_dataroom_folder_ancestors(folder: DataroomFolder | None, touch_room: bool = True):
    """
    Updates the modification timestamp (updated_at) for the given DataroomFolder,
    all its ancestor folders up to the root, and the parent Dataroom in a single batch UPDATE query.
    """
    if not folder:
        return
    now = timezone.now()
    ancestor_ids = []
    visited = set()
    current: DataroomFolder | None = folder
    dataroom_id = getattr(folder, 'dataroom_id', None)
    while current and current.id not in visited:
        visited.add(current.id)
        ancestor_ids.append(current.id)
        if not dataroom_id and hasattr(current, 'dataroom_id'):
            dataroom_id = current.dataroom_id
        current = current.parent
    if ancestor_ids:
        DataroomFolder.objects.filter(id__in=ancestor_ids).update(updated_at=now)
    if touch_room and dataroom_id:
        touch_dataroom(dataroom_id, now=now)


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
        if dataroom.vault_folder:
            dataroom_folder = dataroom.vault_folder
        else:
            system_vault, _ = Folder.objects.get_or_create(
                organization=organization,
                parent=root_folder,
                name="__datarooms__",
                created_by=None,
                folder_type=Folder.FOLDER_TYPE_VAULT,
            )
            dataroom_folder, _ = Folder.objects.get_or_create(
                organization=organization,
                parent=system_vault,
                name=str(dataroom.id),
                created_by=None,
                folder_type=Folder.FOLDER_TYPE_VAULT,
            )
            dataroom.vault_folder = dataroom_folder
            dataroom.save(update_fields=['vault_folder'])

        current_folder = dataroom_folder

        if relative_path:
            folder_path, _ = os.path.split(relative_path)
            if folder_path:
                path_parts = Path(folder_path).parts
                for part in path_parts:
                    current_folder, _ = Folder.get_or_create_vault_subfolder(
                        organization=organization,
                        parent=current_folder,
                        name=part,
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
        storage_folder = dataroom.vault_folder
        system_vault = None
        if not storage_folder:
            system_vault = Folder.objects.filter(
                organization=organization,
                parent=root_folder,
                name="__datarooms__",
                folder_type=Folder.FOLDER_TYPE_VAULT,
            ).first()
            if system_vault:
                storage_folder = Folder.objects.filter(
                    organization=organization,
                    parent=system_vault,
                    name=str(dataroom.id),
                    folder_type=Folder.FOLDER_TYPE_VAULT,
                ).first()
        else:
            system_vault = storage_folder.parent

        if storage_folder:
            descendants = storage_folder.get_descendants()
            folders_to_delete = [storage_folder] + descendants

            # When remove_dataroom_content() ran above, it preserved backing documents that
            # are still referenced by other datarooms. Because Document.folder cascades on
            # delete, deleting storage_folder or its subfolders would destroy those surviving
            # shared documents. We must relocate them up to the parent system_vault first.
            #
            # Note: Documents from different subfolders may share the same name (or collide
            # with existing vault docs). Relocate them individually with _get_unique_document_name
            # to satisfy the unique_active_document_name (created_by, folder, name) constraint
            # and avoid IntegrityError 500 crashes.
            remaining_docs = list(
                Document.objects.filter(folder__in=folders_to_delete).select_related('created_by')
            )
            for doc in remaining_docs:
                unique_name = _get_unique_document_name(doc.created_by, system_vault, doc.name)
                doc.name = unique_name
                doc.folder = system_vault
                doc.save(update_fields=['name', 'folder'])
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

            # Relocate surviving shared documents to parent 'Dataroom Uploads' with unique names
            # before deleting the legacy folder tree.
            remaining_docs = list(
                Document.objects.filter(folder__in=folders_to_check).select_related('created_by')
            )
            for doc in remaining_docs:
                unique_name = _get_unique_document_name(doc.created_by, dataroom_uploads_folder, doc.name)
                doc.name = unique_name
                doc.folder = dataroom_uploads_folder
                doc.save(update_fields=['name', 'folder'])
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
        locked_dataroom = Dataroom.objects.select_for_update().get(id=dataroom.id)
        if locked_dataroom.storage_version >= 2:
            dataroom.storage_version = locked_dataroom.storage_version
            return True

        # 1. Ensure system vault folder
        system_vault, _ = Folder.objects.get_or_create(
            organization=organization,
            parent=root_folder,
            name="__datarooms__",
            created_by=None,
            folder_type=Folder.FOLDER_TYPE_VAULT,
        )
        vault_room_folder, _ = Folder.objects.get_or_create(
            organization=organization,
            parent=system_vault,
            name=str(dataroom.id),
            created_by=None,
            folder_type=Folder.FOLDER_TYPE_VAULT,
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
        affected_users = set()
        if locked_dataroom.created_by:
            affected_users.add(locked_dataroom.created_by)

        for old_folder in legacy_folders:
            all_descendants = old_folder.get_descendants()
            all_folder_ids = [old_folder.id] + [f.id for f in all_descendants]
            for creator in User.objects.filter(documents_created__folder_id__in=all_folder_ids).distinct():
                affected_users.add(creator)

            # Move child documents individually, ensuring unique names in vault_room_folder
            child_docs = list(Document.objects.filter(folder=old_folder).select_related('created_by'))
            for doc in child_docs:
                unique_name = _get_unique_document_name(doc.created_by, vault_room_folder, doc.name)
                doc.name = unique_name
                doc.folder = vault_room_folder
                doc.save(update_fields=['name', 'folder'])

            # Move child subfolders individually, ensuring unique names in vault_room_folder
            child_folders = list(Folder.objects.filter(parent=old_folder).select_related('created_by'))
            for subf in child_folders:
                unique_folder_name = _get_unique_folder_name(None, vault_room_folder, subf.name)
                subf.name = unique_folder_name
                subf.parent = vault_room_folder
                subf.folder_type = Folder.FOLDER_TYPE_VAULT
                subf.created_by = None
                subf.save(update_fields=['name', 'parent', 'created_by', 'folder_type'])

            # Ensure all deeper descendant folders also adhere to vault invariant
            deeper_descendant_ids = [f.id for f in all_descendants if f.parent_id != old_folder.id]
            if deeper_descendant_ids:
                Folder.objects.filter(id__in=deeper_descendant_ids).update(
                    folder_type=Folder.FOLDER_TYPE_VAULT,
                    created_by=None,
                )

            # Delete the empty legacy folder shell
            old_folder.delete()

        # 4. Mark storage_version as 2 and link vault_folder
        locked_dataroom.storage_version = 2
        locked_dataroom.vault_folder = vault_room_folder
        locked_dataroom.save(update_fields=['storage_version', 'vault_folder', 'updated_at'])
        dataroom.storage_version = 2
        dataroom.vault_folder = vault_room_folder

        # 5. Automatically free personal quota for uploaders whose legacy documents moved to the vault
        for u in affected_users:
            recalculate_user_document_size(u)

    return True


def remove_dataroom_content(dataroom: Dataroom, dataroom_doc_ids: list = None, dataroom_folder_ids: list = None):
    """
    Explicitly removes documents and folders from a Dataroom:
    1. Recursively expands all descendant folder IDs within the specified dataroom_folder_ids.
    2. Collects all DataroomDocument associations being deleted (supporting both DataroomDocument.id
       and backing Document.id matching, as well as documents contained in deleted folders).
    3. Identifies direct-upload documents that have no remaining references across any datarooms.
       Evaluates all selected associations per Document to prevent order-dependent skips, and marks
       the backing Document and storage files for physical deletion.
    4. Deletes DataroomDocument and DataroomFolder records, and cleans up backing storage/files for
       surviving unreferenced direct-upload documents.
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
    # Allow dataroom_doc_ids to match either DataroomDocument.id or workspace Document.id
    ddocs_to_remove = list(
        DataroomDocument.objects.filter(
            Q(id__in=dataroom_doc_ids) | Q(document_id__in=dataroom_doc_ids) | Q(folder_id__in=all_folder_ids),
            dataroom=dataroom
        ).select_related('document', 'document__folder', 'folder')
    )
    ddoc_ids_to_remove = {d.id for d in ddocs_to_remove}

    # 3. Identify direct upload documents that have no other references
    # A single Document may have multiple DataroomDocument associations in the same dataroom
    # (e.g. directly uploaded to a subfolder and also imported or linked elsewhere via API/legacy).
    # We group all associations by backing Document and check whether ANY association in the group
    # represents a direct upload. This eliminates order-dependent skipping (which occurred when an
    # arbitrary seen_doc_ids loop encountered a linked association before a direct-upload association)
    # and ensures physical storage files are reliably reclaimed whenever all references to a direct
    # upload are removed.
    backing_docs_to_delete = []
    docs_to_ddocs: dict[Document, list[DataroomDocument]] = {}
    for ddoc in ddocs_to_remove:
        if ddoc.document:
            docs_to_ddocs.setdefault(ddoc.document, []).append(ddoc)

    for doc, ddocs in docs_to_ddocs.items():
        if any(is_direct_upload_dataroom_document(d) for d in ddocs):
            # Check if this backing document is still referenced by any surviving DataroomDocument
            # (either in this dataroom or other datarooms) that is NOT being removed.
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
        if ddoc_ids_to_remove:
            DataroomDocument.objects.filter(id__in=ddoc_ids_to_remove, dataroom=dataroom).delete()
        if dataroom_folder_ids:
            DataroomFolder.objects.filter(id__in=dataroom_folder_ids, dataroom=dataroom).delete()
        for parent_folder in parent_folders_to_touch:
            touch_dataroom_folder_ancestors(parent_folder, touch_room=False)
        touch_dataroom(dataroom)

    # Delete backing documents and storage files for direct uploads with no other references (non-blocking)
    is_vault = (dataroom.storage_version >= 2)
    for doc in backing_docs_to_delete:
        try:
            delete_document_and_files(doc, is_vault=is_vault)
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

    if doc.folder and doc.folder.folder_type == Folder.FOLDER_TYPE_VAULT:
        is_direct = True
    else:
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
    except Exception as e:
        logger.warning(
            "Failed to self-heal is_direct_upload for DataroomDocument %s: %s",
            ddoc.id,
            e,
        )

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
    names: list[str] = []
    curr = dfolder.parent
    while curr:
        names.insert(0, curr.name)
        curr = curr.parent

    if dataroom.storage_version >= 2:
        if dataroom.vault_folder:
            curr_folder = dataroom.vault_folder
            path_names = names + [old_name]
        else:
            path_names = ["__datarooms__", str(dataroom.id)] + names + [old_name]
            curr_folder = root_folder
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
    Guards against IntegrityError from unique_active_document_name constraint.
    """
    if not new_name or not ddoc.document:
        return

    if is_direct_upload_dataroom_document(ddoc):
        doc = ddoc.document
        target_name = _get_unique_document_name(doc.created_by, doc.folder, new_name)
        if doc.name != target_name:
            doc.name = target_name
            try:
                doc.save(update_fields=['name'])
            except Exception as e:
                logger.warning("Failed to rename physical backing document %s: %s", doc.id, e)


def get_dataroom_storage_used_bytes(dataroom: Dataroom) -> int:
    """
    Calculates total storage used by unique active documents in a dataroom.
    Guarantees that a document linked into multiple folders is counted only once.
    """
    doc_ids = DataroomDocument.objects.filter(
        dataroom=dataroom
    ).values_list('document_id', flat=True)

    return Document.objects.filter(
        id__in=doc_ids,
        deleted_at__isnull=True
    ).aggregate(total=Sum('file_size'))['total'] or 0

