from unittest.mock import patch

import pytest
from rest_framework import status

from datarooms.models import DataroomDocument, DataroomFolder
from documents.models import Document, DocumentVersion
from sharelinks.models import QnAMessage, QnAThread, ShareLink, ShareLinkDataroomSetting, ViewSession


pytestmark = pytest.mark.django_db


def _create_ready_document(user, organization, name):
    document = Document.objects.create(
        name=name,
        organization=organization,
        created_by=user,
        status='ready',
    )
    DocumentVersion.objects.create(
        document=document,
        version_number=1,
        is_primary=True,
    )
    return document


def test_document_link_viewer_can_create_and_list_qna_thread(public_client, share_link):
    view_session = ViewSession.objects.create(
        share_link=share_link,
        viewer_email='viewer@example.com',
    )

    response = public_client.post(
        f'/api/v1/links/{share_link.slug}/qna-threads/',
        {
            'view_session_id': str(view_session.id),
            'subject': 'Can you explain page 3?',
            'body': 'The revenue line needs more context.',
        },
        format='json',
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert QnAThread.objects.count() == 1
    assert QnAMessage.objects.count() == 1

    thread = QnAThread.objects.get()
    assert thread.share_link == share_link
    assert thread.document == share_link.document
    assert thread.dataroom is None
    assert thread.created_by_view_session == view_session
    assert response.data['context_type'] == 'document'
    assert response.data['messages'][0]['body'] == 'The revenue line needs more context.'

    list_response = public_client.get(
        f'/api/v1/links/{share_link.slug}/qna-threads/?view_session_id={view_session.id}'
    )

    assert list_response.status_code == status.HTTP_200_OK
    assert len(list_response.data) == 1
    assert list_response.data[0]['id'] == str(thread.id)


def test_viewer_cannot_use_view_session_from_another_share_link(public_client, share_link, document, user):
    other_link = ShareLink.objects.create(
        document=document,
        created_by=user,
        name='Other Link',
    )
    other_session = ViewSession.objects.create(share_link=other_link)

    response = public_client.post(
        f'/api/v1/links/{share_link.slug}/qna-threads/',
        {
            'view_session_id': str(other_session.id),
            'subject': 'Wrong session',
            'body': 'This should not be accepted.',
        },
        format='json',
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert QnAThread.objects.count() == 0


def test_anonymous_view_session_can_create_qna_when_link_does_not_require_email(public_client, share_link):
    view_session = ViewSession.objects.create(share_link=share_link)

    response = public_client.post(
        f'/api/v1/links/{share_link.slug}/qna-threads/',
        {
            'view_session_id': str(view_session.id),
            'subject': 'Anonymous question',
            'body': 'This should be accepted for anonymous links.',
        },
        format='json',
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert QnAThread.objects.count() == 1


def test_email_gated_qna_requires_view_session_email_to_match_verified_email(public_client, share_link):
    share_link.requires_email = True
    share_link.save(update_fields=['requires_email'])
    view_session = ViewSession.objects.create(
        share_link=share_link,
        viewer_email='victim@example.com',
    )
    session = public_client.session
    session['authorized_share_links'] = {
        str(share_link.id): {
            'email_verified': True,
            'viewer_email': 'attacker@example.com',
        }
    }
    session.save()

    response = public_client.post(
        f'/api/v1/links/{share_link.slug}/qna-threads/',
        {
            'view_session_id': str(view_session.id),
            'subject': 'Wrong viewer',
            'body': 'This should not be accepted.',
        },
        format='json',
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.data['detail'] == 'This Q&A session does not match the verified viewer.'
    assert QnAThread.objects.count() == 0


def test_dataroom_viewer_can_create_and_list_root_qna_thread(public_client, dataroom, user):
    link = ShareLink.objects.create(dataroom=dataroom, created_by=user)
    view_session = ViewSession.objects.create(share_link=link)

    response = public_client.post(
        f'/api/v1/links/{link.slug}/qna-threads/',
        {
            'view_session_id': str(view_session.id),
            'subject': 'Room-level question',
            'body': 'This is about the whole room.',
        },
        format='json',
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data['context_type'] == 'dataroom'
    assert response.data['context_name'] == dataroom.name
    thread = QnAThread.objects.get()
    assert thread.dataroom == dataroom
    assert thread.dataroom_document is None
    assert thread.dataroom_folder is None

    list_response = public_client.get(
        f'/api/v1/links/{link.slug}/qna-threads/?view_session_id={view_session.id}'
    )

    assert list_response.status_code == status.HTTP_200_OK
    assert len(list_response.data) == 1
    assert list_response.data[0]['id'] == str(thread.id)


def test_dataroom_viewer_cannot_create_qna_for_invisible_document(
    public_client,
    dataroom,
    user,
    organization,
):
    document = _create_ready_document(user, organization, 'Hidden.pdf')
    ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=document)
    link = ShareLink.objects.create(dataroom=dataroom, created_by=user)
    view_session = ViewSession.objects.create(share_link=link, viewer_email='viewer@example.com')
    ShareLinkDataroomSetting.objects.filter(
        share_link=link,
        dataroom_document=ddoc,
    ).update(is_visible=False)

    response = public_client.post(
        f'/api/v1/links/{link.slug}/qna-threads/',
        {
            'view_session_id': str(view_session.id),
            'dataroom_document_id': str(ddoc.id),
            'subject': 'Hidden doc question',
            'body': 'This should be denied.',
        },
        format='json',
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert QnAThread.objects.count() == 0


def test_dataroom_viewer_cannot_create_qna_for_visible_document_under_invisible_folder(
    public_client,
    dataroom,
    user,
    organization,
):
    folder = DataroomFolder.objects.create(dataroom=dataroom, name='Hidden Folder')
    document = _create_ready_document(user, organization, 'Child.pdf')
    ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=document, folder=folder)
    link = ShareLink.objects.create(dataroom=dataroom, created_by=user)
    view_session = ViewSession.objects.create(share_link=link, viewer_email='viewer@example.com')
    ShareLinkDataroomSetting.objects.filter(
        share_link=link,
        dataroom_folder=folder,
    ).update(is_visible=False)
    ShareLinkDataroomSetting.objects.filter(
        share_link=link,
        dataroom_document=ddoc,
    ).update(is_visible=True)

    response = public_client.post(
        f'/api/v1/links/{link.slug}/qna-threads/',
        {
            'view_session_id': str(view_session.id),
            'dataroom_document_id': str(ddoc.id),
            'subject': 'Child question',
            'body': 'Visible child should still be denied.',
        },
        format='json',
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert QnAThread.objects.count() == 0


def test_viewer_cannot_reply_to_closed_thread(public_client, share_link):
    view_session = ViewSession.objects.create(share_link=share_link, viewer_email='viewer@example.com')
    thread = QnAThread.objects.create(
        organization=share_link.document.organization,
        share_link=share_link,
        document=share_link.document,
        subject='Closed thread',
        status=QnAThread.STATUS_CLOSED,
        created_by_view_session=view_session,
    )

    response = public_client.post(
        f'/api/v1/links/{share_link.slug}/qna-threads/{thread.id}/messages/',
        {
            'view_session_id': str(view_session.id),
            'body': 'Can I still reply?',
        },
        format='json',
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert QnAMessage.objects.count() == 0


@patch('sharelinks.views.dispatch_automation_event_task.delay')
def test_qna_thread_creation_dispatches_automation_event(mock_delay, public_client, share_link):
    view_session = ViewSession.objects.create(
        share_link=share_link,
        viewer_email='viewer@example.com',
    )

    response = public_client.post(
        f'/api/v1/links/{share_link.slug}/qna-threads/',
        {
            'view_session_id': str(view_session.id),
            'subject': 'Notify owner',
            'body': 'Please review this.',
        },
        format='json',
    )

    assert response.status_code == status.HTTP_201_CREATED
    mock_delay.assert_called_once()
    event_type, payload = mock_delay.call_args.args
    assert event_type == 'qna_thread_created'
    assert payload['share_link_id'] == str(share_link.id)
    assert payload['thread_subject'] == 'Notify owner'
    assert payload['sender_type'] == 'viewer'
    assert payload['viewer_email'] == 'viewer@example.com'


def test_owner_can_close_and_reopen_thread(api_client, share_link, user):
    thread = QnAThread.objects.create(
        organization=user.organization,
        share_link=share_link,
        document=share_link.document,
        subject='Lifecycle',
        created_by_user=user,
    )

    close_response = api_client.patch(
        f'/api/v1/qna-threads/{thread.id}/',
        {'status': QnAThread.STATUS_CLOSED},
        format='json',
    )

    assert close_response.status_code == status.HTTP_200_OK
    thread.refresh_from_db()
    assert thread.status == QnAThread.STATUS_CLOSED

    reopen_response = api_client.patch(
        f'/api/v1/qna-threads/{thread.id}/',
        {'status': QnAThread.STATUS_OPEN},
        format='json',
    )

    assert reopen_response.status_code == status.HTTP_200_OK
    thread.refresh_from_db()
    assert thread.status == QnAThread.STATUS_OPEN


def test_owner_can_filter_qna_threads_by_document(api_client, share_link, user, organization):
    other_document = _create_ready_document(user, organization, 'Other.pdf')
    other_link = ShareLink.objects.create(
        document=other_document,
        created_by=user,
        name='Other Link',
    )
    matching_thread = QnAThread.objects.create(
        organization=user.organization,
        share_link=share_link,
        document=share_link.document,
        subject='Matching document',
        created_by_user=user,
    )
    dataroom = share_link.document.organization.datarooms.create(
        name='Document Room',
        created_by=user,
    )
    dataroom_document = DataroomDocument.objects.create(
        dataroom=dataroom,
        document=share_link.document,
        name=share_link.document.name,
    )
    dataroom_link = ShareLink.objects.create(
        dataroom=dataroom,
        created_by=user,
        name='Dataroom Link',
    )
    dataroom_document_thread = QnAThread.objects.create(
        organization=user.organization,
        share_link=dataroom_link,
        dataroom=dataroom,
        dataroom_document=dataroom_document,
        subject='Matching dataroom document',
        created_by_user=user,
    )
    QnAThread.objects.create(
        organization=user.organization,
        share_link=other_link,
        document=other_document,
        subject='Other document',
        created_by_user=user,
    )

    response = api_client.get(
        f'/api/v1/qna-threads/?document_id={share_link.document_id}'
    )

    assert response.status_code == status.HTTP_200_OK
    assert {thread['id'] for thread in response.data} == {
        str(dataroom_document_thread.id),
        str(matching_thread.id),
    }
