import logging
import os
from pathlib import Path
from typing import Any
from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from backend.utils import get_unique_name
from core.models import User
from documents.models import Folder, Document
from documents.services import (
    QuotaExceededError,
    delete_document_and_files,
    _get_unique_document_name,
    _get_unique_folder_name,
    recalculate_user_document_size,
)
from sharelinks.models import ShareLinkDataroomSetting

from .models import Dataroom, DataroomDocument, DataroomFolder, DataroomItemOrder
from .utils import get_dataroom_storage_folder_name, is_dataroom_collaborator_or_above

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


def get_dataroom_queryset_for_user(user):
    """
    Returns the queryset of datarooms accessible to a given user:
    - If user is an org admin: all datarooms in their organization.
    - Otherwise: datarooms created by the user OR where the user is a collaborator.
    """
    if getattr(user, 'role', '') == 'admin':
        return Dataroom.objects.filter(organization=user.organization)
    return Dataroom.objects.filter(
        Q(created_by=user) | Q(collaborators__user=user),
        organization=user.organization
    ).distinct()


def scope_has_item_order_rows(dataroom: Dataroom, parent_folder: DataroomFolder | None) -> bool:
    return DataroomItemOrder.objects.filter(dataroom=dataroom, parent_folder=parent_folder).exists()


def append_item_order(
    dataroom: Dataroom,
    parent_folder: DataroomFolder | None,
    item_type: str,
    folder: DataroomFolder | None = None,
    dataroom_document: DataroomDocument | None = None,
):
    current_max = (
        DataroomItemOrder.objects.filter(dataroom=dataroom, parent_folder=parent_folder)
        .order_by('-position')
        .values_list('position', flat=True)
        .first()
    )
    next_position = (current_max + 1) if current_max is not None else 0
    DataroomItemOrder.objects.create(
        dataroom=dataroom,
        parent_folder=parent_folder,
        item_type=item_type,
        folder=folder,
        dataroom_document=dataroom_document,
        position=next_position,
    )


def get_unique_dataroom_folder_name(dataroom: Dataroom, parent_folder: DataroomFolder | None, original_name: str) -> str:
    return get_unique_name(
        DataroomFolder,
        original_name,
        {'dataroom': dataroom, 'parent': parent_folder},
        has_extension=False,
    )


def get_unique_dataroom_document_name(dataroom: Dataroom, parent_folder: DataroomFolder | None, original_name: str) -> str:
    return get_unique_name(
        DataroomDocument,
        original_name,
        {'dataroom': dataroom, 'folder': parent_folder},
        has_extension=True,
    )


def collect_subtree_active_document_ids(source_folder: Folder, owner_user) -> set:
    """Collect active document IDs under source_folder (inclusive) owned by owner_user."""
    collected = set()
    stack = [source_folder]
    visited = set()
    while stack:
        curr = stack.pop()
        if not curr or curr.id in visited:
            continue
        visited.add(curr.id)
        collected.update(
            curr.documents.active().filter(created_by=owner_user).values_list('id', flat=True)
        )
        stack.extend(list(curr.children.active().filter(created_by=owner_user)))
    return collected


def _merge_link_setting_flags(
    target_map: dict,
    item_key,
    share_link_id,
    is_visible: bool,
    allow_download: bool,
    enable_watermark: bool,
) -> None:
    if not item_key:
        return
    per_link = target_map.setdefault(item_key, {})
    existing = per_link.get(share_link_id)
    if existing is None:
        per_link[share_link_id] = {
            'is_visible': is_visible,
            'allow_download': allow_download,
            'enable_watermark': enable_watermark,
        }
    else:
        existing['is_visible'] = existing['is_visible'] and is_visible
        existing['allow_download'] = existing['allow_download'] and allow_download
        existing['enable_watermark'] = existing['enable_watermark'] or enable_watermark


