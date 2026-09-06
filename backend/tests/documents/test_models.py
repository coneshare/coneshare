import pytest
from django.core.exceptions import ValidationError

from documents.models import Document, Folder, validate_document_version_metadata


@pytest.mark.django_db
def test_folder_creation(organization, user):
    """Test that a Folder instance can be created."""
    folder = Folder.objects.create(name="Test Folder", organization=organization, created_by=user)
    assert isinstance(folder, Folder)
    assert str(folder) == "Test Folder"
    assert folder.organization == organization
    assert folder.created_by == user
    assert folder.folder_type == Folder.FOLDER_TYPE_PERSONAL


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


def test_validate_document_version_metadata():
    """Test that validate_document_version_metadata correctly raises ValidationError for invalid schemas."""
    # Valid metadata
    validate_document_version_metadata({})
    validate_document_version_metadata({
        'cloud_import': {
            'provider': 'dropbox',
            'provider_display': 'Dropbox',
            'connection_id': 'conn_123',
            'file_id': 'file_123',
            'etag_or_rev': 'rev_123'
        }
    })

    # Invalid metadata: not a dict
    with pytest.raises(ValidationError):
        validate_document_version_metadata("not-a-dict")

    # Invalid metadata: invalid root keys
    with pytest.raises(ValidationError):
        validate_document_version_metadata({'invalid_key': 'value'})

    # Invalid metadata: cloud_import not a dict
    with pytest.raises(ValidationError):
        validate_document_version_metadata({'cloud_import': 'not-a-dict'})

    # Invalid metadata: invalid keys inside cloud_import
    with pytest.raises(ValidationError):
        validate_document_version_metadata({
            'cloud_import': {
                'provider': 'dropbox',
                'invalid_key': 'value'
            }
        })

    # Invalid metadata: invalid type for provider
    with pytest.raises(ValidationError):
        validate_document_version_metadata({
            'cloud_import': {
                'provider': 123.45
            }
        })

