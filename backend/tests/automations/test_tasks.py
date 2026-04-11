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
        subscribed_events=['document_viewed'],
        actions=[{'type': 'notify_destination'}],
        is_active=rule_active,
    )
    delivery = AutomationDelivery.objects.create(
        organization=user.organization,
        rule=rule,
        destination=destination,
        event_type='document_viewed',
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


@patch('automations.tasks.requests.request')
def test_deliver_task_builds_slack_payload_with_text(mock_request, user, share_link):
    delivery = _make_delivery(user, share_link)
    delivery.destination.destination_type = 'slack'
    delivery.destination.save(update_fields=['destination_type'])
    delivery.payload = {
        'organization_id': str(user.organization.id),
        'share_link_id': str(share_link.id),
        'document_name': 'Pitch Deck.pdf',
        'viewer_email': 'buyer@example.com',
    }
    delivery.save(update_fields=['payload'])
    mock_request.return_value = DummyResponse(status_code=200, text='ok')

    deliver_automation_delivery_task(str(delivery.id))

    _, kwargs = mock_request.call_args
    assert 'json' in kwargs
    assert isinstance(kwargs['json'], dict)
    assert 'text' in kwargs['json']
    assert 'buyer@example.com' in kwargs['json']['text']
    assert 'Pitch Deck.pdf' in kwargs['json']['text']


@patch('automations.tasks.requests.request')
def test_deliver_task_builds_file_request_uploaded_text(mock_request, user, share_link):
    delivery = _make_delivery(user, share_link)
    delivery.destination.destination_type = 'slack'
    delivery.destination.save(update_fields=['destination_type'])
    delivery.event_type = 'file_request_uploaded'
    delivery.payload = {
        'organization_id': str(user.organization.id),
        'file_request_id': 'fr-1',
        'document_id': 'doc-1',
        'uploaded_by_name': 'John Doe',
        'uploaded_by_email': 'john.doe@example.com',
        'uploaded_file_name': 'nda.pdf',
        'file_request_slug': 'upload-abc',
    }
    delivery.save(update_fields=['event_type', 'payload'])
    mock_request.return_value = DummyResponse(status_code=200, text='ok')

    deliver_automation_delivery_task(str(delivery.id))

    _, kwargs = mock_request.call_args
    assert 'text' in kwargs['json']
    assert 'john.doe@example.com' in kwargs['json']['text']
    assert 'nda.pdf' in kwargs['json']['text']
    assert 'upload-abc' in kwargs['json']['text']


@patch('automations.tasks.requests.request')
def test_deliver_task_builds_wechat_payload_from_destination_type(mock_request, user, share_link):
    delivery = _make_delivery(user, share_link)
    delivery.destination.destination_type = 'wechat'
    delivery.destination.save(update_fields=['destination_type'])
    delivery.payload = {
        'organization_id': str(user.organization.id),
        'share_link_id': str(share_link.id),
        'viewer_email': 'buyer@example.com',
    }
    delivery.save(update_fields=['payload'])
    mock_request.return_value = DummyResponse(status_code=200, text='ok')

    deliver_automation_delivery_task(str(delivery.id))

    _, kwargs = mock_request.call_args
    assert kwargs['json']['msgtype'] == 'text'
    assert kwargs['json']['text']['content']
    assert 'buyer@example.com' in kwargs['json']['text']['content']


@patch('automations.tasks.requests.request')
def test_deliver_task_builds_wechat_payload_from_wechat_webhook_url(mock_request, user, share_link):
    delivery = _make_delivery(user, share_link)
    delivery.destination.destination_type = 'webhook'
    delivery.destination.endpoint_url = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=example'
    delivery.destination.save(update_fields=['destination_type', 'endpoint_url'])
    delivery.payload = {
        'organization_id': str(user.organization.id),
        'share_link_id': str(share_link.id),
        'viewer_email': 'buyer@example.com',
    }
    delivery.save(update_fields=['payload'])
    mock_request.return_value = DummyResponse(status_code=200, text='ok')

    deliver_automation_delivery_task(str(delivery.id))

    _, kwargs = mock_request.call_args
    assert kwargs['json']['msgtype'] == 'text'
    assert kwargs['json']['text']['content']
    assert 'buyer@example.com' in kwargs['json']['text']['content']


@patch('automations.tasks.requests.request')
def test_deliver_task_builds_feishu_payload_from_destination_type(mock_request, user, share_link):
    delivery = _make_delivery(user, share_link)
    delivery.destination.destination_type = 'feishu'
    delivery.destination.save(update_fields=['destination_type'])
    delivery.payload = {
        'organization_id': str(user.organization.id),
        'share_link_id': str(share_link.id),
        'viewer_email': 'buyer@example.com',
    }
    delivery.save(update_fields=['payload'])
    mock_request.return_value = DummyResponse(status_code=200, text='ok')

    deliver_automation_delivery_task(str(delivery.id))

    _, kwargs = mock_request.call_args
    assert kwargs['json']['msg_type'] == 'text'
    assert kwargs['json']['content']
    assert 'buyer@example.com' in kwargs['json']['content']


@patch('automations.tasks.requests.request')
def test_deliver_task_builds_feishu_payload_from_feishu_webhook_url(mock_request, user, share_link):
    delivery = _make_delivery(user, share_link)
    delivery.destination.destination_type = 'webhook'
    delivery.destination.endpoint_url = 'https://www.feishu.cn/flow/api/trigger-webhook/cd8ffe896873e9fe04baf2b56d53b001'
    delivery.destination.save(update_fields=['destination_type', 'endpoint_url'])
    delivery.payload = {
        'organization_id': str(user.organization.id),
        'share_link_id': str(share_link.id),
        'viewer_email': 'buyer@example.com',
    }
    delivery.save(update_fields=['payload'])
    mock_request.return_value = DummyResponse(status_code=200, text='ok')

    deliver_automation_delivery_task(str(delivery.id))

    _, kwargs = mock_request.call_args
    assert kwargs['json']['msg_type'] == 'text'
    assert kwargs['json']['content']
    assert 'buyer@example.com' in kwargs['json']['content']


@patch('automations.tasks.requests.request')
def test_deliver_task_builds_discord_payload_from_destination_type(mock_request, user, share_link):
    delivery = _make_delivery(user, share_link)
    delivery.destination.destination_type = 'discord'
    delivery.destination.save(update_fields=['destination_type'])
    delivery.payload = {
        'organization_id': str(user.organization.id),
        'share_link_id': str(share_link.id),
        'viewer_email': 'buyer@example.com',
    }
    delivery.save(update_fields=['payload'])
    mock_request.return_value = DummyResponse(status_code=200, text='ok')

    deliver_automation_delivery_task(str(delivery.id))

    _, kwargs = mock_request.call_args
    assert kwargs['json']['content']
    assert 'buyer@example.com' in kwargs['json']['content']


@patch('automations.tasks.requests.request')
def test_deliver_task_builds_discord_payload_from_discord_webhook_url(mock_request, user, share_link):
    delivery = _make_delivery(user, share_link)
    delivery.destination.destination_type = 'webhook'
    delivery.destination.endpoint_url = 'https://discord.com/api/webhooks/1491653538072494121/example'
    delivery.destination.save(update_fields=['destination_type', 'endpoint_url'])
    delivery.payload = {
        'organization_id': str(user.organization.id),
        'share_link_id': str(share_link.id),
        'viewer_email': 'buyer@example.com',
    }
    delivery.save(update_fields=['payload'])
    mock_request.return_value = DummyResponse(status_code=200, text='ok')

    deliver_automation_delivery_task(str(delivery.id))

    _, kwargs = mock_request.call_args
    assert kwargs['json']['content']
    assert 'buyer@example.com' in kwargs['json']['content']


@patch('automations.tasks.requests.request')
def test_deliver_task_builds_discord_payload_for_empty_viewer_email(mock_request, user, share_link):
    delivery = _make_delivery(user, share_link)
    delivery.destination.destination_type = 'webhook'
    delivery.destination.endpoint_url = 'https://discord.com/api/webhooks/1491653538072494121/Ta_example'
    delivery.destination.save(update_fields=['destination_type', 'endpoint_url'])
    delivery.payload = {
        'organization_id': str(user.organization.id),
        'share_link_id': str(share_link.id),
        'dataroom_id': None,
        'document_id': 'doc-1',
        'view_session_id': 'session-1',
        'viewer_email': '',
    }
    delivery.save(update_fields=['payload'])
    mock_request.return_value = DummyResponse(status_code=200, text='ok')

    deliver_automation_delivery_task(str(delivery.id))

    _, kwargs = mock_request.call_args
    assert kwargs['json']['content']
    assert 'anonymous' in kwargs['json']['content']


@patch('automations.tasks.requests.request')
def test_deliver_task_includes_dataroom_folder_name_in_text(mock_request, user, share_link):
    delivery = _make_delivery(user, share_link)
    delivery.destination.destination_type = 'slack'
    delivery.destination.save(update_fields=['destination_type'])
    delivery.event_type = 'document_downloaded'
    delivery.payload = {
        'organization_id': str(user.organization.id),
        'share_link_id': str(share_link.id),
        'viewer_email': 'b@b.com',
        'dataroom_id': 'dr-1',
        'dataroom_name': 'project b',
        'dataroom_folder_id': 'folder-1',
        'dataroom_folder_name': 'Financials',
    }
    delivery.save(update_fields=['event_type', 'payload'])
    mock_request.return_value = DummyResponse(status_code=200, text='ok')

    deliver_automation_delivery_task(str(delivery.id))

    _, kwargs = mock_request.call_args
    assert 'text' in kwargs['json']
    assert 'folder_name=Financials' in kwargs['json']['text']


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
def test_deliver_task_inactive_rule_or_destination_is_non_retryable(mock_apply_async, user, share_link):
    delivery = _make_delivery(user, share_link, destination_active=False, rule_active=True)

    deliver_automation_delivery_task(str(delivery.id))

    delivery.refresh_from_db()
    assert delivery.status == AutomationDelivery.Status.DEAD_LETTER
    assert delivery.attempt_count == 1
    assert delivery.next_retry_at is None
    mock_apply_async.assert_not_called()