def _snapshot_and_delete_synced_docs(stale_docs_qs, preserved_doc_settings: dict | None) -> int:
    stale_pairs = list(stale_docs_qs.values_list('id', 'document_id'))
    if not stale_pairs:
        return 0
    stale_id_to_doc_id = dict(stale_pairs)
    if preserved_doc_settings is not None:
        rows = ShareLinkDataroomSetting.objects.filter(
            dataroom_document_id__in=stale_id_to_doc_id.keys()
        ).values_list(
            'dataroom_document_id',
            'share_link_id',
            'is_visible',
            'allow_download',
            'enable_watermark',
        )
        for ddoc_id, share_link_id, is_visible, allow_download, enable_watermark in rows:
            _merge_link_setting_flags(
                preserved_doc_settings,
                stale_id_to_doc_id.get(ddoc_id),
                share_link_id,
                is_visible,
                allow_download,
                enable_watermark,
            )
    _, deleted_counts = DataroomDocument.objects.filter(id__in=stale_id_to_doc_id.keys()).delete()
    return deleted_counts.get(DataroomDocument._meta.label, 0)


def _snapshot_folder_link_settings(stale_folder: DataroomFolder, preserved_folder_settings: dict | None) -> None:
    if preserved_folder_settings is None or not stale_folder.source_folder_id:
        return
    rows = ShareLinkDataroomSetting.objects.filter(
        dataroom_folder=stale_folder
    ).values_list('share_link_id', 'is_visible', 'allow_download', 'enable_watermark')
    for share_link_id, is_visible, allow_download, enable_watermark in rows:
        _merge_link_setting_flags(
            preserved_folder_settings,
            stale_folder.source_folder_id,
            share_link_id,
            is_visible,
            allow_download,
            enable_watermark,
        )


def _apply_preserved_link_settings(
    preserved_by_link: dict | None,
    *,
    dataroom_document: DataroomDocument | None = None,
    dataroom_folder: DataroomFolder | None = None,
) -> None:
    if not preserved_by_link:
        return
    qs = ShareLinkDataroomSetting.objects.filter(
        share_link_id__in=preserved_by_link.keys(),
        dataroom_document=dataroom_document,
        dataroom_folder=dataroom_folder,
    )
    for setting in qs:
        old = preserved_by_link.get(setting.share_link_id)
        if not old:
            continue
        merged_visible = setting.is_visible and old['is_visible']
        merged_download = setting.allow_download and old['allow_download']
        merged_watermark = setting.enable_watermark or old['enable_watermark']
        if (
            merged_visible != setting.is_visible
            or merged_download != setting.allow_download
            or merged_watermark != setting.enable_watermark
        ):
            setting.is_visible = merged_visible
            setting.allow_download = merged_download
            setting.enable_watermark = merged_watermark
            setting.save(update_fields=['is_visible', 'allow_download', 'enable_watermark', 'updated_at'])


