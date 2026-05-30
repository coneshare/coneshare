import hashlib
import hmac
import json
import logging
from datetime import timedelta
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import requests
from celery import shared_task
from django.conf import settings
from django.utils.dateparse import parse_datetime
from django.utils import timezone

from .models import AutomationDelivery
from .services import dispatch_automation_event

logger = logging.getLogger(__name__)

MAX_DELIVERY_ATTEMPTS = 3
BASE_RETRY_SECONDS = 60
RESPONSE_EXCERPT_LIMIT = 1000
MAX_CHAT_CUSTOM_FIELD_LINES = 5


def _build_signature(secret: str, payload: dict) -> str:
    body = json.dumps(payload, sort_keys=True, separators=(',', ':')).encode('utf-8')
    digest = hmac.new(secret.encode('utf-8'), body, hashlib.sha256).hexdigest()
    return f'sha256={digest}'


def _build_headers(delivery: AutomationDelivery, request_payload: dict) -> dict:
    headers = {'Content-Type': 'application/json'}
    if isinstance(delivery.destination.headers, dict):
        headers.update(delivery.destination.headers)

    if delivery.idempotency_key:
        headers['X-Coneshare-Idempotency-Key'] = delivery.idempotency_key

    if delivery.destination.signing_secret:
        headers['X-Coneshare-Signature'] = _build_signature(delivery.destination.signing_secret, request_payload)

    return headers


def _display_actor(name: str | None, email: str | None, fallback: str = 'Anonymous') -> str:
    name = (name or '').strip()
    email = (email or '').strip()
    if name and email:
        return f'{name} <{email}>'
    if email:
        return email
    if name:
        return name
    return fallback


def _target_description(payload: dict) -> str:
    document_name = payload.get('document_name')
    dataroom_name = payload.get('dataroom_name')
    dataroom_folder_name = payload.get('dataroom_folder_name')

    if document_name:
        return f'document "{document_name}"'
    if dataroom_folder_name and dataroom_name:
        return f'folder "{dataroom_folder_name}" in dataroom "{dataroom_name}"'
    if dataroom_folder_name:
        return f'folder "{dataroom_folder_name}"'
    if dataroom_name:
        return f'dataroom "{dataroom_name}"'
    return 'item'


def _format_event_time(value: str | None) -> str | None:
    if not value:
        return None

    parsed = parse_datetime(value)
    if not parsed:
        return value
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())

    try:
        display_timezone = ZoneInfo(settings.DISPLAY_TIME_ZONE)
    except ZoneInfoNotFoundError:
        display_timezone = ZoneInfo('UTC')

    return timezone.localtime(parsed, display_timezone).strftime('%b %-d, %Y, %-I:%M %p')


def _approximate_location(payload: dict) -> str | None:
    city = (payload.get('visitor_city') or '').strip()
    country = (payload.get('visitor_country') or '').strip()

    if city and country:
        return f'{city}, {country}'
    if city:
        return city
    if country:
        return country
    return None


def _append_event_details(message: str, payload: dict) -> str:
    details = []
    event_time = _format_event_time(payload.get('event_datetime'))
    location = _approximate_location(payload)

    if event_time:
        details.append(f'Time: {event_time}')
    if location:
        details.append(f'Approximate location: {location}')

    if not details:
        return message
    return f'{message}\n' + '\n'.join(details)


def _append_custom_field_summary(message: str, payload: dict) -> str:
    values = payload.get('custom_field_values')
    if not isinstance(values, dict) or not values:
        return message

    lines = []
    for key, value in list(values.items())[:MAX_CHAT_CUSTOM_FIELD_LINES]:
        label = str(key).replace('_', ' ').strip().title() or key
        lines.append(f'{label}: {value}')

    remaining_count = len(values) - len(lines)
    if remaining_count > 0:
        lines.append(f'Additional fields: {remaining_count}')

    return f'{message}\n' + '\n'.join(lines)


