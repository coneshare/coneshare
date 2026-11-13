import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

from .models import SignatureRequest, Signer

logger = logging.getLogger('tasks')


def build_signer_signing_url(request_id: str, access_token: str) -> str:
    """
    Constructs a scanner-tolerant signing URL placing the single-use access token
    exclusively inside the URL `#fragment` (never query parameters).
    """
    domain = getattr(settings, 'SITE_DOMAIN', 'http://localhost:5173').rstrip('/')
    return f"{domain}/sign/{request_id}#token={access_token}"


@shared_task
def send_signer_invitation_email_task(request_id: str, signer_id: str) -> None:
    """Sends a signature invitation email carrying a fragment-scoped signing link."""
    try:
        signer = Signer.objects.select_related('request', 'request__created_by', 'request__document').get(
            id=signer_id,
            request_id=request_id,
        )
    except Signer.DoesNotExist:
        logger.warning("Signer %s on request %s not found for invitation email.", signer_id, request_id)
        return

    sig_request = signer.request
    if sig_request.status in (SignatureRequest.STATUS_VOIDED, SignatureRequest.STATUS_DECLINED, SignatureRequest.STATUS_COMPLETED):
        return

    signing_url = build_signer_signing_url(str(sig_request.id), signer.access_token)
    sender_name = sig_request.created_by.name or sig_request.created_by.email
    subject = f"Signature requested: {sig_request.title}"
    body_lines = [
        f"Hello {signer.name or signer.email},",
        "",
        f"{sender_name} has requested your signature on '{sig_request.title}'.",
    ]
    if sig_request.message:
        body_lines.extend(["", f"Message: {sig_request.message}"])
    body_lines.extend([
        "",
        f"Review and sign here: {signing_url}",
        "",
        "For security, this link is intended only for your verified recipient session.",
    ])

    try:
        send_mail(
            subject=subject,
            message="\n".join(body_lines),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[signer.email],
            fail_silently=False,
        )
    except Exception as exc:
        logger.error("Failed to send signer invitation email to %s: %s", signer.email, exc)


@shared_task
def send_signature_completed_email_task(request_id: str) -> None:
    """Notifies requester and signers when a signature request is completed and sealed."""
    try:
        sig_request = SignatureRequest.objects.select_related('created_by', 'document').prefetch_related('signers').get(
            id=request_id,
        )
    except SignatureRequest.DoesNotExist:
        return

    if sig_request.status != SignatureRequest.STATUS_COMPLETED:
        return

    recipients = list({sig_request.created_by.email, *(s.email for s in sig_request.signers.all() if s.email)})
    if not recipients:
        return

    subject = f"Completed: {sig_request.title}"
    body = (
        f"All parties have signed '{sig_request.title}'.\n"
        f"Executed SHA-256: {sig_request.completed_file_sha256}\n"
    )
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=recipients,
            fail_silently=False,
        )
    except Exception as exc:
        logger.error("Failed to send completion email for request %s: %s", request_id, exc)