def _populate_dataroom_folder_contents(
    dataroom: Dataroom,
    dataroom_folder: DataroomFolder,
    source_folder: Folder,
    requesting_user,
    sync_enabled: bool = False,
    now=None,
    preserved_settings: dict | None = None,
) -> dict[str, int]:
    """
    Populates missing active documents and subfolders from source_folder into dataroom_folder.
    When sync_enabled=True, newly created folders and documents are marked synced.
    """
    now = now or timezone.now()
    stats = {'added_folders': 0, 'added_documents': 0}

    existing_doc_ids = set(
        DataroomDocument.objects.filter(
            dataroom=dataroom,
            folder=dataroom_folder,
        ).values_list('document_id', flat=True)
    )
    track_order = scope_has_item_order_rows(dataroom, dataroom_folder)

    for doc in source_folder.documents.active().filter(created_by=requesting_user).order_by('created_at', 'id'):
        if doc.id in existing_doc_ids:
            continue
        unique_name = get_unique_dataroom_document_name(dataroom, dataroom_folder, doc.name)
        created_doc = DataroomDocument.objects.create(
            dataroom=dataroom,
            document=doc,
            folder=dataroom_folder,
            name=unique_name,
            is_direct_upload=False,
            is_synced=sync_enabled,
        )
        if preserved_settings:
            _apply_preserved_link_settings(
                preserved_settings['documents'].get(doc.id),
                dataroom_document=created_doc,
            )
        existing_doc_ids.add(doc.id)
        stats['added_documents'] += 1
        if track_order:
            append_item_order(
                dataroom=dataroom,
                parent_folder=dataroom_folder,
                item_type=DataroomItemOrder.ITEM_TYPE_DOCUMENT,
                dataroom_document=created_doc,
            )

    existing_synced_children = {}
    if sync_enabled:
        existing_synced_children = {
            cf.source_folder_id: cf
            for cf in DataroomFolder.objects.filter(
                dataroom=dataroom,
                parent=dataroom_folder,
                is_synced=True,
                source_folder__isnull=False,
            ).order_by('created_at', 'id')
        }

    for subfolder in source_folder.children.active().filter(created_by=requesting_user).order_by('created_at', 'id'):
        child_dfolder = existing_synced_children.get(subfolder.id) if sync_enabled else None
        if child_dfolder is None:
            folder_name = get_unique_dataroom_folder_name(dataroom, dataroom_folder, subfolder.name)
            child_dfolder = DataroomFolder.objects.create(
                dataroom=dataroom,
                name=folder_name,
                parent=dataroom_folder,
                created_by=requesting_user or getattr(subfolder, 'created_by', None) or dataroom.created_by,
                source_folder=subfolder if sync_enabled else None,
                is_synced=sync_enabled,
                last_synced_at=now if sync_enabled else None,
            )
            if preserved_settings:
                _apply_preserved_link_settings(
                    preserved_settings['folders'].get(subfolder.id),
                    dataroom_folder=child_dfolder,
                )
            stats['added_folders'] += 1
            if track_order:
                append_item_order(
                    dataroom=dataroom,
                    parent_folder=dataroom_folder,
                    item_type=DataroomItemOrder.ITEM_TYPE_FOLDER,
                    folder=child_dfolder,
                )
        elif sync_enabled:
            DataroomFolder.objects.filter(id=child_dfolder.id).update(last_synced_at=now, updated_at=now)

        sub_stats = _populate_dataroom_folder_contents(
            dataroom=dataroom,
            dataroom_folder=child_dfolder,
            source_folder=subfolder,
            requesting_user=requesting_user,
            sync_enabled=sync_enabled,
            now=now,
            preserved_settings=preserved_settings,
        )
        stats['added_folders'] += sub_stats['added_folders']
        stats['added_documents'] += sub_stats['added_documents']

    return stats


def replicate_folder_to_dataroom(
    dataroom: Dataroom,
    source_folder: Folder,
    parent_dataroom_folder: DataroomFolder | None,
    requesting_user,
    sync_enabled: bool = False,
    now=None,
) -> DataroomFolder:
    """
    Replicates a personal workspace folder and its active contents into a Dataroom.
    """
    now = now or timezone.now()
    folder_name = (
        get_unique_dataroom_folder_name(dataroom, parent_dataroom_folder, source_folder.name)
        if sync_enabled
        else source_folder.name
    )
    new_dataroom_folder = DataroomFolder.objects.create(
        dataroom=dataroom,
        name=folder_name,
        parent=parent_dataroom_folder,
        created_by=requesting_user or getattr(source_folder, 'created_by', None) or dataroom.created_by,
        source_folder=source_folder if sync_enabled else None,
        is_synced=sync_enabled,
        last_synced_at=now if sync_enabled else None,
    )
    if scope_has_item_order_rows(dataroom, parent_dataroom_folder):
        append_item_order(
            dataroom=dataroom,
            parent_folder=parent_dataroom_folder,
            item_type=DataroomItemOrder.ITEM_TYPE_FOLDER,
            folder=new_dataroom_folder,
        )

    _populate_dataroom_folder_contents(
        dataroom=dataroom,
        dataroom_folder=new_dataroom_folder,
        source_folder=source_folder,
        requesting_user=requesting_user,
        sync_enabled=sync_enabled,
        now=now,
    )
    return new_dataroom_folder


