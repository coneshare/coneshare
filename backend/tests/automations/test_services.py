import pytest
from unittest.mock import patch

from automations.models import AutomationDelivery, AutomationDestination, AutomationRule
from automations.services import dispatch_automation_event
from core.models import Organization, User


pytestmark = pytest.mark.django_db


def test_dispatch_creates_delivery_for_matching_global_rule(user):
    destination = AutomationDestination.objects.create(
        organization=user.organization,
        created_by=user,
        name='Global Destination',
        destination_type='webhook',
        endpoint_url='https://example.com/global',
    )
    rule = AutomationRule.objects.create(
        organization=user.organization,
        created_by=user,
        name='Global Rule',
        scope_type='global',
        subscribed_events=['link_viewed'],
        actions=[{'type': 'notify_destination'}],
    )
    rule.destinations.add(destination)

    created_count = dispatch_automation_event(
        event_type='link_viewed',
        payload={
            'organization_id': str(user.organization.id),
            'share_link_id': 'fake-link-id',
        },
    )

    assert created_count == 1
    assert AutomationDelivery.objects.count() == 1
    delivery = AutomationDelivery.objects.first()
    assert delivery.rule == rule
    assert delivery.destination == destination
    assert delivery.event_type == 'link_viewed'


def test_dispatch_respects_share_link_scope(user, share_link):
    destination = AutomationDestination.objects.create(
        organization=user.organization,
        created_by=user,
        name='Scoped Destination',
        destination_type='webhook',
        endpoint_url='https://example.com/scoped',
    )
    rule = AutomationRule.objects.create(
        organization=user.organization,
        created_by=user,
        name='Scoped Rule',
        scope_type='share_link',
        share_link=share_link,
        subscribed_events=['document_viewed'],
        actions=[{'type': 'notify_destination'}],
    )
    rule.destinations.add(destination)

    # Mismatch link id -> no delivery
    created_mismatch = dispatch_automation_event(
        event_type='document_viewed',
        payload={
            'organization_id': str(user.organization.id),
            'share_link_id': 'another-link-id',
        },
    )
    assert created_mismatch == 0
    assert AutomationDelivery.objects.count() == 0

    # Matching link id -> delivery
    created_match = dispatch_automation_event(
        event_type='document_viewed',
        payload={
            'organization_id': str(user.organization.id),
            'share_link_id': str(share_link.id),
        },
    )
    assert created_match == 1
    assert AutomationDelivery.objects.count() == 1


def test_dispatch_ignores_inactive_rule_or_destination(user):
    inactive_destination = AutomationDestination.objects.create(
        organization=user.organization,
        created_by=user,
        name='Inactive Destination',
        destination_type='webhook',
        endpoint_url='https://example.com/inactive-dest',
        is_active=False,
    )
    active_destination = AutomationDestination.objects.create(
        organization=user.organization,
        created_by=user,
        name='Active Destination',
        destination_type='webhook',
        endpoint_url='https://example.com/active-dest',
        is_active=True,
    )

    inactive_rule = AutomationRule.objects.create(
        organization=user.organization,
        created_by=user,
        name='Inactive Rule',
        scope_type='global',
        subscribed_events=['link_viewed'],
        actions=[{'type': 'notify_destination'}],
        is_active=False,
    )
    inactive_rule.destinations.add(active_destination)

    active_rule = AutomationRule.objects.create(
        organization=user.organization,
        created_by=user,
        name='Active Rule',
        scope_type='global',
        subscribed_events=['link_viewed'],
        actions=[{'type': 'notify_destination'}],
        is_active=True,
    )
    active_rule.destinations.add(inactive_destination)

    created_count = dispatch_automation_event(
        event_type='link_viewed',
        payload={'organization_id': str(user.organization.id)},
    )

    assert created_count == 0
    assert AutomationDelivery.objects.count() == 0


def test_dispatch_drops_event_with_invalid_org_id(user):
    other_org = Organization.objects.create(name='Other Org')
    User.objects.create_user(
        username='other@example.com',
        email='other@example.com',
        password='password',
        organization=other_org,
    )

    created_count = dispatch_automation_event(
        event_type='link_viewed',
        payload={'organization_id': 'non-existent-org-id'},
    )

    assert created_count == 0
    assert AutomationDelivery.objects.count() == 0


@patch('automations.tasks.deliver_automation_delivery_task.delay')
def test_dispatch_queues_delivery_execution_task(mock_delay, user):
    destination = AutomationDestination.objects.create(
        organization=user.organization,
        created_by=user,
        name='Queue Destination',
        destination_type='webhook',
        endpoint_url='https://example.com/queue',
    )
    rule = AutomationRule.objects.create(
        organization=user.organization,
        created_by=user,
        name='Queue Rule',
        scope_type='global',
        subscribed_events=['link_viewed'],
        actions=[{'type': 'notify_destination'}],
    )
    rule.destinations.add(destination)

    created_count = dispatch_automation_event(
        event_type='link_viewed',
        payload={'organization_id': str(user.organization.id)},
    )

    assert created_count == 1
    delivery = AutomationDelivery.objects.get()
    mock_delay.assert_called_once_with(str(delivery.id))
