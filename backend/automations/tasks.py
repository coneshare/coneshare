import hashlib
import hmac
import json
import logging
from datetime import timedelta
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import requests
from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
from django.template.loader import render_to_string
from django.utils.dateparse import parse_datetime
from django.utils import timezone
from django.utils.translation import gettext as _, override as translation_override

from .models import AutomationDelivery
from .services import dispatch_automation_event
from sharelinks.models import ShareLink
from .emails import handle_email_delivery

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


def _display_actor(name: str | None, email: str | None, fallback: str | None = None) -> str:
    name = (name or '').strip()
    email = (email or '').strip()
    if name and email:
        return f'{name} <{email}>'
    if email:
        return email
    if name:
        return name
    return fallback if fallback is not None else _('Anonymous')


def _target_description(payload: dict) -> str:
    document_name = payload.get('document_name')
    dataroom_name = payload.get('dataroom_name')
    dataroom_folder_name = payload.get('dataroom_folder_name')

    if document_name:
        if dataroom_folder_name and dataroom_name:
            return _('document "%(document_name)s" in folder "%(folder_name)s" in dataroom "%(dataroom_name)s"') % {
                'document_name': document_name,
                'folder_name': dataroom_folder_name,
                'dataroom_name': dataroom_name,
            }
        if dataroom_name:
            return _('document "%(document_name)s" in dataroom "%(dataroom_name)s"') % {
                'document_name': document_name,
                'dataroom_name': dataroom_name,
            }
        return _('document "%(document_name)s"') % {'document_name': document_name}
    if dataroom_folder_name and dataroom_name:
        return _('folder "%(folder_name)s" in dataroom "%(dataroom_name)s"') % {
            'folder_name': dataroom_folder_name,
            'dataroom_name': dataroom_name,
        }
    if dataroom_folder_name:
        return _('folder "%(folder_name)s"') % {'folder_name': dataroom_folder_name}
    if dataroom_name:
        return _('dataroom "%(dataroom_name)s"') % {'dataroom_name': dataroom_name}
    return _('item')


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
        details.append(f'{_("Time:")} {event_time}')
    if location:
        details.append(f'{_("Approximate location:")} {location}')

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
        lines.append(_('Additional fields: %(count)s') % {'count': remaining_count})

    return f'{message}\n' + '\n'.join(lines)


