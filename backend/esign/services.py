from __future__ import annotations

import logging
from typing import Any, Optional

import requests
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from automations.tasks import dispatch_automation_event_task
from core.models import User
from datarooms.models import Dataroom
from documents.fileserver import fileserver_client
from documents.models import Document, DocumentVersion

from .models import SEAL_METHOD_VISUAL_HASH, SignatureAuditTrail, SignatureField, SignatureRequest, Signer
from .pdf_stamping import (
    FieldStamp,
    compute_sha256,
    render_typed_signature_png,
    stamp_fields_and_seal_pdf,
    validate_coordinates,
    validate_pdf_bytes,
    validate_signature_data_url,
)
from .tasks import send_signature_completed_email_task, send_signer_invitation_email_task
from .vault import (
    build_signature_artifact_storage_key,
    deposit_executed_pdf_to_dataroom,
    enforce_quota_before_artifact_creation,
    upload_canonical_artifact,
)

logger = logging.getLogger(__name__)


def download_storage_bytes(storage_key: str) -> bytes:
    """Downloads raw file bytes from the Go file service via an internal short-lived URL."""
    download_url = fileserver_client.generate_download_url(storage_key, is_internal=True)
    resp = requests.get(download_url, timeout=(5.0, 60.0))
    resp.raise_for_status()
    return resp.content


def _normalize_idempotency_key(idempotency_key: str | None) -> str:
    clean = (idempotency_key or '').strip()
    if len(clean) > 200:
        raise ValidationError({'idempotency_key': 'Idempotency key cannot exceed 200 characters.'})
    return clean


