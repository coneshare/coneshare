import pytest
from django.core.exceptions import ValidationError

from documents.models import (
    Document,
    DocumentPage,
    DocumentVersion,
    Folder,
    validate_document_version_metadata,
    sanitize_filename,
    resolve_version_filename,
)


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


    # Valid file_name
    validate_document_version_metadata({'file_name': 'clip.mp4'})
    validate_document_version_metadata({'file_name': None})

    # Invalid file_name: not a string
    with pytest.raises(ValidationError):
        validate_document_version_metadata({'file_name': 123})

    # Invalid file_name: exceeds 255 chars
    with pytest.raises(ValidationError):
        validate_document_version_metadata({'file_name': 'a' * 256})

    # Invalid file_name: contains control characters
    with pytest.raises(ValidationError):
        validate_document_version_metadata({'file_name': 'bad\x00file.pdf'})
    with pytest.raises(ValidationError):
        validate_document_version_metadata({'file_name': 'bad\nfile.pdf'})

    # Invalid file_name: contains path separators or traversal
    with pytest.raises(ValidationError):
        validate_document_version_metadata({'file_name': '../hack.pdf'})
    with pytest.raises(ValidationError):
        validate_document_version_metadata({'file_name': 'sub/hack.pdf'})
    with pytest.raises(ValidationError):
        validate_document_version_metadata({'file_name': r'sub\hack.pdf'})
    with pytest.raises(ValidationError):
        validate_document_version_metadata({'file_name': '..'})


def test_sanitize_filename():
    """Test sanitize_filename bounds length, strips traversal, and purges control characters."""
    assert sanitize_filename("") == ""
    assert sanitize_filename(None) == ""
    assert sanitize_filename("   ") == ""
    assert sanitize_filename("normal.pdf") == "normal.pdf"
    assert sanitize_filename("   spaced name.pdf   ") == "spaced name.pdf"

    # Traversal and path separators
    assert sanitize_filename("../../etc/passwd.txt") == "passwd.txt"
    assert sanitize_filename(r"..\..\Windows\system32\cmd.exe") == "cmd.exe"
    assert sanitize_filename("folder/sub/file.pdf") == "file.pdf"
    assert sanitize_filename(".") == ""
    assert sanitize_filename("..") == ""

    # Control characters
    assert sanitize_filename("evil\x00name\r\n.pdf") == "evilname.pdf"

    # Trailing dots and spaces
    assert sanitize_filename("document.pdf. . ") == "document.pdf"

    # Length bounded to 255 while preserving extension
    long_name = "a" * 300 + ".pdf"
    sanitized = sanitize_filename(long_name)
    assert len(sanitized) == 255
    assert sanitized.endswith(".pdf")


def test_resolve_version_filename():
    """Test resolve_version_filename deduplicated resolution logic."""
    # 1. Custom file_name prioritized
    assert resolve_version_filename("report.pdf", "org/uuid.mp4", "custom_clip.mp4") == "custom_clip.mp4"

    # 2. Sanitized file_name
    assert resolve_version_filename("report.pdf", "org/uuid.mp4", "../safe.mp4") == "safe.mp4"

    # 3. Fallback to doc name with storage_key extension
    assert resolve_version_filename("report.pdf", "org/uuid.mp4", None) == "report.mp4"
    assert resolve_version_filename("report.pdf", "org/uuid.mp4", "") == "report.mp4"

    # 4. Fallback to doc name when storage key has no extension
    assert resolve_version_filename("report.pdf", "org/uuid_no_ext", None) == "report.pdf"

    # 5. Fallback to storage key basename when doc name is empty
    assert resolve_version_filename("", "org/uuid.pdf", None) == "uuid.pdf"


def test_document_page_metadata_properties():
    """Test that DocumentPage typed metadata accessors and plain_text helper work correctly."""
    # 1. Defaults on empty page
    page = DocumentPage(metadata={})
    assert page.text_content == {"lines": []}
    assert page.width is None
    assert page.height is None
    assert page.plain_text == ""

    # 2. None metadata is handled gracefully
    page_none = DocumentPage(metadata=None)
    assert page_none.text_content == {"lines": []}
    assert page_none.width is None
    assert page_none.height is None
    assert page_none.plain_text == ""

    # 3. Setter for text_content
    sample_lines = [
        {"text": "Executive Summary", "bbox": {"left": 10.0, "top": 12.0, "width": 80.0, "height": 3.0}, "font_size_pt": 16.0},
        {"text": "Revenue grew by 20%.", "bbox": {"left": 10.0, "top": 16.0, "width": 80.0, "height": 2.5}, "font_size_pt": 11.0},
    ]
    page.text_content = {"lines": sample_lines}
    assert page.text_content == {"lines": sample_lines}
    assert page.metadata["text_content"] == {"lines": sample_lines}
    assert page.plain_text == "Executive Summary\nRevenue grew by 20%."

    # 4. Setters for width and height
    page.width = 1920
    page.height = 1080
    assert page.width == 1920
    assert page.height == 1080
    assert page.metadata["width"] == 1920
    assert page.metadata["height"] == 1080

    # 5. Clear width and height with None
    page.width = None
    page.height = None
    assert page.width is None
    assert page.height is None
    assert "width" not in page.metadata
    assert "height" not in page.metadata

