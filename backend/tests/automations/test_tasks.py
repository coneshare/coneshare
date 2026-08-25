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
def test_deliver_task_includes_event_type_in_generic_webhook_payload(mock_request, user, share_link):
    delivery = _make_delivery(user, share_link)
    mock_request.return_value = DummyResponse(status_code=200, text='ok')

    deliver_automation_delivery_task(str(delivery.id))

    _, kwargs = mock_request.call_args
    assert kwargs['json']['event_type'] == 'document_viewed'
    assert kwargs['json']['organization_id'] == str(user.organization.id)
    assert kwargs['json']['share_link_id'] == str(share_link.id)


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
    assert kwargs['json']['text'] == 'Your shared document "Pitch Deck.pdf" was viewed by buyer@example.com.'
    assert 'buyer@example.com' in kwargs['json']['text']
    assert 'Pitch Deck.pdf' in kwargs['json']['text']


@patch('automations.tasks.requests.request')
def test_deliver_task_adds_time_and_approximate_location_to_chat_text(mock_request, settings, user, share_link):
    settings.DISPLAY_TIME_ZONE = 'Asia/Shanghai'
    delivery = _make_delivery(user, share_link)
    delivery.destination.destination_type = 'slack'
    delivery.destination.save(update_fields=['destination_type'])
    delivery.payload = {
        'organization_id': str(user.organization.id),
        'share_link_id': str(share_link.id),
        'document_name': 'Pitch Deck.pdf',
        'viewer_email': 'buyer@example.com',
        'event_datetime': '2026-05-28T14:30:00+00:00',
        'visitor_city': 'Shanghai',
        'visitor_country': 'China',
    }
    delivery.save(update_fields=['payload'])
    mock_request.return_value = DummyResponse(status_code=200, text='ok')

    deliver_automation_delivery_task(str(delivery.id))

    _, kwargs = mock_request.call_args
    text = kwargs['json']['text']
    assert text.startswith('Your shared document "Pitch Deck.pdf" was viewed by buyer@example.com.')
    assert '\nTime: May 28, 2026, 10:30 PM' in text
    assert 'Asia/Shanghai' not in text
    assert '\nApproximate location: Shanghai, China' in text


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
    assert kwargs['json']['text'] == 'John Doe <john.doe@example.com> uploaded "nda.pdf" to file request "upload-abc".'
    assert 'john.doe@example.com' in kwargs['json']['text']
    assert 'nda.pdf' in kwargs['json']['text']
    assert 'upload-abc' in kwargs['json']['text']


@patch('automations.tasks.requests.request')
def test_deliver_task_includes_custom_field_values_in_file_request_chat_text(mock_request, user, share_link):
    delivery = _make_delivery(user, share_link)
    delivery.destination.destination_type = 'slack'
    delivery.destination.save(update_fields=['destination_type'])
    delivery.event_type = 'file_request_uploaded'
    delivery.payload = {
        'organization_id': str(user.organization.id),
        'file_request_id': 'fr-1',
        'uploaded_by_name': 'John Doe',
        'uploaded_by_email': 'john.doe@example.com',
        'uploaded_file_name': 'nda.pdf',
        'file_request_slug': 'upload-abc',
        'custom_field_values': {
            'case_number': 'CASE-2026-001',
            'document_type': 'Contract',
        },
    }
    delivery.save(update_fields=['event_type', 'payload'])
    mock_request.return_value = DummyResponse(status_code=200, text='ok')

    deliver_automation_delivery_task(str(delivery.id))

    _, kwargs = mock_request.call_args
    assert 'Case Number: CASE-2026-001' in kwargs['json']['text']
    assert 'Document Type: Contract' in kwargs['json']['text']


@patch('automations.tasks.requests.request')
def test_deliver_task_builds_file_request_malware_detected_text(mock_request, user, share_link):
    delivery = _make_delivery(user, share_link)
    delivery.destination.destination_type = 'slack'
    delivery.destination.save(update_fields=['destination_type'])
    delivery.event_type = 'file_request_malware_detected'
    delivery.payload = {
        'organization_id': str(user.organization.id),
        'file_request_id': 'fr-1',
        'uploaded_by_name': 'John Doe',
        'uploaded_by_email': 'john.doe@example.com',
        'uploaded_file_name': 'virus.exe',
        'file_request_slug': 'upload-abc',
    }
    delivery.save(update_fields=['event_type', 'payload'])
    mock_request.return_value = DummyResponse(status_code=200, text='ok')

    deliver_automation_delivery_task(str(delivery.id))

    _, kwargs = mock_request.call_args
    assert 'text' in kwargs['json']
    assert kwargs['json']['text'] == 'Malware was detected in uploaded file "virus.exe" to file request "upload-abc" from John Doe <john.doe@example.com>.'
    assert 'john.doe@example.com' in kwargs['json']['text']
    assert 'virus.exe' in kwargs['json']['text']
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
    assert 'Anonymous' in kwargs['json']['content']


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
    assert kwargs['json']['text'] == 'Your shared folder "Financials" in dataroom "project b" was downloaded by b@b.com.'


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


