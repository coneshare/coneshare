from collections import defaultdict
from datetime import timedelta
import logging
from zoneinfo import ZoneInfo

from django.utils.dateparse import parse_datetime
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from django.db import transaction
from django.template.loader import render_to_string

from sharelinks.models import ShareLink, PageView, ViewSession
from automations.models import AutomationDelivery
from backend.utils import parse_user_agent
from .constants import EMAIL_COALESCE_DEBOUNCE_SECONDS

logger = logging.getLogger(__name__)

def _build_notification_headline(viewer: str, target_type: str, target_name: str, has_views: bool, has_downloads: bool) -> str:
    actor = viewer or "A visitor"
    
    if target_type == 'dataroom':
        if has_views and has_downloads:
            return f'{actor} viewed and downloaded files in your dataroom "{target_name}"'
        if has_downloads:
            return f'{actor} downloaded files in your dataroom "{target_name}"'
        return f'{actor} visited your dataroom "{target_name}"'
    else:
        if has_views and has_downloads:
            return f'{actor} viewed and downloaded the document "{target_name}"'
        if has_downloads:
            return f'{actor} downloaded the document "{target_name}"'
        return f'{actor} viewed the document "{target_name}"'



def _get_session_completion_stats(view_session_id: str, since_datetime=None) -> dict:
    """
    Query and compile document reading statistics associated with a view session.
    
    If since_datetime is provided, it filters the PageView records to capture only
    the activity recorded during the current debounced segment window. This prevents
    previously alerted activity in the same session from being repeated in new digests.
    """
    stats = {}
    if not view_session_id:
        return stats

    # 1. Fetch page views for the session, optionally bounded by the current activity segment window
    pvs = PageView.objects.filter(view_session_id=view_session_id)
    if since_datetime:
        pvs = pvs.filter(created_at__gte=since_datetime)
        
    pvs = pvs.select_related(
        'dataroom_visit__dataroom_document__document',
        'view_session__share_link__document'
    )
    
    # 2. Map page views to their resolved parent documents (either through dataroom visits or direct links)
    doc_pvs = defaultdict(list)
    for pv in pvs:
        doc = None
        if pv.dataroom_visit and pv.dataroom_visit.dataroom_document:
            doc = pv.dataroom_visit.dataroom_document.document
        elif pv.view_session.share_link and pv.view_session.share_link.document:
            doc = pv.view_session.share_link.document
            
        if doc:
            doc_pvs[doc.id].append((pv.page_number, pv.duration_seconds, doc.name, doc.num_pages))

    # 3. Aggregate unique pages and total duration read per document to calculate metrics
    for doc_id, pv_list in doc_pvs.items():
        doc_name = pv_list[0][2]
        num_pages = pv_list[0][3] or 1
        
        # Calculate unique page numbers to determine the completion rate fraction
        unique_pages = len(set(p[0] for p in pv_list))
        total_duration = sum(p[1] for p in pv_list)
        
        completion = int((unique_pages / num_pages) * 100) if num_pages > 0 else 0
        completion = min(completion, 100)
        
        # Format total reading duration into human-readable minutes and seconds
        if total_duration >= 60:
            duration_str = f"{total_duration // 60}m {total_duration % 60}s"
        else:
            duration_str = f"{total_duration}s"
            
        if num_pages > 1:
            info = f"{duration_str}, {completion}% read"
        else:
            info = f"{duration_str}"
        stats[doc_id] = {'name': doc_name, 'value': info}
        
    return stats


def _build_show_details_url(payload: dict) -> str:
    if not payload:
        return f"{settings.SITE_DOMAIN}/analytics/view-sessions"

    dataroom_id = payload.get('dataroom_id')
    if dataroom_id:
        return f"{settings.SITE_DOMAIN}/datarooms/{dataroom_id}"

    document_id = payload.get('document_id')
    if document_id:
        return f"{settings.SITE_DOMAIN}/documents/{document_id}"

    file_request_id = payload.get('file_request_id')
    if file_request_id:
        return f"{settings.SITE_DOMAIN}/file-requests/{file_request_id}"

    return f"{settings.SITE_DOMAIN}/analytics/view-sessions"


