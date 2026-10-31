import pytest

from django.db import IntegrityError, transaction

from datarooms.models import Dataroom, DataroomDocument, DataroomFolder
from sharelinks.models import (QnAMessage, QnAThread, ShareLink, ShareLinkDataroomSetting,
                               ShareLinkTemplate, ViewSession, Viewer)
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
def test_viewer_email_case_insensitivity_and_whitespace(organization):
    """Bug 7: Viewer email must be normalized to lowercase and stripped."""
    viewer = Viewer.objects.create(
        organization=organization,
        email="  TestViewer@EXAMPLE.com  "
    )
    assert viewer.email == "testviewer@example.com"

    # Subsequent lookup / get_or_create with different casing returns the same record
    v2, created = Viewer.objects.get_or_create(
        organization=organization,
        email="TESTVIEWER@example.COM"
    )
    assert created is False
    assert v2.id == viewer.id
    assert Viewer.objects.filter(organization=organization).count() == 1



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


@pytest.mark.django_db
def test_sharelink_dataroom_setting_unique_constraint(user, organization):
    """Bug 6: ShareLinkDataroomSetting must enforce unique target per share link."""
    dataroom = Dataroom.objects.create(name="Test Room", organization=organization, created_by=user)
    doc = Document.objects.create(name="Doc", organization=organization, created_by=user)
    ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=doc, name=doc.name)
    link = ShareLink.objects.create(dataroom=dataroom, created_by=user)

    # Note: signals already create default setting for existing ddocs.
    # Attempting to create a duplicate setting for the same (share_link, dataroom_document) must raise IntegrityError.
    with pytest.raises(IntegrityError):
        ShareLinkDataroomSetting.objects.create(
            share_link=link,
            dataroom_document=ddoc,
            allow_download=True,
        )

    # Similarly for dataroom_folder:
    dfolder = DataroomFolder.objects.create(dataroom=dataroom, name="Folder")
    with pytest.raises(IntegrityError):
        ShareLinkDataroomSetting.objects.create(
            share_link=link,
            dataroom_folder=dfolder,
            allow_download=True,
        )


def test_migration_deduplicate_dataroom_settings(user, organization):
    """
    Review Comment #5: Verify that deduplicate_dataroom_settings cleanly purges
    older duplicate rows and retains the record with latest updated_at.
    """
    import importlib
    from datetime import timedelta
    from django.apps import apps
    from django.db import connection
    from django.utils import timezone
    migration_mod = importlib.import_module(
        'sharelinks.migrations.0013_sharelinkdataroomsetting_unique_sharelink_dataroom_document_and_more'
    )
    deduplicate_dataroom_settings = migration_mod.deduplicate_dataroom_settings

    dataroom = Dataroom.objects.create(name="Migration Test Room", organization=organization, created_by=user)
    doc = Document.objects.create(name="Doc", organization=organization, created_by=user)
    ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=doc, name=doc.name)
    link = ShareLink.objects.create(dataroom=dataroom, created_by=user)

    s1 = ShareLinkDataroomSetting.objects.get(share_link=link, dataroom_document=ddoc)
    s1.updated_at = timezone.now() - timedelta(days=1)
    s1.save(update_fields=['updated_at'])

    # Drop constraint temporarily in test to simulate pre-migration state with duplicate rows
    with connection.cursor() as cursor:
        cursor.execute("DROP INDEX IF EXISTS unique_sharelink_dataroom_document")
        cursor.execute("DROP INDEX IF EXISTS unique_sharelink_dataroom_folder")

    # Insert duplicate row directly via bulk_create
    s2 = ShareLinkDataroomSetting.objects.bulk_create([
        ShareLinkDataroomSetting(
            share_link=link,
            dataroom_document=ddoc,
            is_visible=False,
            allow_download=False,
            updated_at=timezone.now(),
        )
    ])[0]

    assert ShareLinkDataroomSetting.objects.filter(share_link=link, dataroom_document=ddoc).count() == 2

    # Run deduplication
    schema_editor = connection.schema_editor()
    deduplicate_dataroom_settings(apps, schema_editor)

    # Verify only 1 row remains and it is the newer s2
    remaining = ShareLinkDataroomSetting.objects.filter(share_link=link, dataroom_document=ddoc)
    assert remaining.count() == 1
    assert remaining.first().id == s2.id

    # Test folder duplicate deduplication
    dfolder = DataroomFolder.objects.create(dataroom=dataroom, name="Folder")
    f1 = ShareLinkDataroomSetting.objects.get(share_link=link, dataroom_folder=dfolder)
    f1.updated_at = timezone.now() - timedelta(days=1)
    f1.save(update_fields=['updated_at'])

    f2 = ShareLinkDataroomSetting.objects.bulk_create([
        ShareLinkDataroomSetting(
            share_link=link,
            dataroom_folder=dfolder,
            is_visible=False,
            allow_download=False,
            updated_at=timezone.now(),
        )
    ])[0]

    assert ShareLinkDataroomSetting.objects.filter(share_link=link, dataroom_folder=dfolder).count() == 2

    deduplicate_dataroom_settings(apps, schema_editor)

    remaining_folders = ShareLinkDataroomSetting.objects.filter(share_link=link, dataroom_folder=dfolder)
    assert remaining_folders.count() == 1
    assert remaining_folders.first().id == f2.id



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


def test_qna_thread_allows_missing_creator_after_principal_deletion(share_link, user):
    thread = QnAThread.objects.create(
        organization=user.organization,
        share_link=share_link,
        document=share_link.document,
        subject="Historical thread",
        created_by_user=user,
    )

    thread.created_by_user = None
    thread.save(update_fields=["created_by_user"])
    thread.refresh_from_db()

    assert thread.created_by_user is None
    assert thread.created_by_view_session is None


def test_qna_thread_rejects_multiple_creator_principals(share_link, user):
    view_session = ViewSession.objects.create(share_link=share_link)

    with pytest.raises(IntegrityError):
        with transaction.atomic():
            QnAThread.objects.create(
                organization=user.organization,
                share_link=share_link,
                document=share_link.document,
                subject="Invalid creator principals",
                created_by_user=user,
                created_by_view_session=view_session,
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


def test_qna_message_rejects_multiple_sender_principals(share_link, user):
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


def test_qna_message_allows_missing_sender_after_principal_deletion(share_link, user):
    message = QnAMessage.objects.create(
        thread=QnAThread.objects.create(
            organization=user.organization,
            share_link=share_link,
            document=share_link.document,
            subject="Thread",
            created_by_user=user,
        ),
        body="Historical message",
        sent_by_user=user,
    )

    message.sent_by_user = None
    message.save(update_fields=["sent_by_user"])
    message.refresh_from_db()

    assert message.sent_by_user is None
    assert message.sent_by_view_session is None