def _prune_stale_synced_subtree(
    dataroom: Dataroom,
    stale_folder: DataroomFolder,
    preserved_settings: dict | None = None,
) -> dict[str, int]:
    """
    Recursively prunes synced entries from a stale subfolder that no longer exists in source_folder.
    Preserves any local/direct-upload or manually-added items and detaches folders containing them.
    """
    stats = {'removed_folders': 0, 'removed_documents': 0}

    for child in list(stale_folder.children.all()):
        if child.is_synced:
            child_stats = _prune_stale_synced_subtree(
                dataroom,
                child,
                preserved_settings=preserved_settings,
            )
            stats['removed_folders'] += child_stats['removed_folders']
            stats['removed_documents'] += child_stats['removed_documents']

    stale_docs_qs = DataroomDocument.objects.filter(
        dataroom=dataroom,
        folder=stale_folder,
        is_synced=True,
        is_direct_upload=False,
    )
    stats['removed_documents'] += _snapshot_and_delete_synced_docs(
        stale_docs_qs,
        preserved_settings['documents'] if preserved_settings is not None else None,
    )

    _snapshot_folder_link_settings(
        stale_folder,
        preserved_settings['folders'] if preserved_settings is not None else None,
    )

    has_remaining_items = (
        DataroomDocument.objects.filter(dataroom=dataroom, folder=stale_folder).exists()
        or DataroomFolder.objects.filter(dataroom=dataroom, parent=stale_folder).exists()
    )
    if not has_remaining_items:
        stale_folder.delete()
        stats['removed_folders'] += 1
    else:
        DataroomFolder.objects.filter(id=stale_folder.id).update(
            is_synced=False,
            source_folder=None,
            last_synced_at=None,
        )

    return stats


def _prune_dataroom_folder_against_source(
    dataroom: Dataroom,
    dataroom_folder: DataroomFolder,
    source_folder: Folder,
    requesting_user,
    preserved_settings: dict | None = None,
) -> dict[str, int]:
    """
    Prunes stale synced documents and subfolders under dataroom_folder against source_folder.
    """
    stats = {'removed_folders': 0, 'removed_documents': 0}

    active_doc_ids = set(
        source_folder.documents.active().filter(created_by=requesting_user).values_list('id', flat=True)
    )
    stale_docs_qs = (
        DataroomDocument.objects.filter(
            dataroom=dataroom,
            folder=dataroom_folder,
            is_synced=True,
            is_direct_upload=False,
        )
        .exclude(document_id__in=active_doc_ids)
    )
    stats['removed_documents'] += _snapshot_and_delete_synced_docs(
        stale_docs_qs,
        preserved_settings['documents'] if preserved_settings is not None else None,
    )

    active_subfolders_by_id = {
        sf.id: sf for sf in source_folder.children.active().filter(created_by=requesting_user)
    }
    matched_source_ids = set()
    for child_dfolder in list(
        DataroomFolder.objects.filter(dataroom=dataroom, parent=dataroom_folder, is_synced=True).order_by('created_at', 'id')
    ):
        source_sub = active_subfolders_by_id.get(child_dfolder.source_folder_id)
        if source_sub is not None and source_sub.id not in matched_source_ids:
            matched_source_ids.add(source_sub.id)
            child_stats = _prune_dataroom_folder_against_source(
                dataroom=dataroom,
                dataroom_folder=child_dfolder,
                source_folder=source_sub,
                requesting_user=requesting_user,
                preserved_settings=preserved_settings,
            )
            stats['removed_folders'] += child_stats['removed_folders']
            stats['removed_documents'] += child_stats['removed_documents']
        else:
            prune_stats = _prune_stale_synced_subtree(
                dataroom,
                child_dfolder,
                preserved_settings=preserved_settings,
            )
            stats['removed_folders'] += prune_stats['removed_folders']
            stats['removed_documents'] += prune_stats['removed_documents']

    return stats


def check_dataroom_quota_for_documents(
    dataroom: Dataroom,
    desired_doc_ids: set,
    action_label: str = "Syncing this folder",
) -> None:
    """
    Validates dataroom storage quota against desired document additions.
    Must be called under a Dataroom row lock inside an atomic transaction.
    Raises QuotaExceededError if additions exceed dataroom.storage_quota_mb.
    """
    if not (dataroom.storage_quota_mb and dataroom.storage_quota_mb > 0) or not desired_doc_ids:
        return

    existing_doc_ids = set(
        DataroomDocument.objects.filter(dataroom=dataroom).values_list('document_id', flat=True)
    )
    unique_added_ids = desired_doc_ids - existing_doc_ids
    additional_bytes = (
        Document.objects.filter(id__in=unique_added_ids, deleted_at__isnull=True)
        .aggregate(total=Sum('file_size'))['total']
        or 0
    )
    current_usage = get_dataroom_storage_used_bytes(dataroom)
    room_quota_bytes = dataroom.storage_quota_mb * 1024 * 1024
    if current_usage + additional_bytes > room_quota_bytes:
        raise QuotaExceededError(
            f"{action_label} would exceed the Dataroom storage limit of {dataroom.storage_quota_mb} MB."
        )


