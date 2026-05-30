from unittest.mock import patch

import pytest
from pytest_bdd import given, parsers, scenario, then, when
from rest_framework import status

from datarooms.models import Dataroom, DataroomDocument
from documents.models import Document, DocumentVersion
from sharelinks.models import QnAMessage, QnAThread, ShareLink, ShareLinkDataroomSetting, ViewSession

pytest_plugins = "bdd.step_definitions.common_steps"


@pytest.mark.django_db
@scenario('../features/share_link_qna.feature', 'Viewer asks Q&A on a single-document share link')
def test_viewer_asks_qna_on_document_share_link():
    pass


@pytest.mark.django_db
@scenario('../features/share_link_qna.feature', "Owner replies to a viewer's Q&A thread")
def test_owner_replies_to_viewer_qna_thread():
    pass


@pytest.mark.django_db
@scenario('../features/share_link_qna.feature', "Viewer cannot create Q&A using another link's session")
def test_viewer_cannot_use_another_link_session_for_qna():
    pass


@pytest.mark.django_db
@scenario('../features/share_link_qna.feature', 'Viewer cannot ask Q&A on invisible dataroom content')
def test_viewer_cannot_ask_qna_on_invisible_dataroom_content():
    pass


@pytest.mark.django_db
@scenario('../features/share_link_qna.feature', 'Viewer cannot reply to a closed Q&A thread')
def test_viewer_cannot_reply_to_closed_qna_thread():
    pass


@pytest.mark.django_db
@scenario('../features/share_link_qna.feature', 'Q&A creation dispatches an automation notification')
def test_qna_creation_dispatches_automation_notification():
    pass


def _create_document(user, name):
    document = Document.objects.create(
        name=name,
        organization=user.organization,
        created_by=user,
        status='ready',
    )
    DocumentVersion.objects.create(
        document=document,
        version_number=1,
        is_primary=True,
    )
    return document


@given("I have a document with a share link for Q&A", target_fixture="qna_context")
def document_share_link_for_qna(user_context):
    user = user_context['user']
    document = _create_document(user, "Q&A Document.pdf")
    share_link = ShareLink.objects.create(
        document=document,
        created_by=user,
        name="Q&A Link",
    )
    return {
        'user': user,
        'document': document,
        'share_link': share_link,
    }


@when("a viewer creates a view session for the Q&A share link", target_fixture="qna_context")
def viewer_creates_qna_view_session(public_client, qna_context):
    share_link = qna_context['share_link']
    response = public_client.post(
        '/api/v1/view-sessions/',
        {
            'share_link': str(share_link.id),
            'viewer_email': 'viewer@example.com',
        },
        format='json',
    )
    assert response.status_code == status.HTTP_201_CREATED, response.data
    qna_context['view_session'] = ViewSession.objects.get(id=response.data['id'])
    return qna_context


@when(parsers.parse('the viewer creates a Q&A thread with subject "{subject}" and message "{message}"'), target_fixture="qna_context")
def viewer_creates_qna_thread(public_client, qna_context, subject, message):
    share_link = qna_context['share_link']
    view_session = qna_context['view_session']
    response = public_client.post(
        f'/api/v1/links/{share_link.slug}/qna-threads/',
        {
            'view_session_id': str(view_session.id),
            'subject': subject,
            'body': message,
        },
        format='json',
    )
    qna_context['response'] = response
    if response.status_code == status.HTTP_201_CREATED:
        qna_context['qna_thread'] = QnAThread.objects.get(id=response.data['id'])
    return qna_context


@then(parsers.parse('a Q&A thread should exist for the share link with subject "{subject}"'))
def qna_thread_exists(qna_context, subject):
    share_link = qna_context['share_link']
    thread = QnAThread.objects.get(share_link=share_link, subject=subject)
    assert thread.document == share_link.document
    assert thread.status == QnAThread.STATUS_OPEN


@then(parsers.parse('the Q&A thread should contain the message "{message}"'))
def qna_thread_contains_message(qna_context, message):
    thread = QnAThread.objects.get(share_link=qna_context['share_link'])
    assert thread.messages.filter(body=message).exists()


@given(parsers.parse('a viewer has opened a Q&A thread with subject "{subject}"'), target_fixture="qna_context")
def viewer_has_opened_qna_thread(public_client, qna_context, subject):
    viewer_creates_qna_view_session(public_client, qna_context)
    viewer_creates_qna_thread(public_client, qna_context, subject, "Initial viewer question.")
    assert qna_context['response'].status_code == status.HTTP_201_CREATED, qna_context['response'].data
    return qna_context


@when(parsers.parse('the owner replies to the Q&A thread with message "{message}"'), target_fixture="qna_context")
def owner_replies_to_qna_thread(api_client, qna_context, message):
    thread = qna_context['qna_thread']
    response = api_client.post(
        f'/api/v1/qna-threads/{thread.id}/messages/',
        {'body': message},
        format='json',
    )
    qna_context['response'] = response
    return qna_context


@then("the Q&A thread history should contain messages in order:")
def qna_thread_history_contains_messages_in_order(qna_context, datatable):
    thread = qna_context['qna_thread']
    messages = list(thread.messages.order_by('created_at', 'id').values_list('body', flat=True))
    expected = [row[0] for row in datatable[1:]]
    assert messages == expected