@patch('automations.emails.send_mail')
def test_deliver_task_email_destination_success(mock_send_mail, user, share_link):
    share_link.receive_email_notification = True
    share_link.save()

    delivery = _make_delivery(user, share_link)
    delivery.destination.destination_type = 'email'
    delivery.destination.endpoint_url = 'http://placeholder.email'
    delivery.destination.save(update_fields=['destination_type', 'endpoint_url'])

    delivery.payload = {
        'organization_id': str(user.organization.id),
        'share_link_id': str(share_link.id),
        'document_name': 'Financial_Statement.pdf',
        'viewer_email': 'viewer@example.com',
        'event_datetime': '2026-07-16T12:00:00Z',
        'visitor_ip': '1.2.3.4',
        'visitor_city': 'Boston',
        'visitor_country': 'USA',
    }
    delivery.save(update_fields=['payload'])

    deliver_automation_delivery_task(str(delivery.id))

    # Assert delivery marked success
    delivery.refresh_from_db()
    assert delivery.status == AutomationDelivery.Status.SUCCESS
    assert delivery.response_code == 200
    
    # Assert email sent to user's profile email
    mock_send_mail.assert_called_once()
    _, call_kwargs = mock_send_mail.call_args
    assert call_kwargs['recipient_list'] == [user.email]
    assert "Financial_Statement.pdf" in call_kwargs['subject']


@patch('automations.emails.send_mail')
def test_deliver_task_email_destination_skipped(mock_send_mail, user, share_link):
    share_link.receive_email_notification = False
    share_link.save()

    delivery = _make_delivery(user, share_link)
    delivery.destination.destination_type = 'email'
    delivery.destination.endpoint_url = 'http://placeholder.email'
    delivery.destination.save(update_fields=['destination_type', 'endpoint_url'])

    delivery.payload = {
        'organization_id': str(user.organization.id),
        'share_link_id': str(share_link.id),
        'document_name': 'Financial_Statement.pdf',
        'viewer_email': 'viewer@example.com',
    }
    delivery.save(update_fields=['payload'])

    deliver_automation_delivery_task(str(delivery.id))

    # Assert delivery marked success but email was skipped (not called)
    delivery.refresh_from_db()
    assert delivery.status == AutomationDelivery.Status.SUCCESS
    assert 'Skipped' in delivery.response_body_excerpt
    mock_send_mail.assert_not_called()


@patch('automations.emails.send_mail')
def test_deliver_task_email_coalesced_digest(mock_send_mail, user, share_link):
    from sharelinks.models import ViewSession, PageView
    from automations.models import AutomationDelivery
    from datetime import timedelta
    from django.utils import timezone

    share_link.receive_email_notification = True
    share_link.save()

    # Create a ViewSession
    view_session = ViewSession.objects.create(
        share_link=share_link,
        viewer_email='viewer@example.com',
        ip_address='1.2.3.4',
        country='USA',
        city='Boston',
        duration_seconds=120,
    )

    # Record some PageViews to get stats
    PageView.objects.create(
        view_session=view_session,
        page_number=1,
        duration_seconds=40,
        media_type='document',
    )
    PageView.objects.create(
        view_session=view_session,
        page_number=2,
        duration_seconds=80,
        media_type='document',
    )

    # We need a document on the share_link for stats pages viewed
    from documents.models import Document
    doc = Document.objects.create(
        organization=user.organization,
        name="Financial_Statement.pdf",
        num_pages=4,
        created_by=user,
    )
    share_link.document = doc
    share_link.save()

    # Make multiple deliveries in the same session
    delivery1 = _make_delivery(user, share_link)
    delivery1.destination.destination_type = 'email'
    delivery1.destination.save()
    delivery1.payload = {
        'organization_id': str(user.organization.id),
        'share_link_id': str(share_link.id),
        'document_name': 'Financial_Statement.pdf',
        'viewer_email': 'viewer@example.com',
        'view_session_id': str(view_session.id),
    }
    delivery1.save()
    AutomationDelivery.objects.filter(id=delivery1.id).update(created_at=timezone.now() - timedelta(seconds=70))

    delivery2 = _make_delivery(user, share_link)
    delivery2.destination = delivery1.destination
    delivery2.event_type = 'document_downloaded'
    delivery2.payload = {
        'organization_id': str(user.organization.id),
        'share_link_id': str(share_link.id),
        'document_name': 'Financial_Statement.pdf',
        'viewer_email': 'viewer@example.com',
        'view_session_id': str(view_session.id),
    }
    delivery2.save()
    AutomationDelivery.objects.filter(id=delivery2.id).update(created_at=timezone.now() - timedelta(seconds=65))

    # Deliver task for the first delivery
    deliver_automation_delivery_task(str(delivery1.id))

    # Verify both deliveries got marked success (since they were coalesced and processed)
    delivery1.refresh_from_db()
    delivery2.refresh_from_db()
    assert delivery1.status == AutomationDelivery.Status.SUCCESS
    assert delivery2.status == AutomationDelivery.Status.SUCCESS

    # Assert single email was sent
    mock_send_mail.assert_called_once()
    _, call_kwargs = mock_send_mail.call_args
    assert "viewed and downloaded the document" in call_kwargs['subject']
    assert "Financial_Statement.pdf" in call_kwargs['message']
    assert "50% read" in call_kwargs['message']


