import hashlib
import hmac
import json
import logging
from datetime import timedelta

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
    if delivery.destination.destination_type != 'slack':
        return delivery.payload

    # Slack incoming webhook requires "text" at minimum.
    event_type = delivery.event_type
    share_link_id = delivery.payload.get('share_link_id')
    dataroom_id = delivery.payload.get('dataroom_id')
    viewer_email = delivery.payload.get('viewer_email') or 'anonymous'

    text = f"[Coneshare] {event_type} | viewer={viewer_email}"
    if share_link_id:
        text += f" | link={share_link_id}"
    if dataroom_id:
        text += f" | dataroom={dataroom_id}"

    return {
        'text': text,
    }


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