def _build_event_text(delivery: AutomationDelivery) -> str:
    payload = delivery.payload or {}
    event_type = delivery.event_type

    viewer = _display_actor(None, payload.get('viewer_email'))
    target = _target_description(payload)

    if event_type == 'document_viewed':
        return _append_event_details(f'Your shared {target} was viewed by {viewer}.', payload)

    if event_type == 'dataroom_opened':
        return _append_event_details(f'Your shared {target} was opened by {viewer}.', payload)

    if event_type == 'document_downloaded':
        return _append_event_details(f'Your shared {target} was downloaded by {viewer}.', payload)

    if event_type == 'email_identified':
        return _append_event_details(f'{viewer} identified their email address for your shared {target}.', payload)

    thread_subject = payload.get('thread_subject') or 'Q&A thread'
    sender_type = payload.get('sender_type') or 'user'

    if event_type == 'qna_thread_created':
        return _append_event_details(f'{viewer if sender_type == "viewer" else "A team member"} opened Q&A thread "{thread_subject}" on your shared {target}.', payload)

    if event_type == 'qna_message_created':
        return _append_event_details(f'{viewer if sender_type == "viewer" else "A team member"} replied to Q&A thread "{thread_subject}" on your shared {target}.', payload)

    if event_type == 'qna_thread_closed':
        return _append_event_details(f'Q&A thread "{thread_subject}" was closed on your shared {target}.', payload)

    if event_type == 'qna_thread_reopened':
        return _append_event_details(f'Q&A thread "{thread_subject}" was reopened on your shared {target}.', payload)

    uploader = _display_actor(
        payload.get('uploaded_by_name'),
        payload.get('uploaded_by_email'),
        fallback='Unknown uploader',
    )
    uploaded_file_name = payload.get('uploaded_file_name')
    file_request_name = payload.get('file_request_name') or payload.get('file_request_slug')
    file_request_text = f' to file request "{file_request_name}"' if file_request_name else ''
    file_text = f' "{uploaded_file_name}"' if uploaded_file_name else ''

    if event_type == 'file_request_uploaded':
        message = f'{uploader} uploaded{file_text}{file_request_text}.'
        return _append_event_details(_append_custom_field_summary(message, payload), payload)

    if event_type == 'file_request_malware_detected':
        return _append_event_details(
            f'Malware was detected in uploaded file{file_text}{file_request_text} from {uploader}.',
            payload,
        )

    if event_type == 'file_request_scan_failed':
        return _append_event_details(
            f'Malware scanning failed for uploaded file{file_text}{file_request_text} from {uploader}.',
            payload,
        )

    return _append_event_details(f'Coneshare automation event "{event_type}" was triggered for {target}.', payload)


def _build_request_payload(delivery: AutomationDelivery) -> dict:
    destination_type = delivery.destination.destination_type
    endpoint_url = (delivery.destination.endpoint_url or '').lower()

    event_type = delivery.event_type
    text = _build_event_text(delivery)

    if destination_type == 'slack':
        # Slack incoming webhook requires "text" at minimum.
        return {'text': text}

    if destination_type == 'wechat' or 'qyapi.weixin.qq.com/cgi-bin/webhook/send' in endpoint_url:
        # WeCom custom bot requires msgtype + text.content.
        return {
            'msgtype': 'text',
            'text': {
                'content': text,
            },
        }

    if destination_type == 'feishu' or 'feishu.cn/flow/api/trigger-webhook/' in endpoint_url:
        # FeiShu flow webhook payload example expects msg_type + content string.
        return {
            'msg_type': 'text',
            'content': text,
        }

    parsed = urlparse(endpoint_url) if endpoint_url else None
    discord_host = (parsed.netloc or '') if parsed else ''
    discord_path = (parsed.path or '') if parsed else ''
    is_discord_webhook = (
        destination_type == 'discord'
        or ('discord.com' in discord_host and '/api/webhooks/' in discord_path)
        or ('discordapp.com' in discord_host and '/api/webhooks/' in discord_path)
    )
    if is_discord_webhook:
        # Discord webhook message payload uses "content".
        return {
            'content': text,
        }

    webhook_payload = dict(delivery.payload or {})
    webhook_payload['event_type'] = event_type
    return webhook_payload


def _mark_success(delivery: AutomationDelivery, response):
    delivery.status = AutomationDelivery.Status.SUCCESS
    delivery.response_code = response.status_code
    delivery.response_body_excerpt = (response.text or '')[:RESPONSE_EXCERPT_LIMIT]
    delivery.delivered_at = timezone.now()
    delivery.next_retry_at = None
    delivery.save(update_fields=['status', 'response_code', 'response_body_excerpt', 'delivered_at', 'next_retry_at', 'updated_at'])