def get_synced_datarooms_map_for_folders(folders, user) -> dict[str, list[dict]]:
    """
    Batch-resolves synced DataroomFolder references for a collection of source Folders,
    scoped to Datarooms currently accessible to `user`, with zero N+1 path queries.
    """
    folder_ids = [
        f.id for f in folders
        if f is not None and getattr(f, 'deleted_at', None) is None
    ]
    if not folder_ids or not user or not user.is_authenticated:
        return {}

    accessible_datarooms = get_dataroom_queryset_for_user(user)
    linked_folders = list(
        DataroomFolder.objects.filter(
            source_folder_id__in=folder_ids,
            is_synced=True,
            dataroom__in=accessible_datarooms,
        )
        .select_related('dataroom')
        .order_by('dataroom__name', 'name', 'id')
    )
    if not linked_folders:
        return {}

    dataroom_ids = {df.dataroom_id for df in linked_folders}
    nodes_by_room: dict[str, dict[str, dict[str, Any]]] = {}
    for row in DataroomFolder.objects.filter(dataroom_id__in=dataroom_ids).values(
        'id', 'name', 'parent_id', 'dataroom_id'
    ):
        nodes_by_room.setdefault(str(row['dataroom_id']), {})[str(row['id'])] = {
            'id': row['id'],
            'name': row['name'],
            'parent_id': row['parent_id'],
        }

    result_map: dict[str, list[dict]] = {}
    for df in linked_folders:
        room_nodes = nodes_by_room.get(str(df.dataroom_id), {})
        parts = []
        visited = set()
        curr_id: str | None = str(df.id)
        while curr_id and curr_id not in visited:
            node = room_nodes.get(curr_id)
            if not node:
                break
            visited.add(curr_id)
            parts.append(node['name'])
            parent_id = node.get('parent_id')
            curr_id = str(parent_id) if parent_id else None
        parts.reverse()
        path_str = '/' + '/'.join(parts) if parts else f'/{df.name}'

        result_map.setdefault(str(df.source_folder_id), []).append({
            'dataroom_id': str(df.dataroom_id),
            'dataroom_name': df.dataroom.name,
            'dataroom_folder_id': str(df.id),
            'dataroom_folder_path': path_str,
            'last_synced_at': df.last_synced_at.isoformat() if df.last_synced_at else None,
        })

    return result_map


