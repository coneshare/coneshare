import pytest
from unittest.mock import patch
from django.core.files.uploadedfile import SimpleUploadedFile

from documents.services import create_document_from_upload
from documents.models import Document

# Mark all tests in this file as needing database access
pytestmark = pytest.mark.django_db


@patch('documents.services.generate_pdf_pages_task.delay')
def test_create_document_from_pdf_upload(mock_generate_task, user):
    """
    Verify that uploading a PDF triggers the correct processing task.
    """
    # Arrange
    mock_file = SimpleUploadedFile(
        "test.pdf", b"file_content", content_type="application/pdf"
    )

    # Act
    document = create_document_from_upload(requesting_user=user, uploaded_file=mock_file)

    # Assert
    assert document.name == "test.pdf"
    assert document.type == "pdf"
    assert document.status == "processing"
    assert document.organization == user.organization
    mock_generate_task.assert_called_once()
    # Check that it was called with the new version's ID
    assert mock_generate_task.call_args[0][0] == document.versions.first().id


@patch('documents.services.convert_office_to_pdf_task.delay')
def test_create_document_from_office_upload(mock_convert_task, user):
    """
    Verify that uploading a DOCX file triggers the office conversion task.
    """
    # Arrange
    mock_file = SimpleUploadedFile(
        "report.docx", b"file_content",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )

    # Act
    document = create_document_from_upload(requesting_user=user, uploaded_file=mock_file)

    # Assert
    assert document.name == "report.docx"
    assert document.type == "document"
    assert document.status == "processing"
    mock_convert_task.assert_called_once()
    assert mock_convert_task.call_args[0][0] == document.versions.first().id


@patch('documents.services.convert_office_to_pdf_task.delay')
@patch('documents.services.generate_pdf_pages_task.delay')
def test_create_document_from_image_upload(mock_generate_task, mock_convert_task, user):
    """
    Verify that uploading an image is processed synchronously and no task is triggered.
    """
    # Arrange
    mock_file = SimpleUploadedFile(
        "logo.png", b"file_content", content_type="image/png"
    )

    # Act
    document = create_document_from_upload(requesting_user=user, uploaded_file=mock_file)

    # Assert
    assert document.name == "logo.png"
    assert document.type == "image"
    assert document.status == "ready"
    assert document.num_pages == 1
    assert document.download_only is False
    mock_generate_task.assert_not_called()
    mock_convert_task.assert_not_called()


@patch('documents.services.convert_office_to_pdf_task.delay')
@patch('documents.services.generate_pdf_pages_task.delay')
def test_create_document_from_unsupported_file_upload(mock_generate_task, mock_convert_task, user):
    """
    Verify that uploading an unsupported file type marks it as 'download_only'.
    """
    # Arrange
    mock_file = SimpleUploadedFile(
        "archive.zip", b"file_content", content_type="application/zip"
    )

    # Act
    document = create_document_from_upload(requesting_user=user, uploaded_file=mock_file)

    # Assert
    assert document.name == "archive.zip"
    assert document.type == "file"
    assert document.status == "ready"
    assert document.download_only is True
    mock_generate_task.assert_not_called()
    mock_convert_task.assert_not_called()
