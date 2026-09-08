import pytest
from unittest.mock import patch

from datarooms.models import DataroomCollaborator
from sharelinks.models import ShareLink, ViewSession
from sharelinks.services import (
    _get_unique_share_link_name,
    _get_unique_dataroom_share_link_name,
    resolve_notification_recipient,
)
from sharelinks.tasks import send_view_notification_email_task


@pytest.mark.django_db
class TestShareLinkNameServices:
    def test_get_unique_share_link_name(self, document, user):
        ShareLink.objects.create(document=document, created_by=user, name="My Link")
        name = _get_unique_share_link_name(document, "My Link")
        assert name == "My Link (2)"

    def test_get_unique_dataroom_share_link_name(self, dataroom, user):
        ShareLink.objects.create(dataroom=dataroom, created_by=user, name="Room Link")
        name = _get_unique_dataroom_share_link_name(dataroom, "Room Link")
        assert name == "Room Link (2)"


@pytest.mark.django_db
class TestResolveNotificationRecipient:
    def test_document_share_link_returns_creator(self, document, user):
        link = ShareLink.objects.create(
            document=document,
            created_by=user,
            slug="doc-link-1",
        )
        assert resolve_notification_recipient(link) == user

    def test_document_share_link_inactive_creator_returns_none(self, document, user):
        user.is_active = False
        user.save(update_fields=['is_active'])
        link = ShareLink.objects.create(
            document=document,
            created_by=user,
            slug="doc-link-2",
        )
        assert resolve_notification_recipient(link) is None

    def test_dataroom_share_link_created_by_owner(self, dataroom, user):
        link = ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user,
            slug="room-link-owner",
        )
        assert resolve_notification_recipient(link) == user

    def test_dataroom_share_link_created_by_active_collaborator(self, dataroom, user, user2):
        DataroomCollaborator.objects.create(
            dataroom=dataroom,
            user=user2,
            invited_by=user,
        )
        link = ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user2,
            slug="room-link-collab",
        )
        assert resolve_notification_recipient(link) == user2

    def test_dataroom_share_link_removed_collaborator_falls_back_to_owner(self, dataroom, user, user2):
        # user2 created link, but is not in DataroomCollaborator
        link = ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user2,
            slug="room-link-ex-collab",
        )
        # Should fallback to room owner user
        assert resolve_notification_recipient(link) == user

    def test_dataroom_share_link_deactivated_collaborator_falls_back_to_owner(self, dataroom, user, user2):
        DataroomCollaborator.objects.create(
            dataroom=dataroom,
            user=user2,
            invited_by=user,
        )
        user2.is_active = False
        user2.save(update_fields=['is_active'])

        link = ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user2,
            slug="room-link-deactivated-collab",
        )
        assert resolve_notification_recipient(link) == user


@pytest.mark.django_db
class TestSendViewNotificationEmailTask:
    @patch('sharelinks.tasks.send_mail')
    def test_sends_to_collaborator_when_active(self, mock_send_mail, dataroom, user, user2):
        DataroomCollaborator.objects.create(
            dataroom=dataroom,
            user=user2,
            invited_by=user,
        )
        link = ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user2,
            slug="room-link-collab-active",
            receive_email_notification=True,
        )
        session = ViewSession.objects.create(
            share_link=link,
            viewer_email="investor@fund.com",
        )

        send_view_notification_email_task(str(session.id))

        mock_send_mail.assert_called_once()
        _, kwargs = mock_send_mail.call_args
        assert kwargs['recipient_list'] == [user2.email]

    @patch('sharelinks.tasks.send_mail')
    def test_falls_back_to_room_owner_when_collaborator_removed(self, mock_send_mail, dataroom, user, user2):
        link = ShareLink.objects.create(
            dataroom=dataroom,
            created_by=user2,
            slug="room-link-collab-removed",
            receive_email_notification=True,
        )
        session = ViewSession.objects.create(
            share_link=link,
            viewer_email="investor@fund.com",
        )

        send_view_notification_email_task(str(session.id))

        mock_send_mail.assert_called_once()
        _, kwargs = mock_send_mail.call_args
        assert kwargs['recipient_list'] == [user.email]