def sync_source_folder_to_datarooms(
    source_folder: Folder,
    user,
    dataroom_folder_ids: list[str] | None = None,
) -> dict:
    """
    Pushes changes from an active personal Folder to all or selected linked DataroomFolders.
    Locks target Datarooms in deterministic ID order and isolates failures per Dataroom.
    """
    accessible_datarooms = get_dataroom_queryset_for_user(user)
    linked_qs = (
        DataroomFolder.objects.filter(
            source_folder=source_folder,
            is_synced=True,
            dataroom__in=accessible_datarooms,
        )
        .select_related('dataroom')
        .order_by('dataroom_id', 'created_at', 'id')
    )

    if dataroom_folder_ids is not None:
        requested_ids = list(dict.fromkeys(str(fid) for fid in dataroom_folder_ids if fid))
        if not requested_ids:
            raise ValueError("At least one dataroom folder must be selected.")
        targets = list(linked_qs.filter(id__in=requested_ids))
        if len(targets) != len(requested_ids):
            raise ValueError("One or more selected dataroom folders are not linked to this folder or are inaccessible.")
    else:
        targets = list(linked_qs)

    if not targets:
        return {
            'synced_count': 0,
            'failed_count': 0,
            'results': [],
        }

    targets_by_room: dict[str, list[DataroomFolder]] = {}
    for df in targets:
        targets_by_room.setdefault(str(df.dataroom_id), []).append(df)

    results = []
    synced_count = 0
    failed_count = 0

    for dataroom_id in sorted(targets_by_room.keys()):
        room_targets = targets_by_room[dataroom_id]
        room_results = []
        try:
            with transaction.atomic():
                locked_dataroom = (
                    Dataroom.objects.select_for_update()
                    .prefetch_related('collaborators')
                    .get(id=dataroom_id)
                )
                now = timezone.now()
                if not is_dataroom_collaborator_or_above(user, locked_dataroom):
                    continue

                fresh_targets = []
                for target_df in room_targets:
                    fresh_df = (
                        DataroomFolder.objects.filter(
                            id=target_df.id,
                            dataroom=locked_dataroom,
                            source_folder=source_folder,
                            is_synced=True,
                        )
                        .select_related('parent')
                        .first()
                    )
                    if fresh_df:
                        fresh_targets.append(fresh_df)

                if not fresh_targets:
                    continue

                # 1. Prune all selected targets in the room first so shared net storage delta is accurate,
                #    capturing item-level share-link restrictions for documents/subfolders moved within the tree.
                prune_stats_by_id = {}
                preserved_settings_by_id: dict[str, dict[str, dict[Any, Any]]] = {}
                for fresh_df in fresh_targets:
                    preserved: dict[str, dict[Any, Any]] = {'documents': {}, 'folders': {}}
                    preserved_settings_by_id[str(fresh_df.id)] = preserved
                    prune_stats_by_id[str(fresh_df.id)] = _prune_dataroom_folder_against_source(
                        dataroom=locked_dataroom,
                        dataroom_folder=fresh_df,
                        source_folder=source_folder,
                        requesting_user=user,
                        preserved_settings=preserved,
                    )

                # 2. Enforce Dataroom storage quota once against combined projected additions.
                if locked_dataroom.storage_quota_mb and locked_dataroom.storage_quota_mb > 0:
                    desired_doc_ids = collect_subtree_active_document_ids(source_folder, user)
                    check_dataroom_quota_for_documents(locked_dataroom, desired_doc_ids)

                # 3. Populate all selected targets in the room.
                for fresh_df in fresh_targets:
                    add_stats = _populate_dataroom_folder_contents(
                        dataroom=locked_dataroom,
                        dataroom_folder=fresh_df,
                        source_folder=source_folder,
                        requesting_user=user,
                        sync_enabled=True,
                        now=now,
                        preserved_settings=preserved_settings_by_id[str(fresh_df.id)],
                    )
                    DataroomFolder.objects.filter(id=fresh_df.id).update(last_synced_at=now, updated_at=now)
                    touch_dataroom_folder_ancestors(fresh_df)
                    prune_stats = prune_stats_by_id[str(fresh_df.id)]
                    room_results.append({
                        'dataroom_id': str(locked_dataroom.id),
                        'dataroom_name': locked_dataroom.name,
                        'dataroom_folder_id': str(fresh_df.id),
                        'status': 'synced',
                        'last_synced_at': now.isoformat(),
                        'added_folders': add_stats['added_folders'],
                        'added_documents': add_stats['added_documents'],
                        'removed_folders': prune_stats['removed_folders'],
                        'removed_documents': prune_stats['removed_documents'],
                    })
            results.extend(room_results)
            synced_count += len(room_results)
        except QuotaExceededError as e:
            for target_df in room_targets:
                failed_count += 1
                results.append({
                    'dataroom_id': str(target_df.dataroom_id),
                    'dataroom_name': target_df.dataroom.name,
                    'dataroom_folder_id': str(target_df.id),
                    'status': 'error',
                    'detail': str(e),
                })

    return {
        'synced_count': synced_count,
        'failed_count': failed_count,
        'results': results,
    }


def folder_has_synced_ancestor(folder: DataroomFolder | None) -> bool:
    """Returns True if `folder` or any of its ancestors is marked `is_synced`."""
    visited = set()
    curr = folder
    while curr is not None and curr.id not in visited:
        visited.add(curr.id)
        if curr.is_synced:
            return True
        curr = curr.parent
    return False


