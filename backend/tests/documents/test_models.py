import pytest

from documents.models import Document, Folder


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