def create_signature_request(
    *,
    owner: User,
    document: Document,
    document_version: DocumentVersion,
    title: str,
    signers_data: list[dict[str, Any]],
    fields_data: list[dict[str, Any]],
    dataroom: Optional[Dataroom] = None,
    message: str = '',
    signing_mode: str = SignatureRequest.MODE_DIRECT,
    signing_order: str = SignatureRequest.ORDER_PARALLEL,
    seal_method: str = SEAL_METHOD_VISUAL_HASH,
    idempotency_key: str = '',
    expires_at=None,
) -> tuple[SignatureRequest, bool]:
    """
    Creates a draft SignatureRequest pinning a specific DocumentVersion and SHA-256,
    with optional idempotency deduplication per owner.
    Returns (SignatureRequest, created_bool).
    """
    clean_idem = _normalize_idempotency_key(idempotency_key)
    if clean_idem:
        existing = SignatureRequest.objects.filter(created_by=owner, idempotency_key=clean_idem).first()
        if existing:
            return existing, False

    if document.organization_id != owner.organization_id or document.deleted_at is not None:
        raise ValidationError({'document': 'Document not found in your organization.'})
    if document.type != 'pdf' or document.status != 'ready':
        raise ValidationError({'document': 'Only ready PDF documents can be used for eSignature.'})
    if document_version.document_id != document.id:
        raise ValidationError({'document_version': 'Selected version does not belong to this document.'})
    if dataroom is not None and dataroom.organization_id != owner.organization_id:
        raise ValidationError({'dataroom': 'Dataroom not found in your organization.'})

    source_key = document_version.original_storage_key or document_version.storage_key
    if not source_key:
        raise ValidationError({'document_version': 'Selected document version has no stored PDF file.'})

    # Download & validate source PDF bytes outside database transaction locks
    pdf_bytes = download_storage_bytes(source_key)
    page_count = validate_pdf_bytes(pdf_bytes)
    original_sha256 = compute_sha256(pdf_bytes)

    if not signers_data or not (1 <= len(signers_data) <= 20):
        raise ValidationError({'signers': 'Between 1 and 20 signers are required.'})

    seen_emails: set[str] = set()
    normalized_signers: list[dict[str, Any]] = []
    for idx, s in enumerate(signers_data, start=1):
        email = str(s.get('email', '')).strip().lower()
        if not email or email in seen_emails:
            raise ValidationError({'signers': f'Duplicate or empty signer email: {email}'})
        seen_emails.add(email)
        order_index = int(s.get('order_index') or idx)
        if not (1 <= order_index <= 20):
            raise ValidationError({'signers': 'Signer order_index must be between 1 and 20.'})
        normalized_signers.append({
            'email': email,
            'name': str(s.get('name', '')).strip()[:255],
            'role': str(s.get('role', 'Signer')).strip()[:100] or 'Signer',
            'order_index': order_index,
        })

    # Validate fields and signer references upfront before opening atomic lock
    validated_fields: list[dict[str, Any]] = []
    for f in fields_data:
        validate_coordinates(
            int(f['page_number']),
            float(f['x']),
            float(f['y']),
            float(f['width']),
            float(f['height']),
            page_count=page_count,
        )
        signer_email = (f.get('signer_email') or '').strip().lower()
        signer_index = f.get('signer_index')
        if signer_index is not None:
            if not isinstance(signer_index, int) or not (0 <= signer_index < len(normalized_signers)):
                raise ValidationError({'fields': 'Invalid signer_index reference on field.'})
            signer_email = normalized_signers[signer_index]['email']
        elif signer_email:
            if signer_email not in seen_emails:
                raise ValidationError({'fields': f'Field references unknown signer email: {signer_email}'})
        else:
            signer_email = normalized_signers[0]['email']

        validated_fields.append({
            'signer_email': signer_email,
            'field_type': f.get('field_type', SignatureField.TYPE_SIGNATURE),
            'page_number': int(f['page_number']),
            'x': float(f['x']),
            'y': float(f['y']),
            'width': float(f['width']),
            'height': float(f['height']),
            'is_required': bool(f.get('is_required', True)),
        })

    try:
        with transaction.atomic():
            sig_request = SignatureRequest.objects.create(
                organization=owner.organization,
                created_by=owner,
                document=document,
                document_version=document_version,
                dataroom=dataroom,
                idempotency_key=clean_idem,
                title=title.strip()[:255] or document.name,
                message=message or '',
                signing_mode=signing_mode,
                signing_order=signing_order,
                current_order_index=min(s['order_index'] for s in normalized_signers),
                original_file_sha256=original_sha256,
                seal_method=seal_method,
                expires_at=expires_at,
            )

            signer_by_email: dict[str, Signer] = {}
            for s in normalized_signers:
                signer_obj = Signer.objects.create(request=sig_request, **s)
                signer_by_email[s['email']] = signer_obj

            for f in validated_fields:
                SignatureField.objects.create(
                    request=sig_request,
                    signer=signer_by_email[f['signer_email']],
                    field_type=f['field_type'],
                    page_number=f['page_number'],
                    x=f['x'],
                    y=f['y'],
                    width=f['width'],
                    height=f['height'],
                    is_required=f['is_required'],
                )

            SignatureAuditTrail.objects.create(
                request=sig_request,
                event_type=SignatureAuditTrail.EVENT_CREATED,
                details={
                    'document_name': document.name,
                    'signer_count': len(normalized_signers),
                    'field_count': len(validated_fields),
                    'signing_order': signing_order,
                },
            )
            return sig_request, True
    except IntegrityError:
        if clean_idem:
            existing = SignatureRequest.objects.filter(created_by=owner, idempotency_key=clean_idem).first()
            if existing:
                return existing, False
        raise


def send_signature_request(
    request_id: str,
    actor: User,
    *,
    ip_address: str | None = None,
    user_agent: str = '',
) -> SignatureRequest:
    """
    Transitions a draft SignatureRequest to 'sent', notifies active-order signers
    exclusively inside transaction.on_commit().
    """
    with transaction.atomic():
        sig_request = SignatureRequest.objects.select_for_update().get(pk=request_id)
        if sig_request.status != SignatureRequest.STATUS_DRAFT:
            raise ValidationError(
                {'detail': f"Cannot send signature request in '{sig_request.status}' status."},
                code='invalid_state',
            )

        signers = list(sig_request.signers.order_by('order_index', 'created_at'))
        if not signers:
            raise ValidationError({'signers': 'At least one signer is required before sending.'})

        fields = list(sig_request.fields.all())
        for s in signers:
            has_sig = any(
                f.signer_id == s.id and f.field_type in (SignatureField.TYPE_SIGNATURE, SignatureField.TYPE_INITIALS)
                for f in fields
            )
            if not has_sig:
                raise ValidationError(
                    {'fields': f"Signer {s.email} must have at least one signature or initials field before sending."}
                )

        min_order = min(s.order_index for s in signers)
        sig_request.current_order_index = min_order
        sig_request.status = SignatureRequest.STATUS_SENT
        sig_request.save(update_fields=['current_order_index', 'status', 'updated_at'])

        signers_to_notify: list[Signer] = []
        for s in signers:
            if sig_request.signing_order == SignatureRequest.ORDER_PARALLEL or s.order_index == min_order:
                s.status = Signer.STATUS_NOTIFIED
                s.save(update_fields=['status', 'updated_at'])
                signers_to_notify.append(s)

        SignatureAuditTrail.objects.create(
            request=sig_request,
            event_type=SignatureAuditTrail.EVENT_SENT,
            ip_address=ip_address,
            user_agent=user_agent[:255],
            details={
                'notified_emails': [s.email for s in signers_to_notify],
                'actor_email': actor.email,
            },
        )

        req_id_str = str(sig_request.id)
        notify_ids = [str(s.id) for s in signers_to_notify]
        transaction.on_commit(
            lambda: [send_signer_invitation_email_task.delay(req_id_str, sid) for sid in notify_ids]
        )

        return sig_request