def folder_has_synced_descendant(folder: DataroomFolder) -> bool:
    """Returns True if `folder` or any descendant folder is marked `is_synced`."""
    if folder.is_synced:
        return True
    queue = [folder.id]
    visited = {folder.id}
    while queue:
        children = list(
            DataroomFolder.objects.filter(dataroom_id=folder.dataroom_id, parent_id__in=queue)
            .values_list('id', 'is_synced')
        )
        next_queue = []
        for cid, child_is_synced in children:
            if child_is_synced:
                return True
            if cid not in visited:
                visited.add(cid)
                next_queue.append(cid)
        queue = next_queue
    return False


def _raise_reparent_validation_error(message: str, error_field: str | None = None) -> None:
    raise ValidationError({error_field: message} if error_field else message)


def validate_dataroom_folder_reparent(
    folder: DataroomFolder,
    new_parent: DataroomFolder | None,
    *,
    dest_has_synced_ancestor: bool | None = None,
    error_field: str | None = None,
) -> None:
    """
    Validates hierarchy cycle and synced-tree isolation rules before changing a folder's parent.
    """
    if new_parent is not None:
        if str(new_parent.id) == str(folder.id):
            msg = "A folder cannot be its own parent." if error_field else "Cannot move a folder into itself."
            _raise_reparent_validation_error(msg, error_field)
        visited = {str(folder.id)}
        curr: DataroomFolder | None = new_parent
        while curr is not None:
            curr_id = str(curr.id)
            if curr_id in visited:
                _raise_reparent_validation_error(
                    "Cannot move a folder into itself or one of its subfolders.",
                    error_field,
                )
            visited.add(curr_id)
            curr = curr.parent

    if new_parent != folder.parent:
        if folder.is_synced and folder.parent and folder.parent.is_synced:
            _raise_reparent_validation_error(
                "Cannot move a subfolder out of a synced folder tree.",
                error_field,
            )
        if dest_has_synced_ancestor is None:
            dest_has_synced_ancestor = folder_has_synced_ancestor(new_parent)
        if dest_has_synced_ancestor and folder_has_synced_descendant(folder):
            _raise_reparent_validation_error(
                "Cannot move a synced folder inside another synced folder.",
                error_field,
            )


def unlink_dataroom_folder(dataroom_folder: DataroomFolder) -> DataroomFolder:
    """
    Safely detaches a sync-root DataroomFolder and its synced descendant subtree
    from source Folders without deleting any files or folders.
    """
    with transaction.atomic():
        locked_dataroom = Dataroom.objects.select_for_update().get(id=dataroom_folder.dataroom_id)
        locked_root = DataroomFolder.objects.select_related('parent', 'dataroom').get(
            id=dataroom_folder.id,
            dataroom=locked_dataroom,
        )
        if not locked_root.is_synced:
            raise ValueError("This folder is not synced with Documents.")
        if locked_root.parent_id and locked_root.parent and locked_root.parent.is_synced:
            raise ValueError("Only top-level synced folders can be unlinked. Unlink the parent synced folder instead.")

        subtree_ids = [locked_root.id]
        queue = [locked_root.id]
        visited = {locked_root.id}
        while queue:
            child_ids = list(
                DataroomFolder.objects.filter(
                    dataroom=locked_dataroom,
                    parent_id__in=queue,
                    is_synced=True,
                ).values_list('id', flat=True)
            )
            next_queue = []
            for cid in child_ids:
                if cid not in visited:
                    visited.add(cid)
                    subtree_ids.append(cid)
                    next_queue.append(cid)
            queue = next_queue

        now = timezone.now()
        DataroomFolder.objects.filter(
            dataroom=locked_dataroom,
            id__in=subtree_ids,
            is_synced=True,
        ).update(
            is_synced=False,
            source_folder=None,
            last_synced_at=None,
            updated_at=now,
        )
        DataroomDocument.objects.filter(
            dataroom=locked_dataroom,
            folder_id__in=subtree_ids,
            is_synced=True,
        ).update(is_synced=False, updated_at=now)

        touch_dataroom_folder_ancestors(locked_root)
        locked_root.refresh_from_db()
        return locked_root

