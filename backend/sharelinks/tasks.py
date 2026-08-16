import logging

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.translation import gettext as _, override as translation_override
from celery import shared_task

from .models import ViewSession

logger = logging.getLogger('tasks')


@shared_task
def send_view_notification_email_task(view_session_id: str):
    """
    Sends an email notification to the share link owner about a new view session.
    """
    try:
        view_session = ViewSession.objects.select_related(
            'share_link__created_by',
            'share_link__document',
            'share_link__dataroom'
        ).get(id=view_session_id)
    except ViewSession.DoesNotExist:
        logger.warning(f"ViewSession with id {view_session_id} not found for email notification.")
        return

    share_link = view_session.share_link

    # Re-check if notifications are still enabled to prevent race conditions.
    if not share_link.receive_email_notification:
        logger.info(f"Email notification for ShareLink {share_link.id} is disabled. Aborting send.")
        return

    owner = share_link.created_by
    
    if not owner or not owner.email:
        logger.info(f"Share link {share_link.id} owner has no email for notification.")
        return

    if share_link.document:
        target_name = share_link.document.name
    elif share_link.dataroom:
        target_name = share_link.dataroom.name
    else:
        logger.error(f"Invalid share link: {share_link}")
        return

    owner_lang = getattr(owner, 'language', 'en') or 'en'

    with translation_override(owner_lang):
        viewer_email = view_session.viewer_email or _("Anonymous")
        location = (
            f"{view_session.city}, {view_session.country}"
            if view_session.city and view_session.country
            else _("Unknown Location")
        )
        context = {
            'owner_name': owner.name or '',
            'target_name': target_name,
            'viewer_email': viewer_email,
            'viewed_at': view_session.viewed_at,
            'ip_address': view_session.ip_address,
            'location': location,
        }
        subject = _("Your shared item '%(target_name)s' was viewed") % {'target_name': target_name}
        text_content = render_to_string('sharelinks/view_notification_email.txt', context)
        html_content = render_to_string('sharelinks/view_notification_email.html', context)

    try:
        send_mail(
            subject=subject,
            message=text_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[owner.email],
            fail_silently=False,
            html_message=html_content
        )
        logger.info(f"Sent view notification email to {owner.email} for ViewSession {view_session_id}.")
    except Exception as e:
        logger.error(f"Failed to send view notification email for ViewSession {view_session_id}: {e}")
