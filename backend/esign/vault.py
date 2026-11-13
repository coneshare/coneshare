from __future__ import annotations

import logging
import os
from typing import Optional
from urllib.parse import quote

from django.db import IntegrityError, transaction
from django.db.models import Max

from backend.utils import get_unique_name
from core.models import User
from datarooms.models import Dataroom, DataroomDocument, DataroomFolder, DataroomItemOrder
from datarooms.services import get_dataroom_storage_used_bytes, get_or_create_dataroom_storage_folder, touch_dataroom_folder_ancestors
from documents.fileserver import fileserver_client
from documents.models import Document, sanitize_filename
from documents.services import QuotaExceededError, check_user_quota_on_upload, create_document_from_upload, validate_storage_key

logger = logging.getLogger(__name__)


def build_rfc6266_content_disposition(
    filename: str,
    fallback: str = 'signed_document.pdf',
    disposition: str = 'attachment',
) -> str:
    """
    Formats an RFC 6266 Content-Disposition header with strict ASCII fallback for
    WSGI servers and UTF-8 percent-encoding for international filenames.
    """
    safe_disposition = 'inline' if disposition == 'inline' else 'attachment'
    safe_utf8 = sanitize_filename(filename) or fallback
    raw_ascii = safe_utf8.replace(' ', '_').encode('ascii', 'ignore').decode('ascii').strip('._- ')
    ascii_name = raw_ascii or fallback
    if not ascii_name.lower().endswith('.pdf'):
        ascii_name = f"{ascii_name}.pdf"
    utf8_quoted = quote(safe_utf8, safe='')
    return f'{safe_disposition}; filename="{ascii_name}"; filename*=UTF-8\'\'{utf8_quoted}'


def build_rfc6266_attachment_header(filename: str, fallback: str = 'signed_document.pdf') -> str:
    """Formats an RFC 6266 Content-Disposition attachment header."""
    return build_rfc6266_content_disposition(filename, fallback=fallback, disposition='attachment')


def build_signature_artifact_storage_key(
    organization_id,
    scope_id: str,
    digest_or_name: str,
    ext: str = '.pdf',
) -> str:
    """Builds and validates an organization-scoped content-addressed signature artifact storage key."""
    clean_scope = ''.join(c for c in str(scope_id) if c.isalnum() or c in ('-', '_'))[:64] or 'artifact'
    clean_name = ''.join(c for c in str(digest_or_name) if c.isalnum() or c in ('-', '_'))[:96] or 'item'
    clean_ext = ext if ext.startswith('.') else f'.{ext}'
    raw_key = f"{organization_id}/signatures/{clean_scope}/{clean_name}{clean_ext}"
    return validate_storage_key(raw_key, organization_id)


def _get_or_create_dataroom_folder_chain(dataroom: Dataroom, folder_parts: list[str], actor_user: Optional[User]) -> Optional[DataroomFolder]:
    """Resolves or creates logical DataroomFolder chain (e.g. ['Executed', 'Agreements']) and appends DataroomItemOrder."""
    current: Optional[DataroomFolder] = None
    for part in folder_parts:
        clean_part = (part or '').strip()[:255]
        if not clean_part:
            continue
        folder, created = DataroomFolder.objects.get_or_create(
            dataroom=dataroom,
            parent=current,
            name=clean_part,
            defaults={'created_by': actor_user},
        )
        if created:
            _append_item_order(
                dataroom=dataroom,
                parent_folder=current,
                item_type=DataroomItemOrder.ITEM_TYPE_FOLDER,
                folder=folder,
            )
        current = folder
    return current


def _append_item_order(
    dataroom: Dataroom,
    parent_folder: Optional[DataroomFolder],
    item_type: str,
    folder: Optional[DataroomFolder] = None,
    dataroom_document: Optional[DataroomDocument] = None,
) -> None:
    """Safely appends an ordering row at the end of a dataroom folder scope."""
    max_pos = (
        DataroomItemOrder.objects.filter(dataroom=dataroom, parent_folder=parent_folder)
        .aggregate(max_pos=Max('position'))
        .get('max_pos')
    )
    next_pos = (max_pos + 1) if max_pos is not None else 0
    try:
        DataroomItemOrder.objects.create(
            dataroom=dataroom,
            parent_folder=parent_folder,
            item_type=item_type,
            folder=folder,
            dataroom_document=dataroom_document,
            position=next_pos,
        )
    except IntegrityError:
        # Retry once if concurrent insert collided on position
        refreshed_max = (
            DataroomItemOrder.objects.filter(dataroom=dataroom, parent_folder=parent_folder)
            .aggregate(max_pos=Max('position'))
            .get('max_pos')
        )
        DataroomItemOrder.objects.create(
            dataroom=dataroom,
            parent_folder=parent_folder,
            item_type=item_type,
            folder=folder,
            dataroom_document=dataroom_document,
            position=(refreshed_max + 1) if refreshed_max is not None else 0,
        )


