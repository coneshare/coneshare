import pytest

from django.db import IntegrityError, transaction

from datarooms.models import DataroomDocument, DataroomFolder
from sharelinks.models import QnAMessage, QnAThread, ShareLink, ShareLinkTemplate, ViewSession, Viewer
from documents.models import Document

pytestmark = pytest.mark.django_db


def test_share_link_template_creation(organization):
    """Test that a ShareLinkTemplate instance can be created."""
    template = ShareLinkTemplate.objects.create(
        name="Default Template",
        organization=organization
    )
    assert isinstance(template, ShareLinkTemplate)
    assert str(template) == "Default Template"


def test_share_link_creation(user):
    """Test that a ShareLink instance can be created."""
    document = Document.objects.create(
        name="Doc for Link",
        organization=user.organization,
        created_by=user,
    )
    share_link = ShareLink.objects.create(
        name="test",
        document=document,
        created_by=user,
        slug="test-slug-123"
    )
    assert isinstance(share_link, ShareLink)
    assert share_link.name == "test"
    assert share_link.document == document
    assert share_link.created_by == user


@pytest.mark.django_db
def test_viewer_creation(organization):
    """Test that a Viewer instance can be created."""
    viewer = Viewer.objects.create(
        organization=organization,
        email="viewer@example.com"
    )
    assert isinstance(viewer, Viewer)
    assert str(viewer) == "viewer@example.com"


@pytest.mark.django_db
def test_view_session_creation(user):
    """Test that a ViewSession instance can be created."""
    document = Document.objects.create(
        name="Doc for View",
        organization=user.organization,
        created_by=user,
    )
    share_link = ShareLink.objects.create(document=document, slug="another-slug", created_by=user)
    view_session = ViewSession.objects.create(share_link=share_link, duration_seconds=0, completion_rate=0)
    assert isinstance(view_session, ViewSession)


def test_qna_thread_creation_for_document_share_link(share_link, user):
    thread = QnAThread.objects.create(
        organization=user.organization,
        share_link=share_link,
        document=share_link.document,
        subject="Question about this document",
        created_by_user=user,
    )

    assert isinstance(thread, QnAThread)
    assert thread.status == QnAThread.STATUS_OPEN
    assert thread.share_link == share_link
    assert thread.document == share_link.document
    assert str(thread) == "Question about this document (open)"


def test_qna_thread_creation_for_dataroom_document(dataroom, document, user):
    dataroom_document = DataroomDocument.objects.create(
        dataroom=dataroom,
        document=document,
    )
    share_link = ShareLink.objects.create(dataroom=dataroom, created_by=user)
    thread = QnAThread.objects.create(
        organization=user.organization,
        share_link=share_link,
        dataroom=dataroom,
        dataroom_document=dataroom_document,
        subject="Question about dataroom document",
        created_by_user=user,
    )

    assert thread.dataroom == dataroom
    assert thread.dataroom_document == dataroom_document
    assert thread.document is None


def test_qna_thread_creation_for_dataroom_root(dataroom, user):
    share_link = ShareLink.objects.create(dataroom=dataroom, created_by=user)
    thread = QnAThread.objects.create(
        organization=user.organization,
        share_link=share_link,
        dataroom=dataroom,
        subject="Question about dataroom",
        created_by_user=user,
    )

    assert thread.dataroom == dataroom
    assert thread.document is None
    assert thread.dataroom_document is None
    assert thread.dataroom_folder is None


def test_qna_thread_requires_exactly_one_context(share_link, dataroom, document, user):
    dataroom_folder = DataroomFolder.objects.create(dataroom=dataroom, name="Folder")

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            QnAThread.objects.create(
                organization=user.organization,
                share_link=share_link,
                document=document,
                dataroom=dataroom,
                dataroom_folder=dataroom_folder,
                subject="Invalid mixed context",
                created_by_user=user,
            )


def test_qna_message_creation_for_user_sender(share_link, user):
    thread = QnAThread.objects.create(
        organization=user.organization,
        share_link=share_link,
        document=share_link.document,
        subject="Thread",
        created_by_user=user,
    )
    message = QnAMessage.objects.create(
        thread=thread,
        body="Owner reply",
        sent_by_user=user,
    )

    assert isinstance(message, QnAMessage)
    assert message.thread == thread
    assert str(message) == f"Message on {thread.id}"


def test_qna_message_requires_exactly_one_sender_type(share_link, user):
    view_session = ViewSession.objects.create(share_link=share_link)
    thread = QnAThread.objects.create(
        organization=user.organization,
        share_link=share_link,
        document=share_link.document,
        subject="Thread",
        created_by_user=user,
    )

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            QnAMessage.objects.create(
                thread=thread,
                body="Invalid sender",
                sent_by_user=user,
                sent_by_view_session=view_session,
            )