def _send_coalesced_session_email(owner, recipient_email: str, view_session_id: str, pending_deliveries: list, first_delivery: AutomationDelivery):
    from .tasks import _mark_failure_and_retry
    
    payload = first_delivery.payload or {}

    # Build coalesced context
    dr_name = payload.get('dataroom_name')
    doc_name = payload.get('document_name')
    target_name = dr_name or doc_name or "Shared Item"
    target_type = 'dataroom' if dr_name else 'document'

    viewer_email = payload.get('viewer_email') or "A visitor"

    has_views = any(d.event_type in ('document_viewed', 'dataroom_opened') for d in pending_deliveries)
    has_downloads = any(d.event_type == 'document_downloaded' for d in pending_deliveries)

    headline = _build_notification_headline(viewer_email, target_type, target_name, has_views, has_downloads)
    subject = headline

    # Fetch detailed file view stats (duration and completion rates).
    # To isolate statistics only to the current active segment window (and exclude older
    # activity already alerted on), we find the creation time of the earliest delivery
    # in the current coalesced batch and apply a tiny 5-second buffer.
    earliest_delivery = min(pending_deliveries, key=lambda d: d.created_at)
    since_datetime = earliest_delivery.created_at - timedelta(seconds=5)
    stats = _get_session_completion_stats(view_session_id, since_datetime=since_datetime)
    activity_stats_html = list(stats.values())
    activity_stats_txt = [f"- {item['name']}: {item['value']}" for item in stats.values()]

    event_dt_str = payload.get('event_datetime')
    viewed_at = None
    if event_dt_str:
        try:
            viewed_at = parse_datetime(event_dt_str)
        except Exception:
            pass
    if not viewed_at:
        viewed_at = first_delivery.created_at

    if timezone.is_naive(viewed_at):
        viewed_at = timezone.make_aware(viewed_at, timezone.utc)

    city = payload.get('visitor_city')
    country = payload.get('visitor_country')
    location = f"{city}, {country}" if city and country else "Unknown Location"

    # Query ViewSession to resolve visitor OS and browser metadata
    os_name, browser_name = "Unknown OS", "Unknown Browser"
    if view_session_id:
        try:
            vs = ViewSession.objects.filter(id=view_session_id).first()
            if vs and vs.user_agent:
                os_name, browser_name = parse_user_agent(vs.user_agent)
        except Exception as e:
            logger.warning('Failed to query ViewSession for user agent: %s', e)

    context = {
        'owner_name': owner.name or '',
        'target_name': target_name,
        'headline': headline,
        'viewer_email': viewer_email,
        'viewed_at': viewed_at,
        'ip_address': payload.get('visitor_ip'),
        'location': location,
        'os': os_name,
        'browser': browser_name,
        'activity_stats': activity_stats_html,
        'activity_stats_txt': activity_stats_txt,
        'show_details_url': _build_show_details_url(payload) if view_session_id else None,
    }

    # Send coalesced email
    try:
        try:
            display_timezone = ZoneInfo(settings.DISPLAY_TIME_ZONE)
        except Exception:
            display_timezone = ZoneInfo('UTC')

        with timezone.override(display_timezone):
            text_content = render_to_string('sharelinks/view_notification_email.txt', context)
            html_content = render_to_string('sharelinks/view_notification_email.html', context)

        send_mail(
            subject=subject,
            message=text_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
            html_message=html_content
        )
        logger.info('Sent coalesced view notification email to %s for session %s.', recipient_email, view_session_id)
        
        # Mark successful deliveries atomically
        with transaction.atomic():
            for d in pending_deliveries:
                d.attempt_count += 1
                d.status = AutomationDelivery.Status.SUCCESS
                d.response_code = 200
                d.response_body_excerpt = f'Sent email successfully to {recipient_email}'
                d.delivered_at = timezone.now()
                d.next_retry_at = None
                d.save(update_fields=['attempt_count', 'status', 'response_code', 'response_body_excerpt', 'delivered_at', 'next_retry_at', 'updated_at'])
    except Exception as e:
        logger.error('Failed to send coalesced email notification for session %s: %s', view_session_id, e)
        # Revert PROCESSING status on failure so it can retry
        with transaction.atomic():
            for d in pending_deliveries:
                _mark_failure_and_retry(d, f'Failed to send email: {e}')


def _send_standard_fallback_email(owner, recipient_email: str, delivery: AutomationDelivery):
    from .tasks import _target_description, _build_event_sentence, _display_actor, _mark_success_direct, _mark_failure_and_retry
    
    payload = delivery.payload or {}
    target = _target_description(payload)
    event_type = delivery.event_type
    event_text = _build_event_sentence(event_type, payload)
    viewer_email = payload.get('viewer_email') or "Anonymous"

    # Determine standard fallback headline
    headline = f"Activity alert: {target}"
    if event_type == 'file_request_uploaded':
        uploader = _display_actor(payload.get('uploaded_by_name'), payload.get('uploaded_by_email'), fallback="Someone")
        req_name = payload.get('file_request_name') or "file request"
        headline = f'{uploader} uploaded a file to your file request "{req_name}"'
    elif event_type == 'file_request_malware_detected':
        headline = 'Malware detected in your file request'
    elif event_type == 'file_request_scan_failed':
        headline = 'Malware scanning failed'

    subject = headline
    
    viewed_at = delivery.created_at
    if timezone.is_naive(viewed_at):
        viewed_at = timezone.make_aware(viewed_at, timezone.utc)

    user_agent = payload.get('user_agent') or ''
    os_name, browser_name = parse_user_agent(user_agent)

    city = payload.get('visitor_city')
    country = payload.get('visitor_country')
    location = f"{city}, {country}" if city and country else "Unknown Location"

    context = {
        'owner_name': owner.name or '',
        'target_name': target,
        'headline': headline,
        'event_text': event_text,
        'viewer_email': viewer_email,
        'viewed_at': viewed_at,
        'ip_address': payload.get('visitor_ip'),
        'location': location,
        'os': os_name,
        'browser': browser_name,
        'activity_stats': [],
        'activity_stats_txt': [],
        'show_details_url': _build_show_details_url(payload),
    }

    try:
        try:
            display_timezone = ZoneInfo(settings.DISPLAY_TIME_ZONE)
        except Exception:
            display_timezone = ZoneInfo('UTC')

        with timezone.override(display_timezone):
            text_content = render_to_string('sharelinks/view_notification_email.txt', context)
            html_content = render_to_string('sharelinks/view_notification_email.html', context)

        send_mail(
            subject=subject,
            message=text_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[recipient_email],
            fail_silently=False,
            html_message=html_content
        )
        logger.info('Sent notification email to %s for delivery %s.', recipient_email, delivery.id)
        _mark_success_direct(delivery, f'Sent email successfully to {recipient_email}')
    except Exception as e:
        logger.error('Failed to send email notification for delivery %s: %s', delivery.id, e)
        _mark_failure_and_retry(delivery, f'Failed to send email: {e}')


