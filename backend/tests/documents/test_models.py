import pytest

from documents.models import Document, Folder, ViewSession, Viewer


@pytest.mark.django_db
def test_folder_creation(organization):
    """Test that a Folder instance can be created."""
    folder = Folder.objects.create(name="Test Folder", organization=organization)
    assert isinstance(folder, Folder)
    assert str(folder) == "Test Folder"
    assert folder.organization == organization


@pytest.mark.django_db
def test_document_creation(organization, user):
    """Test that a Document instance can be created."""
    document = Document.objects.create(
        name="Test Document",
        organization=organization,
        created_by=user,
        storage_key="test/key",
        original_storage_key="test/original_key",
        type="pdf",
        content_type="application/pdf"
    )
    assert isinstance(document, Document)
    assert str(document) == "Test Document"
    assert document.organization == organization
    assert document.created_by == user
    assert document.status == 'processing'




@pytest.mark.django_db
def test_viewer_creation(organization):
    """Test that a Viewer instance can be created."""
    viewer = Viewer.objects.create(
        organization=organization,
        email="viewer@example.com"
    )
    assert isinstance(viewer, Viewer)
    assert str(viewer) == "viewer@example.com"


from sharelinks.models import ShareLink


@pytest.mark.django_db
def test_view_session_creation(user):
    """Test that a ViewSession instance can be created."""
    document = Document.objects.create(
        name="Doc for View",
        organization=user.organization,
        created_by=user,
    )
    share_link = ShareLink.objects.create(document=document, slug="another-slug")
    view_session = ViewSession.objects.create(share_link=share_link, duration_seconds=0, completion_rate=0)
    assert isinstance(view_session, ViewSession)
