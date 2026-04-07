import pytest
from unittest.mock import patch

from automations.models import AutomationDelivery, AutomationDestination, AutomationRule
from automations.tasks import deliver_automation_delivery_task


pytestmark = pytest.mark.django_db


class DummyResponse:
    def __init__(self, status_code=200, text='ok'):
        self.status_code = status_code
        self.text = text


def _make_delivery(user, share_link, *, destination_active=True, rule_active=True):
    destination = AutomationDestination.objects.create(
        organization=user.organization,
        created_by=user,
        name=f'Destination-{destination_active}-{rule_active}',
        destination_type='webhook',
        endpoint_url='https://example.com/hook',
        http_method='POST',
        headers={'X-Test': 'yes'},
        signing_secret='top-secret',
        is_active=destination_active,
    )
    rule = AutomationRule.objects.create(
        organization=user.organization,
        created_by=user,
        name=f'Rule-{destination_active}-{rule_active}',
        scope_type='share_link',
        share_link=share_link,
        subscribed_events=['link_viewed'],
        actions=[{'type': 'notify_destination'}],
        is_active=rule_active,
    )
    delivery = AutomationDelivery.objects.create(
        organization=user.organization,
        rule=rule,
        destination=destination,
        event_type='link_viewed',
        payload={'organization_id': str(user.organization.id), 'share_link_id': str(share_link.id)},
        status=AutomationDelivery.Status.PENDING,
        idempotency_key='idem-1',
    )
    return delivery


@patch('automations.tasks.requests.request')
def test_deliver_task_marks_success(mock_request, user, share_link):
    delivery = _make_delivery(user, share_link)
    mock_request.return_value = DummyResponse(status_code=200, text='ok')

    deliver_automation_delivery_task(str(delivery.id))

    delivery.refresh_from_db()
    assert delivery.status == AutomationDelivery.Status.SUCCESS
    assert delivery.response_code == 200
    assert delivery.delivered_at is not None
    assert delivery.next_retry_at is None


@patch('automations.tasks.deliver_automation_delivery_task.apply_async')
@patch('automations.tasks.requests.request')
def test_deliver_task_marks_failed_and_schedules_retry(mock_request, mock_apply_async, user, share_link):
    delivery = _make_delivery(user, share_link)
    mock_request.return_value = DummyResponse(status_code=500, text='server error')

    deliver_automation_delivery_task(str(delivery.id))

    delivery.refresh_from_db()
    assert delivery.status == AutomationDelivery.Status.FAILED
    assert delivery.attempt_count == 1
    assert delivery.next_retry_at is not None
    mock_apply_async.assert_called_once()


@patch('automations.tasks.deliver_automation_delivery_task.apply_async')
@patch('automations.tasks.requests.request')
def test_deliver_task_marks_dead_letter_after_max_attempts(mock_request, mock_apply_async, user, share_link):
    delivery = _make_delivery(user, share_link)
    delivery.attempt_count = 2
    delivery.save(update_fields=['attempt_count'])

    mock_request.return_value = DummyResponse(status_code=500, text='still failing')

    deliver_automation_delivery_task(str(delivery.id))

    delivery.refresh_from_db()
    assert delivery.status == AutomationDelivery.Status.DEAD_LETTER
    assert delivery.attempt_count == 3
    assert delivery.next_retry_at is None
    mock_apply_async.assert_not_called()


@patch('automations.tasks.deliver_automation_delivery_task.apply_async')
def test_deliver_task_inactive_rule_or_destination_goes_to_retry_path(mock_apply_async, user, share_link):
    delivery = _make_delivery(user, share_link, destination_active=False, rule_active=True)

    deliver_automation_delivery_task(str(delivery.id))

    delivery.refresh_from_db()
    assert delivery.status == AutomationDelivery.Status.FAILED
    assert delivery.attempt_count == 1
    mock_apply_async.assert_called_once()