def handle_email_delivery(delivery: AutomationDelivery):
    # Support retrying failed deliveries
    if delivery.status not in (AutomationDelivery.Status.PENDING, AutomationDelivery.Status.FAILED):
        logger.info('Automation delivery already processed: delivery_id=%s status=%s', delivery.id, delivery.status)
        return

    # Defensive check for missing rule owner or email
    owner = delivery.rule.created_by
    if not owner or not owner.email:
        logger.warning('Automation delivery skipped: owner has no email address: delivery_id=%s', delivery.id)
        from .tasks import _mark_non_retryable_failure
        _mark_non_retryable_failure(delivery, 'Owner has no email address.')
        return
    recipient_email = owner.email

    # Prior to SMTP dispatch, check if the toggle is checked on the referenced ShareLink
    payload = delivery.payload or {}
    share_link_id = payload.get('share_link_id')
    if share_link_id:
        try:
            share_link = ShareLink.objects.filter(id=share_link_id).first()
            if share_link and not share_link.receive_email_notification:
                logger.info('Skipping email alert: notifications disabled for link %s', share_link_id)
                from .tasks import _mark_success_direct
                _mark_success_direct(delivery, 'Skipped: receive_email_notification is False on ShareLink.')
                return
        except Exception as e:
            logger.warning('Failed to query ShareLink for notification check: %s', e)

    view_session_id = payload.get('view_session_id')
    if view_session_id:
        should_send = False
        pending_deliveries = []

        # Query all currently pending/failed deliveries for this session with a row lock to prevent race conditions.
        # Filter by destination_id (indexed field) to avoid unindexed joins.
        with transaction.atomic():
            session_deliveries = list(AutomationDelivery.objects.select_for_update().filter(
                destination_id=delivery.destination_id,
                status__in=[AutomationDelivery.Status.PENDING, AutomationDelivery.Status.FAILED],
                payload__view_session_id=view_session_id
            ).order_by('created_at'))

            # If the triggering delivery was already processed by a concurrent task, exit early
            if not any(d.id == delivery.id for d in session_deliveries):
                return

            latest_delivery = session_deliveries[-1]
            # If the latest activity was within the last 60 seconds, wait for the visitor to go idle.
            # Subsequent scheduled tasks will handle it when they fire.
            idle_threshold_seconds = EMAIL_COALESCE_DEBOUNCE_SECONDS
            time_since_latest = (timezone.now() - latest_delivery.created_at).total_seconds()
            if time_since_latest >= idle_threshold_seconds:
                pending_deliveries = session_deliveries
                # Atomically update all selected deliveries to PROCESSING under the lock to claim them
                AutomationDelivery.objects.filter(
                    id__in=[d.id for d in pending_deliveries]
                ).update(status=AutomationDelivery.Status.PROCESSING)
                should_send = True
            else:
                logger.debug(
                    'Automation delivery debounced: visitor is still active (%s seconds since last event). view_session_id=%s',
                    int(time_since_latest),
                    view_session_id
                )
                return

        if should_send and pending_deliveries:
            _send_coalesced_session_email(
                owner=owner,
                recipient_email=recipient_email,
                view_session_id=view_session_id,
                pending_deliveries=pending_deliveries,
                first_delivery=delivery
            )
        return

    # Standard fallback for non-session deliveries (e.g., file request upload alerts)
    # Mark the delivery as PROCESSING first to claim it
    with transaction.atomic():
        # Re-fetch with row lock to prevent race conditions
        locked_delivery = AutomationDelivery.objects.select_for_update().filter(
            id=delivery.id,
            status__in=[AutomationDelivery.Status.PENDING, AutomationDelivery.Status.FAILED]
        ).first()
        if not locked_delivery:
            return
        
        locked_delivery.status = AutomationDelivery.Status.PROCESSING
        locked_delivery.save(update_fields=['status', 'updated_at'])

    _send_standard_fallback_email(
        owner=owner,
        recipient_email=recipient_email,
        delivery=locked_delivery
    )