def void_signature_request(
    request_id: str,
    actor: User,
    reason: str = '',
    *,
    ip_address: str | None = None,
    user_agent: str = '',
) -> SignatureRequest:
    """Voids an in-flight or declined SignatureRequest while keeping immutable history."""
    with transaction.atomic():
        sig_request = SignatureRequest.objects.select_for_update().get(pk=request_id)
        if sig_request.status in (SignatureRequest.STATUS_COMPLETED, SignatureRequest.STATUS_VOIDED):
            raise ValidationError(
                {'detail': f"Cannot void a signature request in '{sig_request.status}' status."},
                code='invalid_state',
            )

        sig_request.status = SignatureRequest.STATUS_VOIDED
        sig_request.voided_at = timezone.now()
        sig_request.void_reason = (reason or '').strip()[:255]
        sig_request.save(update_fields=['status', 'voided_at', 'void_reason', 'updated_at'])

        SignatureAuditTrail.objects.create(
            request=sig_request,
            event_type=SignatureAuditTrail.EVENT_VOIDED,
            ip_address=ip_address,
            user_agent=user_agent[:255],
            details={'actor_email': actor.email, 'reason': sig_request.void_reason},
        )
        return sig_request


def decline_signature_request(
    signer: Signer,
    reason: str = '',
    *,
    ip_address: str | None = None,
    user_agent: str = '',
) -> SignatureRequest:
    """Marks a signer and active request as declined."""
    with transaction.atomic():
        sig_request = SignatureRequest.objects.select_for_update().get(pk=signer.request_id)
        locked_signer = Signer.objects.select_for_update().get(pk=signer.id)
        if sig_request.expires_at and sig_request.expires_at < timezone.now():
            raise ValidationError({'detail': 'This signature request has expired.'}, code='invalid_state')
        if sig_request.status in (SignatureRequest.STATUS_COMPLETED, SignatureRequest.STATUS_VOIDED, SignatureRequest.STATUS_DECLINED):
            raise ValidationError(
                {'detail': f"Cannot decline request in '{sig_request.status}' status."},
                code='invalid_state',
            )
        if locked_signer.status == Signer.STATUS_SIGNED:
            raise ValidationError({'detail': 'Already signed by this recipient.'}, code='invalid_state')

        clean_reason = (reason or '').strip()[:1000]
        locked_signer.status = Signer.STATUS_DECLINED
        locked_signer.declined_reason = clean_reason
        locked_signer.ip_address = ip_address
        locked_signer.user_agent = user_agent[:255]
        locked_signer.save(update_fields=['status', 'declined_reason', 'ip_address', 'user_agent', 'updated_at'])

        sig_request.status = SignatureRequest.STATUS_DECLINED
        sig_request.save(update_fields=['status', 'updated_at'])

        SignatureAuditTrail.objects.create(
            request=sig_request,
            signer=locked_signer,
            event_type=SignatureAuditTrail.EVENT_DECLINED,
            ip_address=ip_address,
            user_agent=user_agent[:255],
            details={'signer_email': locked_signer.email, 'reason': clean_reason},
        )
        return sig_request


