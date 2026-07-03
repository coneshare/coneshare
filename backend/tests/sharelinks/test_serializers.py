import pytest
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, force_authenticate

from datarooms.models import DataroomDocument, DataroomFolder
from documents.models import Document
from sharelinks.models import QnAMessage, QnAThread, ShareLink, ViewSession
from sharelinks.serializers import (
    QnAMessageSerializer,
    QnAThreadCreateSerializer,
    QnAThreadSerializer,
    ShareLinkSerializer,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def serializer_context(user):
    """Creates a mock request context for serializers."""
    factory = APIRequestFactory()
    request = factory.post("/")  # Method doesn't matter for this context
    force_authenticate(request, user=user)
    return {"request": Request(request)}


class TestShareLinkSerializer:
    def test_create_with_password(self, document, serializer_context):
        serializer = ShareLinkSerializer(
            data={"document": document.id, "name": "", "password": "testpassword"},
            context=serializer_context,
        )
        assert serializer.is_valid(), serializer.errors
        instance = serializer.save()

        assert instance.name == "Untitled Link"
        assert instance.password is not None
        assert instance.password == "testpassword"
        assert serializer.data["has_password"] is True
        assert serializer.data["password"] == "testpassword"

    def test_create_without_password(self, document, serializer_context):
        serializer = ShareLinkSerializer(
            data={"document": document.id, "name": ""}, context=serializer_context
        )
        assert serializer.is_valid(), serializer.errors
        instance = serializer.save()

        assert instance.name == "Untitled Link"
        assert instance.password is None
        assert serializer.data["has_password"] is False

    def test_update_to_add_password(self, share_link, serializer_context):
        assert share_link.password is None

        serializer = ShareLinkSerializer(
            instance=share_link,
            data={"password": "newpassword"},
            context=serializer_context,
            partial=True,
        )
        assert serializer.is_valid(), serializer.errors
        instance = serializer.save()

        assert serializer.data["has_password"] is True

        instance.refresh_from_db()
        assert instance.password is not None
        assert instance.password == "newpassword"

    def test_update_to_remove_password(self, share_link_with_password, serializer_context):
        assert share_link_with_password.password is not None

        serializer = ShareLinkSerializer(
            instance=share_link_with_password,
            data={"password": ""},
            context=serializer_context,
            partial=True,
        )
        assert serializer.is_valid(), serializer.errors
        instance = serializer.save()

        assert serializer.data["has_password"] is False

        instance.refresh_from_db()
        assert instance.password == ''

    def test_view_count_and_sessions_serialization(self, share_link, serializer_context):
        """
        Test that view_count and nested view_sessions are correctly serialized.
        """
        # Create some view sessions for the link
        ViewSession.objects.create(share_link=share_link)
        ViewSession.objects.create(share_link=share_link)

        # The serializer expects prefetched data for efficiency, which is what the
        # viewsets are configured to do.
        share_link_with_prefetch = ShareLink.objects.prefetch_related(
            'view_sessions'
        ).get(id=share_link.id)

        serializer = ShareLinkSerializer(
            instance=share_link_with_prefetch,
            context=serializer_context,
        )

        data = serializer.data
        assert data['view_count'] == 2
        assert 'recent_view_sessions' in data
        assert len(data['recent_view_sessions']) == 2
        assert 'viewer_email' in data['recent_view_sessions'][0]

    def test_create_with_duplicate_name_is_renamed(self, document, user, serializer_context):
        """
        Test that creating a share link with a duplicate name for the same
        document results in an appended counter.
        """
        # Create first link
        ShareLink.objects.create(document=document, name="My Test Link", created_by=user)

        # Create second link with the same name
        serializer = ShareLinkSerializer(
            data={"document": document.id, "name": "My Test Link"},
            context=serializer_context,
        )
        assert serializer.is_valid(), serializer.errors
        instance = serializer.save()

        assert instance.name == "My Test Link (2)"

        # Create a third link, which should become (3)
        serializer_3 = ShareLinkSerializer(
            data={"document": document.id, "name": "My Test Link"},
            context=serializer_context,
        )
        assert serializer_3.is_valid(), serializer_3.errors
        instance_3 = serializer_3.save()

        assert instance_3.name == "My Test Link (3)"

    def test_create_with_duplicate_name_for_different_document(self, document, user, serializer_context):
        """
        Test that duplicate names are allowed for different documents.
        """
        # Create another document for the same user
        other_document = Document.objects.create(
            name="Other Document.pdf",
            organization=user.organization,
            created_by=user,
        )

        # Create first link
        ShareLink.objects.create(document=document, name="My Test Link", created_by=user)

        # Create a link with the same name, but for a different document
        serializer = ShareLinkSerializer(
            data={"document": other_document.id, "name": "My Test Link"},
            context=serializer_context,
        )
        assert serializer.is_valid(), serializer.errors
        instance = serializer.save()

        # The name should NOT be changed
        assert instance.name == "My Test Link"

    def test_create_without_name_is_renamed_if_default_exists(self, document, user, serializer_context):
        """
        Test that creating a share link without a name results in a default
        name that is correctly suffixed if it already exists.
        """
        # Create a link with the default name first
        ShareLink.objects.create(document=document, name="Untitled Link", created_by=user)

        # Create a second link without a name
        serializer = ShareLinkSerializer(
            data={"document": document.id, "name": ""},
            context=serializer_context,
        )
        assert serializer.is_valid(), serializer.errors
        instance = serializer.save()

        assert instance.name == "Untitled Link (2)"

    def test_update_with_duplicate_name_fails(self, document, user, serializer_context):
        """
        Test that renaming a share link to an existing name for the same
        document fails validation.
        """
        # Create two links for the same document
        link1 = ShareLink.objects.create(document=document, name="Link 1", created_by=user)
        ShareLink.objects.create(document=document, name="Link 2", created_by=user)

        # Attempt to rename link1 to "Link 2"
        serializer = ShareLinkSerializer(
            instance=link1,
            data={"name": "Link 2"},
            context=serializer_context,
            partial=True
        )
        assert not serializer.is_valid()
        assert 'name' in serializer.errors

    def test_create_for_dataroom_with_duplicate_name_is_renamed(self, dataroom, user, serializer_context):
        """
        Test that creating a share link with a duplicate name for the same
        dataroom results in an appended counter.
        """
        # Create first link
        ShareLink.objects.create(dataroom=dataroom, name="My Dataroom Link", created_by=user)

        # Create second link with the same name
        serializer = ShareLinkSerializer(
            data={"dataroom": dataroom.id, "name": "My Dataroom Link"},
            context=serializer_context,
        )
        assert serializer.is_valid(), serializer.errors
        instance = serializer.save()

        assert instance.name == "My Dataroom Link (2)"

    def test_create_for_dataroom_generates_settings(self, dataroom, document, serializer_context):
        """
        Test that creating a share link for a dataroom automatically creates
        the default visibility and permission settings for all items.
        """
        # Add content to the dataroom
        DataroomDocument.objects.create(dataroom=dataroom, document=document)
        folder = DataroomFolder.objects.create(dataroom=dataroom, name="Test Folder")

        serializer = ShareLinkSerializer(
            data={"dataroom": dataroom.id, "name": "Dataroom Link", "allow_download": False},
            context=serializer_context,
        )
        assert serializer.is_valid(), serializer.errors
        instance = serializer.save()

        assert instance.dataroom == dataroom
        assert instance.document is None
        assert instance.dataroom_settings.count() == 2  # one for doc, one for folder

        doc_setting = instance.dataroom_settings.get(dataroom_document__document=document)
        assert doc_setting.allow_download is False  # Inherited from link

        folder_setting = instance.dataroom_settings.get(dataroom_folder=folder)
        assert folder_setting.allow_download is False

        # The serializer should include the settings data in its output.
        # Refetch with prefetch to simulate what the view does
        instance_with_prefetch = ShareLink.objects.prefetch_related('dataroom_settings').get(id=instance.id)
        reserializer = ShareLinkSerializer(instance=instance_with_prefetch)
        data = reserializer.data
        assert 'dataroom_settings' in data
        assert len(data['dataroom_settings']) == 2
        assert 'is_visible' in data['dataroom_settings'][0]

    def test_create_for_video_with_watermark_fails(self, document, serializer_context):
        """
        Test that creating or updating a share link for a video document
        with enable_watermark=True raises a validation error.
        """
        # Make the document a video
        document.type = 'video'
        document.save()

        serializer = ShareLinkSerializer(
            data={
                "document": document.id,
                "name": "Video Link",
                "enable_watermark": True,
                "watermark_text": "CONFIDENTIAL",
            },
            context=serializer_context,
        )
        assert not serializer.is_valid()
        assert "non_field_errors" in serializer.errors
        assert "Watermarking is not supported for video files." in serializer.errors["non_field_errors"][0]


class TestQnASerializers:
    def test_qna_thread_serializer_for_document_context(self, share_link, user):
        thread = QnAThread.objects.create(
            organization=user.organization,
            share_link=share_link,
            document=share_link.document,
            subject="Question about document",
            created_by_user=user,
        )
        QnAMessage.objects.create(
            thread=thread,
            body="Initial answer",
            sent_by_user=user,
        )

        data = QnAThreadSerializer(thread).data

        assert data['id'] == str(thread.id)
        assert data['context_type'] == 'document'
        assert data['context_name'] == share_link.document.name
        assert data['created_by_type'] == 'user'
        assert data['created_by_email'] == user.email
        assert data['status'] == QnAThread.STATUS_OPEN
        assert len(data['messages']) == 1
        assert data['messages'][0]['body'] == 'Initial answer'

    def test_qna_thread_serializer_for_dataroom_folder_context(self, dataroom, user):
        folder = DataroomFolder.objects.create(dataroom=dataroom, name="Questions Folder")
        link = ShareLink.objects.create(dataroom=dataroom, created_by=user)
        view_session = ViewSession.objects.create(
            share_link=link,
            viewer_email='viewer@example.com',
        )
        thread = QnAThread.objects.create(
            organization=user.organization,
            share_link=link,
            dataroom=dataroom,
            dataroom_folder=folder,
            subject="Folder question",
            created_by_view_session=view_session,
        )

        data = QnAThreadSerializer(thread).data

        assert data['context_type'] == 'dataroom_folder'
        assert data['context_name'] == 'Questions Folder'
        assert data['created_by_type'] == 'viewer'
        assert data['created_by_email'] == 'viewer@example.com'

    def test_qna_thread_serializer_for_dataroom_root_context(self, dataroom, user):
        link = ShareLink.objects.create(dataroom=dataroom, created_by=user)
        thread = QnAThread.objects.create(
            organization=user.organization,
            share_link=link,
            dataroom=dataroom,
            subject="Room question",
            created_by_user=user,
        )

        data = QnAThreadSerializer(thread).data

        assert data['context_type'] == 'dataroom'
        assert data['context_name'] == dataroom.name

    def test_qna_message_serializer_for_viewer_sender(self, share_link, user):
        view_session = ViewSession.objects.create(
            share_link=share_link,
            viewer_email='viewer@example.com',
        )
        thread = QnAThread.objects.create(
            organization=user.organization,
            share_link=share_link,
            document=share_link.document,
            subject="Thread",
            created_by_view_session=view_session,
        )
        message = QnAMessage.objects.create(
            thread=thread,
            body="Viewer message",
            sent_by_view_session=view_session,
        )

        data = QnAMessageSerializer(message).data

        assert data['sender_type'] == 'viewer'
        assert data['sender_email'] == 'viewer@example.com'
        assert data['sender_name'] == 'viewer@example.com'

    def test_qna_thread_create_serializer_rejects_both_dataroom_contexts(self):
        serializer = QnAThreadCreateSerializer(
            data={
                'subject': 'Invalid',
                'body': 'Invalid',
                'view_session_id': 'session-1',
                'dataroom_document_id': 'doc-1',
                'dataroom_folder_id': 'folder-1',
            }
        )

        assert not serializer.is_valid()
        assert 'non_field_errors' in serializer.errors
