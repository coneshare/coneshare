import pytest
from unittest.mock import patch

from automations.models import AutomationDelivery, AutomationDestination, AutomationRule
from automations.services import dispatch_automation_event, ensure_default_email_automation
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
        subscribed_events=['document_viewed'],
        actions=[{'type': 'notify_destination'}],
    )
    rule.destinations.add(destination)

    created_count = dispatch_automation_event(
        event_type='document_viewed',
        payload={
            'organization_id': str(user.organization.id),
            'owner_user_id': str(user.id),
            'share_link_id': 'fake-link-id',
        },
    )

    assert created_count == 1
    assert AutomationDelivery.objects.count() == 1
    delivery = AutomationDelivery.objects.first()
    assert delivery.rule == rule
    assert delivery.destination == destination
    assert delivery.event_type == 'document_viewed'


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
            'owner_user_id': str(user.id),
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
            'owner_user_id': str(user.id),
            'share_link_id': str(share_link.id),
        },
    )
    assert created_match == 1
    assert AutomationDelivery.objects.count() == 1


def test_dispatch_creates_delivery_for_file_request_uploaded_event(user):
    destination = AutomationDestination.objects.create(
        organization=user.organization,
        created_by=user,
        name='File Request Destination',
        destination_type='webhook',
        endpoint_url='https://example.com/file-request',
    )
    rule = AutomationRule.objects.create(
        organization=user.organization,
        created_by=user,
        name='File Request Rule',
        scope_type='global',
        subscribed_events=['file_request_uploaded'],
        actions=[{'type': 'notify_destination'}],
    )
    rule.destinations.add(destination)

    created_count = dispatch_automation_event(
        event_type='file_request_uploaded',
        payload={
            'organization_id': str(user.organization.id),
            'owner_user_id': str(user.id),
            'file_request_id': 'fr-1',
            'document_id': 'doc-1',
            'uploaded_by_email': 'uploader@example.com',
        },
    )

    assert created_count == 1
    delivery = AutomationDelivery.objects.get()
    assert delivery.event_type == 'file_request_uploaded'


def test_dispatch_creates_delivery_for_file_request_malware_detected_event(user):
    destination = AutomationDestination.objects.create(
        organization=user.organization,
        created_by=user,
        name='File Request Security Destination',
        destination_type='webhook',
        endpoint_url='https://example.com/file-request-security',
    )
    rule = AutomationRule.objects.create(
        organization=user.organization,
        created_by=user,
        name='File Request Security Rule',
        scope_type='global',
        subscribed_events=['file_request_malware_detected'],
        actions=[{'type': 'notify_destination'}],
    )
    rule.destinations.add(destination)

    created_count = dispatch_automation_event(
        event_type='file_request_malware_detected',
        payload={
            'organization_id': str(user.organization.id),
            'owner_user_id': str(user.id),
            'file_request_id': 'fr-1',
            'uploaded_by_email': 'uploader@example.com',
            'uploaded_file_name': 'invoice.exe',
        },
    )

    assert created_count == 1
    delivery = AutomationDelivery.objects.get()
    assert delivery.event_type == 'file_request_malware_detected'


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
        subscribed_events=['document_viewed'],
        actions=[{'type': 'notify_destination'}],
        is_active=False,
    )
    inactive_rule.destinations.add(active_destination)

    active_rule = AutomationRule.objects.create(
        organization=user.organization,
        created_by=user,
        name='Active Rule',
        scope_type='global',
        subscribed_events=['document_viewed'],
        actions=[{'type': 'notify_destination'}],
        is_active=True,
    )
    active_rule.destinations.add(inactive_destination)

    created_count = dispatch_automation_event(
        event_type='document_viewed',
        payload={
            'organization_id': str(user.organization.id),
            'owner_user_id': str(user.id),
        },
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
        event_type='document_viewed',
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
        subscribed_events=['document_viewed'],
        actions=[{'type': 'notify_destination'}],
    )
    rule.destinations.add(destination)

    created_count = dispatch_automation_event(
        event_type='document_viewed',
        payload={
            'organization_id': str(user.organization.id),
            'owner_user_id': str(user.id),
        },
    )

    assert created_count == 1
    delivery = AutomationDelivery.objects.get()
    mock_delay.assert_called_once_with(str(delivery.id))


def test_dispatch_drops_event_with_missing_owner_user_id(user):
    destination = AutomationDestination.objects.create(
        organization=user.organization,
        created_by=user,
        name='Owner Destination',
        destination_type='webhook',
        endpoint_url='https://example.com/owner',
    )
    rule = AutomationRule.objects.create(
        organization=user.organization,
        created_by=user,
        name='Owner Rule',
        scope_type='global',
        subscribed_events=['document_viewed'],
        actions=[{'type': 'notify_destination'}],
    )
    rule.destinations.add(destination)

    created_count = dispatch_automation_event(
        event_type='document_viewed',
        payload={'organization_id': str(user.organization.id)},
    )

    assert created_count == 0
    assert AutomationDelivery.objects.count() == 0


def test_dispatch_is_scoped_to_event_owner_user(user, user2):
    destination_user1 = AutomationDestination.objects.create(
        organization=user.organization,
        created_by=user,
        name='Owner Dest',
        destination_type='webhook',
        endpoint_url='https://example.com/owner',
    )
    destination_user2 = AutomationDestination.objects.create(
        organization=user.organization,
        created_by=user2,
        name='Other Dest',
        destination_type='webhook',
        endpoint_url='https://example.com/other',
    )

    rule_user1 = AutomationRule.objects.create(
        organization=user.organization,
        created_by=user,
        name='Owner Rule',
        scope_type='global',
        subscribed_events=['document_viewed'],
        actions=[{'type': 'notify_destination'}],
    )
    rule_user1.destinations.add(destination_user1)

    rule_user2 = AutomationRule.objects.create(
        organization=user.organization,
        created_by=user2,
        name='Other Rule',
        scope_type='global',
        subscribed_events=['document_viewed'],
        actions=[{'type': 'notify_destination'}],
    )
    rule_user2.destinations.add(destination_user2)

    created_count = dispatch_automation_event(
        event_type='document_viewed',
        payload={
            'organization_id': str(user.organization.id),
            'owner_user_id': str(user.id),
        },
    )

    assert created_count == 1
    delivery = AutomationDelivery.objects.get()
    assert delivery.rule == rule_user1


def test_ensure_default_email_automation_provisioning(user):
    # 1. Initially provision rule and destination
    user.email = 'owner@example.com'
    user.save(update_fields=['email'])
    
    ensure_default_email_automation(user, user.organization)
    
    rule = AutomationRule.objects.get(created_by=user, scope_type=AutomationRule.ScopeType.GLOBAL)
    destination = AutomationDestination.objects.get(created_by=user, destination_type=AutomationDestination.DestinationType.EMAIL)
    
    assert rule.name == "Default Email Notifications"
    assert destination.name == f"Default Email ({user.email})"
    assert destination.endpoint_url is None  # Properly optional/nullable
    assert destination in rule.destinations.all()

    # 2. Update owner email and re-run provisioning to verify stale name fix
    user.email = 'new_owner@example.com'
    user.save(update_fields=['email'])
    
    ensure_default_email_automation(user, user.organization)
    
    destination.refresh_from_db()
    assert destination.name == f"Default Email (new_owner@example.com)"