def _build_event_sentence(event_type: str, payload: dict) -> str:
    viewer = _display_actor(None, payload.get('viewer_email'))
    target = _target_description(payload)

    if event_type == 'document_viewed':
        return _('Your shared %(target)s was viewed by %(viewer)s.') % {
            'target': target,
            'viewer': viewer,
        }

    if event_type == 'dataroom_opened':
        return _('Your shared %(target)s was opened by %(viewer)s.') % {
            'target': target,
            'viewer': viewer,
        }

    if event_type == 'document_downloaded':
        return _('Your shared %(target)s was downloaded by %(viewer)s.') % {
            'target': target,
            'viewer': viewer,
        }

    if event_type == 'email_identified':
        return _('%(viewer)s identified their email address for your shared %(target)s.') % {
            'viewer': viewer,
            'target': target,
        }

    thread_subject = payload.get('thread_subject') or _('Q&A thread')
    sender_type = payload.get('sender_type') or 'user'
    actor = viewer if sender_type == "viewer" else _("A team member")

    if event_type == 'qna_thread_created':
        return _('%(actor)s opened Q&A thread "%(thread_subject)s" on your shared %(target)s.') % {
            'actor': actor,
            'thread_subject': thread_subject,
            'target': target,
        }

    if event_type == 'qna_message_created':
        return _('%(actor)s replied to Q&A thread "%(thread_subject)s" on your shared %(target)s.') % {
            'actor': actor,
            'thread_subject': thread_subject,
            'target': target,
        }

    if event_type == 'qna_thread_closed':
        return _('Q&A thread "%(thread_subject)s" was closed on your shared %(target)s.') % {
            'thread_subject': thread_subject,
            'target': target,
        }

    if event_type == 'qna_thread_reopened':
        return _('Q&A thread "%(thread_subject)s" was reopened on your shared %(target)s.') % {
            'thread_subject': thread_subject,
            'target': target,
        }

    uploader = _display_actor(
        payload.get('uploaded_by_name'),
        payload.get('uploaded_by_email'),
        fallback=_('Unknown uploader'),
    )
    uploaded_file_name = payload.get('uploaded_file_name')
    file_request_name = payload.get('file_request_name') or payload.get('file_request_slug')

    if event_type == 'file_request_uploaded':
        if uploaded_file_name and file_request_name:
            message = _('%(uploader)s uploaded "%(file_name)s" to file request "%(req_name)s".') % {
                'uploader': uploader,
                'file_name': uploaded_file_name,
                'req_name': file_request_name,
            }
        elif uploaded_file_name:
            message = _('%(uploader)s uploaded "%(file_name)s".') % {
                'uploader': uploader,
                'file_name': uploaded_file_name,
            }
        elif file_request_name:
            message = _('%(uploader)s uploaded to file request "%(req_name)s".') % {
                'uploader': uploader,
                'req_name': file_request_name,
            }
        else:
            message = _('%(uploader)s uploaded a file.') % {'uploader': uploader}
        return _append_custom_field_summary(message, payload)

    if event_type == 'file_request_malware_detected':
        if uploaded_file_name and file_request_name:
            return _('Malware was detected in uploaded file "%(file_name)s" to file request "%(req_name)s" from %(uploader)s.') % {
                'file_name': uploaded_file_name,
                'req_name': file_request_name,
                'uploader': uploader,
            }
        elif uploaded_file_name:
            return _('Malware was detected in uploaded file "%(file_name)s" from %(uploader)s.') % {
                'file_name': uploaded_file_name,
                'uploader': uploader,
            }
        elif file_request_name:
            return _('Malware was detected in uploaded file to file request "%(req_name)s" from %(uploader)s.') % {
                'req_name': file_request_name,
                'uploader': uploader,
            }
        return _('Malware was detected in uploaded file from %(uploader)s.') % {'uploader': uploader}

    if event_type == 'file_request_scan_failed':
        if uploaded_file_name and file_request_name:
            return _('Malware scanning failed for uploaded file "%(file_name)s" to file request "%(req_name)s" from %(uploader)s.') % {
                'file_name': uploaded_file_name,
                'req_name': file_request_name,
                'uploader': uploader,
            }
        elif uploaded_file_name:
            return _('Malware scanning failed for uploaded file "%(file_name)s" from %(uploader)s.') % {
                'file_name': uploaded_file_name,
                'uploader': uploader,
            }
        elif file_request_name:
            return _('Malware scanning failed for uploaded file to file request "%(req_name)s" from %(uploader)s.') % {
                'req_name': file_request_name,
                'uploader': uploader,
            }
        return _('Malware scanning failed for uploaded file from %(uploader)s.') % {'uploader': uploader}

    return _('Coneshare automation event "%(event_type)s" was triggered for %(target)s.') % {
        'event_type': event_type,
        'target': target,
    }


def _build_event_text(delivery: AutomationDelivery) -> str:
    payload = delivery.payload or {}
    event_type = delivery.event_type
    sentence = _build_event_sentence(event_type, payload)
    return _append_event_details(sentence, payload)


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


def _mark_success_direct(delivery: AutomationDelivery, message: str):
    delivery.attempt_count += 1
    delivery.status = AutomationDelivery.Status.SUCCESS
    delivery.response_code = 200
    delivery.response_body_excerpt = (message or '')[:RESPONSE_EXCERPT_LIMIT]
    delivery.delivered_at = timezone.now()
    delivery.next_retry_at = None
    delivery.save(update_fields=['attempt_count', 'status', 'response_code', 'response_body_excerpt', 'delivered_at', 'next_retry_at', 'updated_at'])


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

    if delivery.destination.destination_type == 'email':
        handle_email_delivery(delivery)
        return

    owner = delivery.rule.created_by
    owner_lang = getattr(owner, 'language', 'en') or 'en'
    with translation_override(owner_lang):
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