def is_executed_nda_folder(folder: Optional[DataroomFolder]) -> bool:
    """Returns True if the folder is 'Executed/NDAs' or any descendant within it."""
    if not folder:
        return False
    names: list[str] = []
    curr: Optional[DataroomFolder] = folder
    visited = set()
    while curr and curr.id not in visited:
        visited.add(curr.id)
        names.append((curr.name or '').strip())
        curr = curr.parent
    top_down = list(reversed(names))
    return len(top_down) >= 2 and top_down[0] == 'Executed' and top_down[1] == 'NDAs'


def is_executed_nda_dataroom_document(ddoc: Optional[DataroomDocument]) -> bool:
    """Returns True if the DataroomDocument resides under Executed/NDAs/ or links to an NDA acceptance."""
    if not ddoc:
        return False
    if ddoc.folder and is_executed_nda_folder(ddoc.folder):
        return True
    if hasattr(ddoc, 'executed_nda_acceptances') and ddoc.executed_nda_acceptances.exists():
        return True
    return False


def enforce_quota_before_artifact_creation(
    *,
    owner_user: User,
    file_size: int,
    dataroom: Optional[Dataroom] = None,
) -> None:
    """
    Acquires select_for_update() on the governing quota entity (Dataroom vault or User)
    and verifies sufficient storage quota exists before persisting an executed PDF artifact.
    Must be called inside transaction.atomic().
    """
    if dataroom is not None:
        locked_dataroom = Dataroom.objects.select_for_update().get(pk=dataroom.pk)
        if locked_dataroom.storage_quota_mb and locked_dataroom.storage_quota_mb > 0:
            used_bytes = get_dataroom_storage_used_bytes(locked_dataroom)
            quota_bytes = locked_dataroom.storage_quota_mb * 1024 * 1024
            if used_bytes + file_size > quota_bytes:
                raise QuotaExceededError(
                    f"Creating signed artifact would exceed the Dataroom storage limit of {locked_dataroom.storage_quota_mb} MB."
                )
        if locked_dataroom.storage_version < 2:
            locked_user = User.objects.select_for_update().get(pk=owner_user.pk)
            check_user_quota_on_upload(locked_user, file_size)
    else:
        locked_user = User.objects.select_for_update().get(pk=owner_user.pk)
        check_user_quota_on_upload(locked_user, file_size)


def upload_canonical_artifact(storage_key: str, data: bytes, content_type: str = 'application/pdf') -> None:
    """Uploads canonical sealed PDF or signature image bytes to Go file server."""
    fileserver_client.upload_file(storage_key, data, content_type=content_type)


def deposit_executed_pdf_to_dataroom(
    *,
    dataroom: Dataroom,
    actor_user: User,
    storage_key: str,
    file_size: int,
    filename: str,
    folder_parts: list[str],
) -> DataroomDocument:
    """
    Deposits an already-uploaded executed PDF into the Dataroom vault hierarchy
    (e.g. ['Executed', 'Agreements'] or ['Executed', 'NDAs', '<subject>-v1'])
    without exposing it on sibling public share links by default.
    Must be called inside transaction.atomic().
    """
    clean_filename = sanitize_filename(filename) or 'signed_document.pdf'
    if not clean_filename.lower().endswith('.pdf'):
        stem = os.path.splitext(clean_filename)[0] or 'signed_document'
        clean_filename = f'{stem}.pdf'

    locked_dataroom = Dataroom.objects.select_for_update().get(pk=dataroom.pk)
    enforce_quota_before_artifact_creation(
        owner_user=actor_user,
        file_size=file_size,
        dataroom=locked_dataroom,
    )

    rel_dir = '/'.join(folder_parts)
    storage_folder = get_or_create_dataroom_storage_folder(
        locked_dataroom,
        requesting_user=actor_user,
        relative_path=f"{rel_dir}/{clean_filename}" if rel_dir else clean_filename,
    )
    track_user_quota = locked_dataroom.storage_version < 2
    doc = create_document_from_upload(
        requesting_user=actor_user,
        folder=storage_folder,
        storage_key=storage_key,
        unique_name=clean_filename,
        file_size=file_size,
        content_type='application/pdf',
        track_user_quota=track_user_quota,
    )

    # Mark newly vaulted canonical PDF document ready immediately; preview pages render lazily on open
    Document.objects.filter(pk=doc.pk).update(status='ready', num_pages=None)
    doc.refresh_from_db()

    target_dr_folder = _get_or_create_dataroom_folder_chain(locked_dataroom, folder_parts, actor_user)
    unique_dr_name = get_unique_name(
        DataroomDocument,
        clean_filename,
        {'dataroom': locked_dataroom, 'folder': target_dr_folder},
        has_extension=True,
    )
    ddoc = DataroomDocument.objects.create(
        dataroom=locked_dataroom,
        document=doc,
        folder=target_dr_folder,
        name=unique_dr_name,
        is_direct_upload=True,
    )
    _append_item_order(
        dataroom=locked_dataroom,
        parent_folder=target_dr_folder,
        item_type=DataroomItemOrder.ITEM_TYPE_DOCUMENT,
        dataroom_document=ddoc,
    )
    if target_dr_folder:
        touch_dataroom_folder_ancestors(target_dr_folder)

    return ddoc