@given("I have two document share links for Q&A", target_fixture="qna_context")
def two_document_share_links_for_qna(user_context):
    user = user_context['user']
    document_one = _create_document(user, "First Q&A Document.pdf")
    document_two = _create_document(user, "Second Q&A Document.pdf")
    first_link = ShareLink.objects.create(document=document_one, created_by=user, name="First Link")
    second_link = ShareLink.objects.create(document=document_two, created_by=user, name="Second Link")
    return {
        'user': user,
        'share_link': first_link,
        'second_share_link': second_link,
    }


@given("a viewer session exists for the second Q&A share link", target_fixture="qna_context")
def viewer_session_for_second_qna_link(qna_context):
    qna_context['second_view_session'] = ViewSession.objects.create(
        share_link=qna_context['second_share_link'],
        viewer_email='viewer@example.com',
    )
    return qna_context


@when("the viewer tries to create Q&A on the first share link using the second link session", target_fixture="qna_context")
def viewer_uses_wrong_qna_session(public_client, qna_context):
    response = public_client.post(
        f'/api/v1/links/{qna_context["share_link"].slug}/qna-threads/',
        {
            'view_session_id': str(qna_context['second_view_session'].id),
            'subject': 'Wrong session',
            'body': 'This should fail.',
        },
        format='json',
    )
    qna_context['response'] = response
    return qna_context


@then("the Q&A request should fail with bad request")
def qna_request_fails_bad_request(qna_context):
    assert qna_context['response'].status_code == status.HTTP_400_BAD_REQUEST


@then("no Q&A thread should be created")
def no_qna_thread_created():
    assert QnAThread.objects.count() == 0


@given("I have a dataroom share link with a hidden document for Q&A", target_fixture="qna_context")
def dataroom_share_link_with_hidden_document(user_context):
    user = user_context['user']
    dataroom = Dataroom.objects.create(
        name="Q&A Dataroom",
        organization=user.organization,
        created_by=user,
    )
    document = _create_document(user, "Hidden Q&A Document.pdf")
    dataroom_document = DataroomDocument.objects.create(
        dataroom=dataroom,
        document=document,
    )
    share_link = ShareLink.objects.create(dataroom=dataroom, created_by=user, name="Dataroom Q&A Link")
    ShareLinkDataroomSetting.objects.filter(
        share_link=share_link,
        dataroom_document=dataroom_document,
    ).update(is_visible=False)
    view_session = ViewSession.objects.create(
        share_link=share_link,
        viewer_email='viewer@example.com',
    )
    return {
        'user': user,
        'share_link': share_link,
        'dataroom_document': dataroom_document,
        'view_session': view_session,
    }


@when("a viewer tries to create Q&A for the hidden dataroom document", target_fixture="qna_context")
def viewer_creates_qna_for_hidden_dataroom_document(public_client, qna_context):
    response = public_client.post(
        f'/api/v1/links/{qna_context["share_link"].slug}/qna-threads/',
        {
            'view_session_id': str(qna_context['view_session'].id),
            'dataroom_document_id': str(qna_context['dataroom_document'].id),
            'subject': 'Hidden question',
            'body': 'This should fail.',
        },
        format='json',
    )
    qna_context['response'] = response
    return qna_context


@then("the Q&A request should be forbidden")
def qna_request_forbidden(qna_context):
    assert qna_context['response'].status_code == status.HTTP_403_FORBIDDEN


@given("the owner closes the Q&A thread", target_fixture="qna_context")
def owner_closes_qna_thread(api_client, qna_context):
    thread = qna_context['qna_thread']
    response = api_client.patch(
        f'/api/v1/qna-threads/{thread.id}/',
        {'status': QnAThread.STATUS_CLOSED},
        format='json',
    )
    assert response.status_code == status.HTTP_200_OK, response.data
    thread.refresh_from_db()
    assert thread.status == QnAThread.STATUS_CLOSED
    return qna_context


@when("the viewer tries to reply to the closed Q&A thread", target_fixture="qna_context")
def viewer_replies_to_closed_qna_thread(public_client, qna_context):
    response = public_client.post(
        f'/api/v1/links/{qna_context["share_link"].slug}/qna-threads/{qna_context["qna_thread"].id}/messages/',
        {
            'view_session_id': str(qna_context['view_session'].id),
            'body': 'Can I add more?',
        },
        format='json',
    )
    qna_context['response'] = response
    return qna_context


@then(parsers.parse('the Q&A thread should contain {count:d} message'))
def qna_thread_message_count(qna_context, count):
    assert qna_context['qna_thread'].messages.count() == count


@given("automation dispatch is monitored", target_fixture="qna_context")
def automation_dispatch_is_monitored(qna_context):
    patcher = patch('sharelinks.views.dispatch_automation_event_task.delay')
    qna_context['automation_patcher'] = patcher
    qna_context['automation_mock'] = patcher.start()
    return qna_context


@then(parsers.parse('a "{event_type}" automation event should be dispatched for the Q&A thread'))
def automation_event_dispatched_for_qna_thread(qna_context, event_type):
    mock_delay = qna_context['automation_mock']
    try:
        matching_calls = [
            call for call in mock_delay.call_args_list
            if call.args and call.args[0] == event_type
        ]
        assert len(matching_calls) == 1
        dispatched_event_type, payload = matching_calls[0].args
        assert dispatched_event_type == event_type
        assert payload['share_link_id'] == str(qna_context['share_link'].id)
        assert payload['thread_id'] == str(qna_context['qna_thread'].id)
        assert payload['thread_subject'] == qna_context['qna_thread'].subject
        assert payload['sender_type'] == 'viewer'
    finally:
        qna_context['automation_patcher'].stop()