@patch('automations.emails.send_mail')
def test_deliver_task_email_concurrency_race_condition(mock_send_mail, user, share_link):
    from sharelinks.models import ViewSession
    from automations.models import AutomationDelivery
    from datetime import timedelta
    from django.utils import timezone

    share_link.receive_email_notification = True
    share_link.save()

    # Create a ViewSession
    view_session = ViewSession.objects.create(
        share_link=share_link,
        viewer_email='viewer@example.com',
    )

    # Create two pending deliveries for the same session
    delivery1 = _make_delivery(user, share_link)
    delivery1.destination.destination_type = 'email'
    delivery1.destination.save()
    delivery1.payload = {
        'organization_id': str(user.organization.id),
        'share_link_id': str(share_link.id),
        'view_session_id': str(view_session.id),
    }
    delivery1.save()
    AutomationDelivery.objects.filter(id=delivery1.id).update(created_at=timezone.now() - timedelta(seconds=70))

    delivery2 = _make_delivery(user, share_link)
    delivery2.destination = delivery1.destination
    delivery2.payload = delivery1.payload
    delivery2.save()
    AutomationDelivery.objects.filter(id=delivery2.id).update(created_at=timezone.now() - timedelta(seconds=65))

    # Simulate race condition: another concurrent task claimed and updated the deliveries to SUCCESS
    # right before our task performs the atomic update (CAS) check
    AutomationDelivery.objects.filter(status=AutomationDelivery.Status.PENDING).update(
        status=AutomationDelivery.Status.SUCCESS,
        delivered_at=timezone.now()
    )

    # Now execute the task (simulating Task 2 running after Task 1 succeeded)
    deliver_automation_delivery_task(str(delivery2.id))

    # Assert that no email was sent because CAS update matching status=PENDING returned 0 updated rows
    mock_send_mail.assert_not_called()


@patch('automations.tasks.deliver_automation_delivery_task.apply_async')
def test_deliver_task_email_destination_debounced_reschedules_retry(mock_apply_async, user, share_link):
    share_link.receive_email_notification = True
    share_link.save()

    delivery = _make_delivery(user, share_link)
    delivery.destination.destination_type = 'email'
    delivery.destination.save(update_fields=['destination_type'])

    # Set payload with view_session_id to trigger debouncing branch (creation time is now, time_since_latest < 60s)
    delivery.payload = {
        'organization_id': str(user.organization.id),
        'share_link_id': str(share_link.id),
        'view_session_id': 'sess-debounce-test',
        'document_name': 'Financial_Statement.pdf',
    }
    delivery.save(update_fields=['payload'])

    deliver_automation_delivery_task(str(delivery.id))

    # Assert delivery remains PENDING (debounced)
    delivery.refresh_from_db()
    assert delivery.status == AutomationDelivery.Status.PENDING

    # Assert apply_async was called to reschedule task retry with a countdown
    mock_apply_async.assert_called_once()
    _, kwargs = mock_apply_async.call_args
    assert kwargs.get('countdown') >= 5