def _prepare_signer_field_updates(
    sig_request: SignatureRequest,
    signer: Signer,
    submitted_fields: list[dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], dict[str, bytes]]:
    """
    Validates field values submitted by a signer and prepares signature PNG bytes
    without holding any database row lock.
    """
    assigned_fields = {
        str(f.id): f for f in SignatureField.objects.filter(request=sig_request, signer=signer)
    }
    by_id: dict[str, dict[str, Any]] = {}
    for item in submitted_fields:
        fid = str(item.get('field_id') or '').strip()
        if fid not in assigned_fields:
            raise ValidationError({'fields': f"Field '{fid}' is not assigned to this signer."})
        by_id[fid] = item

    prepared_updates: dict[str, dict[str, Any]] = {}
    png_assets: dict[str, bytes] = {}

    for fid, field_obj in assigned_fields.items():
        payload = by_id.get(fid, {})
        val = str(payload.get('value', '') or '').strip()
        sig_type = str(payload.get('signature_type', 'draw') or 'draw').strip().lower()
        sig_data = str(payload.get('signature_data', '') or '').strip()

        if field_obj.field_type in (SignatureField.TYPE_SIGNATURE, SignatureField.TYPE_INITIALS):
            if sig_data:
                png_bytes = validate_signature_data_url(sig_data)
                img_key = build_signature_artifact_storage_key(
                    sig_request.organization_id,
                    f"req_{sig_request.id}",
                    f"{signer.id}_{fid}_{compute_sha256(png_bytes)[:12]}",
                    ext='.png',
                )
                png_assets[img_key] = png_bytes
                prepared_updates[fid] = {
                    'value': val or (signer.name or signer.email),
                    'storage_key': img_key,
                }
            elif sig_type == 'type' and (val or signer.name):
                typed_name = val or signer.name
                png_bytes = render_typed_signature_png(typed_name)
                img_key = build_signature_artifact_storage_key(
                    sig_request.organization_id,
                    f"req_{sig_request.id}",
                    f"{signer.id}_{fid}_{compute_sha256(png_bytes)[:12]}",
                    ext='.png',
                )
                png_assets[img_key] = png_bytes
                prepared_updates[fid] = {
                    'value': typed_name,
                    'storage_key': img_key,
                }
            elif field_obj.is_required:
                raise ValidationError({'fields': f"Signature field {fid} requires a drawn or typed signature."})
        elif field_obj.field_type == SignatureField.TYPE_DATE:
            resolved_date = val or timezone.now().strftime('%Y-%m-%d')
            prepared_updates[fid] = {'value': resolved_date, 'storage_key': ''}
        elif field_obj.field_type == SignatureField.TYPE_CHECKBOX:
            checked = str(val).lower() in ('true', '1', 'yes', 'checked', 'on')
            if field_obj.is_required and not checked:
                raise ValidationError({'fields': f"Required checkbox field {fid} must be checked."})
            prepared_updates[fid] = {'value': 'true' if checked else 'false', 'storage_key': ''}
        else:
            if field_obj.is_required and not val:
                raise ValidationError({'fields': f"Required field {fid} ({field_obj.field_type}) cannot be empty."})
            prepared_updates[fid] = {'value': val, 'storage_key': ''}

    return prepared_updates, png_assets


def _build_stamps_for_request(
    sig_request: SignatureRequest,
    signer_png_overrides: dict[str, bytes],
    *,
    pending_signer_id=None,
    pending_signed_at=None,
    pending_ip: str | None = None,
) -> tuple[list[FieldStamp], list[dict[str, str]]]:
    """Assembles FieldStamp objects across all signers (fetching stored signature PNGs outside locks)."""
    all_fields = list(sig_request.fields.select_related('signer').all())
    stamps: list[FieldStamp] = []
    cached_pngs: dict[str, bytes] = dict(signer_png_overrides)

    for f in all_fields:
        img_bytes: bytes | None = None
        if f.signature_image_storage_key:
            if f.signature_image_storage_key not in cached_pngs:
                try:
                    cached_pngs[f.signature_image_storage_key] = download_storage_bytes(f.signature_image_storage_key)
                except Exception as exc:
                    logger.warning("Could not fetch signature PNG %s: %s", f.signature_image_storage_key, exc)
            img_bytes = cached_pngs.get(f.signature_image_storage_key)

        signer_label = ''
        if f.signer and f.field_type in (SignatureField.TYPE_SIGNATURE, SignatureField.TYPE_INITIALS):
            effective_signed_at = (
                pending_signed_at if pending_signer_id and f.signer_id == pending_signer_id else f.signer.signed_at
            )
            ts_str = (effective_signed_at or timezone.now()).strftime('%Y-%m-%d %H:%M UTC')
            signer_label = f"{f.signer.name or f.signer.email} | {ts_str}"

        stamps.append(
            FieldStamp(
                page_number=f.page_number,
                x=f.x,
                y=f.y,
                width=f.width,
                height=f.height,
                field_type=f.field_type,
                text_value=f.value,
                image_bytes=img_bytes,
                signer_label=signer_label,
            )
        )

    signer_rows: list[dict[str, str]] = []
    for s in sig_request.signers.order_by('order_index', 'created_at'):
        effective_signed_at = pending_signed_at if pending_signer_id and s.id == pending_signer_id else s.signed_at
        effective_ip = pending_ip if pending_signer_id and s.id == pending_signer_id else s.ip_address
        signer_rows.append({
            'name': f"{s.name} ({s.role})" if s.name else s.role,
            'email': s.email,
            'auth': f"Token / IP: {effective_ip or 'N/A'}",
            'signed_at': (effective_signed_at or timezone.now()).strftime('%Y-%m-%d %H:%M:%S UTC'),
        })

    return stamps, signer_rows


