import hashlib
import hmac
import json
import logging
from datetime import timedelta
from urllib.parse import urlparse

import requests
from celery import shared_task
from django.utils import timezone

from .models import AutomationDelivery
from .services import dispatch_automation_event

logger = logging.getLogger(__name__)

MAX_DELIVERY_ATTEMPTS = 3
BASE_RETRY_SECONDS = 60
RESPONSE_EXCERPT_LIMIT = 1000


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


def _build_request_payload(delivery: AutomationDelivery) -> dict:
    destination_type = delivery.destination.destination_type
    endpoint_url = (delivery.destination.endpoint_url or '').lower()

    event_type = delivery.event_type
    share_link_id = delivery.payload.get('share_link_id')
    dataroom_id = delivery.payload.get('dataroom_id')
    dataroom_name = delivery.payload.get('dataroom_name')
    dataroom_folder_id = delivery.payload.get('dataroom_folder_id')
    dataroom_folder_name = delivery.payload.get('dataroom_folder_name')
    document_name = delivery.payload.get('document_name')
    viewer_email = delivery.payload.get('viewer_email') or 'anonymous'
    uploaded_by_email = delivery.payload.get('uploaded_by_email') or 'anonymous'
    uploaded_by_name = delivery.payload.get('uploaded_by_name') or 'unknown'
    uploaded_file_name = delivery.payload.get('uploaded_file_name')
    file_request_slug = delivery.payload.get('file_request_slug')

    if event_type == 'file_request_uploaded':
        text = f"[Coneshare] {event_type} | uploader={uploaded_by_name}<{uploaded_by_email}>"
        if uploaded_file_name:
            text += f" | file={uploaded_file_name}"
        if file_request_slug:
            text += f" | file_request={file_request_slug}"
    else:
        text = f"[Coneshare] {event_type} | viewer={viewer_email}"
        if share_link_id:
            text += f" | link={share_link_id}"
        if document_name:
            text += f" | document={document_name}"
        if dataroom_id:
            text += f" | dataroom={dataroom_id}"
        if dataroom_name:
            text += f" | dataroom_name={dataroom_name}"
        if dataroom_folder_id:
            text += f" | folder={dataroom_folder_id}"
        if dataroom_folder_name:
            text += f" | folder_name={dataroom_folder_name}"

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

    return delivery.payload


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
        _mark_failure_and_retry(delivery, 'Rule or destination is inactive.')
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