@patch('automations.emails.send_mail')
def test_deliver_task_email_coalesced_respects_user_language(mock_send_mail, user, share_link):
    from sharelinks.models import ViewSession, PageView
    from automations.models import AutomationDelivery
    from documents.models import Document
    from datetime import timedelta
    from django.utils import timezone

    user.language = 'zh-hans'
    user.save(update_fields=['language'])

    share_link.receive_email_notification = True
    share_link.save()

    doc = Document.objects.create(
        organization=user.organization,
        name="Financial_Statement.pdf",
        num_pages=4,
        created_by=user,
    )
    share_link.document = doc
    share_link.save()

    view_session = ViewSession.objects.create(
        share_link=share_link,
        viewer_email='viewer@example.com',
    )
    PageView.objects.create(
        view_session=view_session,
        page_number=1,
        duration_seconds=30,
        media_type='document',
    )

    delivery = _make_delivery(user, share_link)
    delivery.destination.destination_type = 'email'
    delivery.destination.save()
    delivery.payload = {
        'organization_id': str(user.organization.id),
        'share_link_id': str(share_link.id),
        'document_name': 'Financial_Statement.pdf',
        'viewer_email': 'viewer@example.com',
        'view_session_id': str(view_session.id),
    }
    delivery.save()
    AutomationDelivery.objects.filter(id=delivery.id).update(created_at=timezone.now() - timedelta(seconds=70))

    deliver_automation_delivery_task(str(delivery.id))

    mock_send_mail.assert_called_once()
    _, call_kwargs = mock_send_mail.call_args
    # Subject should be translated into Chinese
    assert "viewer@example.com 查看了文档“Financial_Statement.pdf”" in call_kwargs['subject']
    # Message should be translated into Chinese
    assert "访问详情" in call_kwargs['html_message']
    assert "未知位置" in call_kwargs['message']
    assert "30秒，已阅读 25%" in call_kwargs['message']


def test_format_duration_localization():
    from django.utils.translation import override as translation_override
    from automations.emails import _format_duration

    with translation_override('en'):
        assert _format_duration(150) == "2m 30s"
        assert _format_duration(120) == "2m"
        assert _format_duration(45) == "45s"

    with translation_override('zh-hans'):
        assert _format_duration(150) == "2分30秒"
        assert _format_duration(120) == "2分"
        assert _format_duration(45) == "45秒"

    with translation_override('ru'):
        assert _format_duration(150) == "2 мин 30 с"
        assert _format_duration(120) == "2 мин"
        assert _format_duration(45) == "45 с"


def test_event_sentence_and_target_description_localization():
    from django.utils.translation import override as translation_override
    from automations.tasks import _build_event_sentence, _target_description

    payload = {
        'document_name': 'Annual_Report.pdf',
        'dataroom_name': 'Secret Room',
        'dataroom_folder_name': 'Finance',
        'viewer_email': 'buyer@example.com',
    }

    with translation_override('zh-hans'):
        target = _target_description(payload)
        assert target == '资料室“Secret Room”中文件夹“Finance”下的文档“Annual_Report.pdf”'
        sentence = _build_event_sentence('document_viewed', payload)
        assert sentence == '您分享的资料室“Secret Room”中文件夹“Finance”下的文档“Annual_Report.pdf”已被buyer@example.com查看。'

    with translation_override('ru'):
        target = _target_description(payload)
        assert target == 'документ «Annual_Report.pdf» в папке «Finance» в датаруме «Secret Room»'
        sentence = _build_event_sentence('document_viewed', payload)
        assert sentence == 'Ваш общий документ «Annual_Report.pdf» в папке «Finance» в датаруме «Secret Room» был просмотрен пользователем buyer@example.com.'


@patch('automations.emails.send_mail')
def test_deliver_task_standard_fallback_email_respects_user_language(mock_send_mail, user, share_link):
    from automations.models import AutomationDelivery

    user.language = 'zh-hans'
    user.save(update_fields=['language'])

    delivery = _make_delivery(user, share_link)
    delivery.destination.destination_type = 'email'
    delivery.destination.save()
    delivery.event_type = 'file_request_uploaded'
    delivery.payload = {
        'organization_id': str(user.organization.id),
        'file_request_name': 'KYC Documents',
        'uploaded_by_name': 'Alice',
        'uploaded_by_email': 'alice@example.com',
        'uploaded_file_name': 'passport.jpg',
    }
    delivery.save()

    deliver_automation_delivery_task(str(delivery.id))

    mock_send_mail.assert_called_once()
    _, call_kwargs = mock_send_mail.call_args
    assert 'Alice <alice@example.com> 向您的文件收集“KYC Documents”上传了文件' in call_kwargs['subject']
    assert '访问详情' in call_kwargs['html_message']




