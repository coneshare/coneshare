import logging
import uuid

from core.models import Organization

from .models import AutomationDelivery, AutomationRule

logger = logging.getLogger(__name__)


def _rule_matches_scope(rule, payload):
    share_link_id = payload.get('share_link_id')
    dataroom_id = payload.get('dataroom_id')

    if rule.scope_type == AutomationRule.ScopeType.GLOBAL:
        return True
    if rule.scope_type == AutomationRule.ScopeType.SHARE_LINK:
        return bool(share_link_id) and str(rule.share_link_id) == str(share_link_id)
    if rule.scope_type == AutomationRule.ScopeType.DATAROOM:
        return bool(dataroom_id) and str(rule.dataroom_id) == str(dataroom_id)
    return False


def _rule_subscribes_event(rule, event_type):
    events = rule.subscribed_events or []
    if not isinstance(events, list):
        return False
    return event_type in events


def dispatch_automation_event(event_type: str, payload: dict) -> int:
    """
    Matches active rules for the event and creates pending AutomationDelivery rows.
    Returns the number of delivery rows created.
    """
    organization_id = payload.get('organization_id')
    if not organization_id:
        logger.warning('Automation event dropped: missing organization_id for event=%s', event_type)
        return 0

    try:
        organization = Organization.objects.get(id=organization_id)
    except Organization.DoesNotExist:
        logger.warning('Automation event dropped: invalid organization_id=%s for event=%s', organization_id, event_type)
        return 0

    rules = AutomationRule.objects.filter(
        organization=organization,
        is_active=True,
    ).prefetch_related('destinations')

    created = 0
    for rule in rules:
        if not _rule_subscribes_event(rule, event_type):
            continue
        if not _rule_matches_scope(rule, payload):
            continue

        for destination in rule.destinations.filter(is_active=True):
            AutomationDelivery.objects.create(
                organization=organization,
                rule=rule,
                destination=destination,
                event_type=event_type,
                payload=payload,
                idempotency_key=str(uuid.uuid4()),
            )
            created += 1

    return created