def _mark_failure_and_retry(delivery: AutomationDelivery, message: str, response_code=None):
    delivery.attempt_count += 1
    delivery.response_code = response_code
    delivery.response_body_excerpt = (message or '')[:RESPONSE_EXCERPT_LIMIT]

    if delivery.attempt_count >= MAX_DELIVERY_ATTEMPTS:
        delivery.status = AutomationDelivery.Status.DEAD_LETTER
        delivery.next_retry_at = None
        delivery.save(update_fields=['attempt_count', 'response_code', 'response_body_excerpt', 'status', 'next_retry_at', 'updated_at'])
        return

    countdown = BASE_RETRY_SECONDS * (2 ** (delivery.attempt_count - 1))
    delivery.status = AutomationDelivery.Status.FAILED
    delivery.next_retry_at = timezone.now() + timedelta(seconds=countdown)
    delivery.save(update_fields=['attempt_count', 'response_code', 'response_body_excerpt', 'status', 'next_retry_at', 'updated_at'])

    deliver_automation_delivery_task.apply_async(args=[str(delivery.id)], countdown=countdown)


def _mark_non_retryable_failure(delivery: AutomationDelivery, message: str, response_code=None):
    delivery.attempt_count += 1
    delivery.response_code = response_code
    delivery.response_body_excerpt = (message or '')[:RESPONSE_EXCERPT_LIMIT]
    delivery.status = AutomationDelivery.Status.DEAD_LETTER
    delivery.next_retry_at = None
    delivery.save(
        update_fields=[
            'attempt_count',
            'response_code',
            'response_body_excerpt',
            'status',
            'next_retry_at',
            'updated_at',
        ]
    )


@shared_task
def dispatch_automation_event_task(event_type: str, payload: dict):
    return dispatch_automation_event(event_type=event_type, payload=payload)


@shared_task
def deliver_automation_delivery_task(delivery_id: str):
    try:
        delivery = AutomationDelivery.objects.select_related('destination', 'rule').get(id=delivery_id)
    except AutomationDelivery.DoesNotExist:
        logger.warning('AutomationDelivery not found: %s', delivery_id)
        return

    if not delivery.rule.is_active or not delivery.destination.is_active:
        logger.debug(
            'Automation delivery skipped due to inactive state: delivery_id=%s rule_active=%s destination_active=%s',
            delivery_id,
            delivery.rule.is_active,
            delivery.destination.is_active,
        )
        _mark_non_retryable_failure(delivery, 'Rule or destination is inactive.')
        return

    request_payload = _build_request_payload(delivery)
    logger.info(
        'Automation delivery prepared: delivery_id=%s destination_type=%s method=%s url=%s payload_keys=%s has_text=%s',
        delivery_id,
        delivery.destination.destination_type,
        delivery.destination.http_method,
        delivery.destination.endpoint_url,
        sorted(list(request_payload.keys())) if isinstance(request_payload, dict) else type(request_payload).__name__,
        bool(isinstance(request_payload, dict) and request_payload.get('text')),
    )

    logger.debug(f"Webhook URL: {delivery.destination.endpoint_url}, json_data: {request_payload}")
    try:
        response = requests.request(
            method=delivery.destination.http_method,
            url=delivery.destination.endpoint_url,
            json=request_payload,
            headers=_build_headers(delivery, request_payload),
            timeout=10,
        )
    except requests.RequestException as exc:
        logger.warning('Automation delivery request exception: delivery_id=%s error=%s', delivery_id, exc)
        _mark_failure_and_retry(delivery, f'Request failed: {exc}')
        return

    if 200 <= response.status_code < 300:
        logger.info(
            'Automation delivery success: delivery_id=%s status_code=%s response_excerpt=%s',
            delivery_id,
            response.status_code,
            (response.text or '')[:200],
        )
        _mark_success(delivery, response)
    else:
        logger.error(
            'Automation delivery failed: delivery_id=%s status_code=%s response_excerpt=%s payload=%s',
            delivery_id,
            response.status_code,
            (response.text or '')[:200],
            request_payload,
        )
        _mark_failure_and_retry(
            delivery,
            message=f'HTTP {response.status_code}: {response.text}',
            response_code=response.status_code,
        )