def _build_audit_log_rows(
    sig_request: SignatureRequest,
    *,
    pending_signer: Signer | None = None,
    pending_signed_at=None,
    pending_ip: str | None = None,
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    has_pending_signed_event = False
    for evt in sig_request.audit_events.select_related('signer').order_by('timestamp', 'id'):
        if pending_signer and evt.signer_id == pending_signer.id and evt.event_type == SignatureAuditTrail.EVENT_SIGNED:
            has_pending_signed_event = True
        actor = evt.signer.email if evt.signer else evt.details.get('actor_email', '')
        rows.append({
            'timestamp': evt.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            'event_type': evt.event_type,
            'summary': f"{actor} {evt.ip_address or ''}".strip(),
        })
    if pending_signer and not has_pending_signed_event:
        ts = pending_signed_at or timezone.now()
        rows.append({
            'timestamp': ts.strftime('%Y-%m-%d %H:%M:%S'),
            'event_type': SignatureAuditTrail.EVENT_SIGNED,
            'summary': f"{pending_signer.email} {pending_ip or ''}".strip(),
        })
    return rows


def _queue_completed_side_effects(sig_request: SignatureRequest, last_signer_email: str) -> None:
    req_id_str = str(sig_request.id)
    send_signature_completed_email_task.delay(req_id_str)
    dataroom_owner_id = (
        str(sig_request.dataroom.created_by_id)
        if sig_request.dataroom and sig_request.dataroom.created_by_id
        else None
    )
    payload = {
        'organization_id': str(sig_request.organization_id),
        'owner_user_id': str(sig_request.created_by_id),
        'dataroom_owner_user_id': dataroom_owner_id,
        'dataroom_id': str(sig_request.dataroom_id) if sig_request.dataroom_id else None,
        'dataroom_name': sig_request.dataroom.name if sig_request.dataroom else None,
        'document_id': str(sig_request.document_id),
        'document_name': sig_request.document.name,
        'signature_request_id': req_id_str,
        'completed_file_sha256': sig_request.completed_file_sha256,
        'last_signer_email': last_signer_email,
    }
    dispatch_automation_event_task.delay('document_signed', payload)


def submit_signer_fields(
    signer: Signer,
    submitted_fields: list[dict[str, Any]],
    *,
    ip_address: str | None = None,
    user_agent: str = '',
) -> SignatureRequest:
    """
    Executes field submission and sequential/final sealing while keeping all network
    storage transfers and email/automation dispatches outside database locks.
    """
    sig_request = SignatureRequest.objects.select_related(
        'document', 'document_version', 'dataroom', 'created_by', 'organization'
    ).get(pk=signer.request_id)

    if sig_request.expires_at and sig_request.expires_at < timezone.now():
        raise ValidationError({'detail': 'This signature request has expired.'}, code='invalid_state')
    if not signer.can_sign():
        raise ValidationError({'detail': 'Signing is not permitted in the current state or order.'}, code='invalid_state')

    # Step 1 (Network IO outside lock): Validate fields & upload signature PNGs
    prepared_updates, png_assets = _prepare_signer_field_updates(sig_request, signer, submitted_fields)
    for key, png_bytes in png_assets.items():
        upload_canonical_artifact(key, png_bytes, content_type='image/png')

    # Step 2 (Short DB lock): Record submitted field values; defer final signer SIGNED
    # transition until Step 4 quota check + vaulting succeed so failures remain retryable.
    all_signed = False
    signing_attempt_time = timezone.now()
    with transaction.atomic():
        locked_req = SignatureRequest.objects.select_for_update().get(pk=sig_request.id)
        if locked_req.expires_at and locked_req.expires_at < signing_attempt_time:
            raise ValidationError({'detail': 'This signature request has expired.'}, code='invalid_state')
        locked_signer = Signer.objects.select_for_update().get(pk=signer.id)
        locked_signer.request = locked_req
        if not locked_signer.can_sign():
            raise ValidationError({'detail': 'Signing is not permitted in the current state or order.'}, code='invalid_state')

        for field_obj in SignatureField.objects.filter(request=locked_req, signer=locked_signer):
            if str(field_obj.id) in prepared_updates:
                upd = prepared_updates[str(field_obj.id)]
                field_obj.value = upd['value']
                if upd['storage_key']:
                    field_obj.signature_image_storage_key = upd['storage_key']
                field_obj.save(update_fields=['value', 'signature_image_storage_key', 'updated_at'])

        other_remaining = list(
            locked_req.signers
            .exclude(pk=locked_signer.id)
            .exclude(status=Signer.STATUS_SIGNED)
            .order_by('order_index', 'created_at')
        )
        if not other_remaining:
            all_signed = True
            locked_signer.ip_address = ip_address
            locked_signer.user_agent = user_agent[:255]
            locked_signer.save(update_fields=['ip_address', 'user_agent', 'updated_at'])
        else:
            locked_signer.status = Signer.STATUS_SIGNED
            locked_signer.signed_at = signing_attempt_time
            locked_signer.ip_address = ip_address
            locked_signer.user_agent = user_agent[:255]
            locked_signer.save(update_fields=['status', 'signed_at', 'ip_address', 'user_agent', 'updated_at'])

            SignatureAuditTrail.objects.create(
                request=locked_req,
                signer=locked_signer,
                event_type=SignatureAuditTrail.EVENT_SIGNED,
                ip_address=ip_address,
                user_agent=user_agent[:255],
                details={'signer_email': locked_signer.email},
            )

            locked_req.status = SignatureRequest.STATUS_IN_PROGRESS
            if locked_req.signing_order == SignatureRequest.ORDER_SEQUENTIAL:
                next_order = min(s.order_index for s in other_remaining)
                locked_req.current_order_index = next_order
                next_to_notify = [
                    s for s in other_remaining
                    if s.order_index == next_order and s.status in (Signer.STATUS_PENDING, Signer.STATUS_VIEWED)
                ]
                for ns in next_to_notify:
                    if ns.status == Signer.STATUS_PENDING:
                        ns.status = Signer.STATUS_NOTIFIED
                        ns.save(update_fields=['status', 'updated_at'])
                req_id_str = str(locked_req.id)
                notify_ids = [str(ns.id) for ns in next_to_notify]
                if notify_ids:
                    def _dispatch_next_signers(r_id: str = req_id_str, ids: list[str] = notify_ids) -> None:
                        for sid in ids:
                            send_signer_invitation_email_task.delay(r_id, sid)

                    transaction.on_commit(_dispatch_next_signers)
            locked_req.save(update_fields=['status', 'current_order_index', 'updated_at'])

    if not all_signed:
        sig_request.refresh_from_db()
        return sig_request

    # Step 3 (Outside lock): Download original pinned version bytes, verify hash, stamp all fields + Audit Certificate, upload canonical PDF
    sig_request.refresh_from_db()
    signer.refresh_from_db()
    source_key = sig_request.document_version.original_storage_key or sig_request.document_version.storage_key
    if not source_key:
        raise ValidationError({'document_version': 'Source PDF file key is missing.'})

    original_pdf_bytes = download_storage_bytes(source_key)
    if sig_request.original_file_sha256 and compute_sha256(original_pdf_bytes) != sig_request.original_file_sha256:
        raise ValidationError({'detail': 'Source PDF bytes no longer match the pinned SHA-256 digest.'})

    stamps, signer_rows = _build_stamps_for_request(
        sig_request,
        png_assets,
        pending_signer_id=signer.id,
        pending_signed_at=signing_attempt_time,
        pending_ip=ip_address,
    )
    audit_rows = _build_audit_log_rows(
        sig_request,
        pending_signer=signer,
        pending_signed_at=signing_attempt_time,
        pending_ip=ip_address,
    )
    sealed_bytes, _, sealed_sha256, actual_seal_method = stamp_fields_and_seal_pdf(
        original_pdf_bytes=original_pdf_bytes,
        stamps=stamps,
        certificate_metadata={
            'document_name': sig_request.document.name,
            'envelope_id': str(sig_request.id),
            'status': 'EXECUTED & SEALED',
            'completed_at': signing_attempt_time.strftime('%Y-%m-%d %H:%M:%S UTC'),
            'seal_method': sig_request.seal_method,
        },
        signer_rows=signer_rows,
        audit_events=audit_rows,
        seal_method=sig_request.seal_method,
    )

    sealed_key = build_signature_artifact_storage_key(
        sig_request.organization_id,
        f"req_{sig_request.id}",
        sealed_sha256,
        ext='.pdf',
    )
    upload_canonical_artifact(sealed_key, sealed_bytes, content_type='application/pdf')

    # Step 4 (Atomic finalize + quota + Dataroom vault deposit + final signer SIGNED transition)
    with transaction.atomic():
        locked_req = SignatureRequest.objects.select_for_update().select_related(
            'dataroom', 'dataroom__created_by', 'created_by', 'document'
        ).get(pk=sig_request.id)
        if locked_req.status == SignatureRequest.STATUS_COMPLETED:
            return locked_req
        if locked_req.expires_at and locked_req.expires_at < timezone.now():
            raise ValidationError({'detail': 'This signature request has expired.'}, code='invalid_state')

        locked_signer = Signer.objects.select_for_update().get(pk=signer.id)
        locked_signer.request = locked_req
        if not locked_signer.can_sign():
            raise ValidationError({'detail': 'Signing is not permitted in the current state or order.'}, code='invalid_state')

        enforce_quota_before_artifact_creation(
            owner_user=locked_req.created_by,
            file_size=len(sealed_bytes),
            dataroom=locked_req.dataroom,
        )

        vault_ddoc = None
        if locked_req.dataroom_id and locked_req.dataroom is not None:
            doc_stem = locked_req.document.name.rsplit('.', 1)[0]
            vault_ddoc = deposit_executed_pdf_to_dataroom(
                dataroom=locked_req.dataroom,
                actor_user=locked_req.created_by,
                storage_key=sealed_key,
                file_size=len(sealed_bytes),
                filename=f"{doc_stem}_signed.pdf",
                folder_parts=['Executed', 'Agreements', str(locked_req.id)],
            )

        locked_signer.status = Signer.STATUS_SIGNED
        locked_signer.signed_at = signing_attempt_time
        locked_signer.ip_address = ip_address
        locked_signer.user_agent = user_agent[:255]
        locked_signer.save(update_fields=['status', 'signed_at', 'ip_address', 'user_agent', 'updated_at'])

        SignatureAuditTrail.objects.create(
            request=locked_req,
            signer=locked_signer,
            event_type=SignatureAuditTrail.EVENT_SIGNED,
            ip_address=ip_address,
            user_agent=user_agent[:255],
            details={'signer_email': locked_signer.email},
        )

        locked_req.status = SignatureRequest.STATUS_COMPLETED
        locked_req.completed_at = timezone.now()
        locked_req.completed_file_storage_key = sealed_key
        locked_req.completed_file_sha256 = sealed_sha256
        locked_req.seal_method = actual_seal_method
        locked_req.vault_dataroom_document = vault_ddoc
        locked_req.save(update_fields=[
            'status',
            'completed_at',
            'completed_file_storage_key',
            'completed_file_sha256',
            'seal_method',
            'vault_dataroom_document',
            'updated_at',
        ])

        SignatureAuditTrail.objects.create(
            request=locked_req,
            event_type=SignatureAuditTrail.EVENT_COMPLETED,
            ip_address=ip_address,
            user_agent=user_agent[:255],
            details={
                'completed_file_sha256': sealed_sha256,
                'seal_method': actual_seal_method,
            },
        )

        signer_email_val = locked_signer.email

        def _dispatch_completion(req: SignatureRequest = locked_req, se: str = signer_email_val) -> None:
            _queue_completed_side_effects(req, se)

        transaction.on_commit(_dispatch_completion)
        return locked_req
