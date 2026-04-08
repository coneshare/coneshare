import pytest

from automations.models import AutomationDestination, AutomationRule


pytestmark = pytest.mark.django_db


def test_automation_destination_allows_duplicate_name_within_org(user):
    first = AutomationDestination.objects.create(
        organization=user.organization,
        created_by=user,
        name='Same Name',
        destination_type='webhook',
        endpoint_url='https://example.com/1',
    )
    second = AutomationDestination.objects.create(
        organization=user.organization,
        created_by=user,
        name='Same Name',
        destination_type='slack',
        endpoint_url='https://example.com/2',
    )

    assert first.id != second.id
    assert AutomationDestination.objects.filter(
        organization=user.organization,
        name='Same Name',
    ).count() == 2


def test_automation_rule_allows_duplicate_name_within_org(user):
    first = AutomationRule.objects.create(
        organization=user.organization,
        created_by=user,
        name='Same Rule Name',
        scope_type='global',
        subscribed_events=['sharelink_viewed'],
        actions=[{'type': 'notify_destination'}],
    )
    second = AutomationRule.objects.create(
        organization=user.organization,
        created_by=user,
        name='Same Rule Name',
        scope_type='global',
        subscribed_events=['sharelink_downloaded'],
        actions=[{'type': 'notify_destination'}],
    )

    assert first.id != second.id
    assert AutomationRule.objects.filter(
        organization=user.organization,
        name='Same Rule Name',
    ).count() == 2
