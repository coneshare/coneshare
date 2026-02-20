from unittest.mock import patch, MagicMock
import pytest

from documents.models import Document, DocumentVersion, DocumentPage
from documents.services import (
    create_document_from_upload,
    delete_document_and_files,
    copy_document,
    QuotaExceededError,
)


@pytest.mark.django_db
class TestCreateDocumentFromUpload:
    @patch('documents.services.generate_pdf_pages_task.delay')
    def test_service_creates_records_and_dispatches_task(self, mock_task_delay, user):
        # Call the service function
        document = create_document_from_upload(
            requesting_user=user,
            folder=None,
            storage_key=f"{user.organization.id}/mock_path.pdf",
            unique_name="test.pdf",
            file_size=123,
            content_type="application/pdf"
        )

        # 1. Assert one Document object was created with correct fields
        assert Document.objects.count() == 1
        created_document = Document.objects.first()
        assert created_document == document
        assert created_document.status == 'processing'
        assert created_document.name == 'test.pdf'
        assert created_document.created_by == user

        # 2. Assert one DocumentVersion object was created correctly
        assert DocumentVersion.objects.count() == 1
        version = DocumentVersion.objects.first()
        assert version.document == created_document
        assert version.version_number == 1
        assert version.original_storage_key == f"{user.organization.id}/mock_path.pdf"
        assert version.file_size == 123

        # 3. Assert that the Celery task was called once with the new version's ID
        mock_task_delay.assert_called_once_with(version.id)



@pytest.mark.django_db
class TestDeleteDocument:
    @patch('documents.services.fileserver_client.delete_file')
    def test_service_deletes_db_records_and_storage_files(self, mock_fs_delete, user):
        # Setup
        doc = Document.objects.create(organization=user.organization, created_by=user)
        version = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="original.pdf"
        )
        page1 = DocumentPage.objects.create(
            document_version=version, page_number=1, storage_key="page_1.png"
        )
        page2 = DocumentPage.objects.create(
            document_version=version, page_number=2, storage_key="page_2.png"
        )
        
        doc_id = doc.id
        version_id = version.id
        page1_id = page1.id

        # Action
        delete_document_and_files(doc)

        # Assertions
        # 1. DB records are deleted
        assert not Document.objects.filter(id=doc_id).exists()
        assert not DocumentVersion.objects.filter(id=version_id).exists()
        assert not DocumentPage.objects.filter(id=page1_id).exists()

        # 2. Storage deletion was called for all files
        assert mock_fs_delete.call_count == 3
        mock_fs_delete.assert_any_call("original.pdf")
        mock_fs_delete.assert_any_call("page_1.png")
        mock_fs_delete.assert_any_call("page_2.png")


@pytest.mark.django_db
@patch('documents.services.fileserver_client.copy_file')
@patch('documents.services._route_document_for_processing')
class TestCopyDocumentService:

    def test_copy_document_success(self, mock_route_for_processing, mock_copy_file, user, document):
        """Test that copy_document service successfully creates a copy."""
        # Arrange
        original_doc = document
        original_doc.file_size = 1000
        original_doc.save()
        user.total_document_size = 1000
        user.save()

        # Act
        new_doc = copy_document(original_doc, user)

        # Assert
        assert Document.objects.count() == 2
        assert DocumentVersion.objects.count() == 2

        assert new_doc.id != original_doc.id
        assert new_doc.name == "Test Document (2).pdf"
        assert new_doc.created_by == user
        assert new_doc.file_size == original_doc.file_size

        # Check fileserver was called
        mock_copy_file.assert_called_once()

        # Check user quota was updated
        user.refresh_from_db()
        assert user.total_document_size == 2000

        # Check processing was triggered
        mock_route_for_processing.assert_called_once()

    @patch('documents.services.get_dynamic_setting', return_value=1)
    def test_copy_document_respects_quota(self, mock_get_setting, mock_route_for_processing, mock_copy_file, user, document):
        """Test that copy_document fails if user quota is exceeded."""
        # Arrange
        from django.test import override_settings
        original_doc = document
        original_doc.file_size = 2 * 1024 * 1024  # 2MB
        original_doc.save()

        user.total_document_size = 0
        user.save()

        with override_settings(FILE_SIZE_QUOTA_MB=1):
            with pytest.raises(QuotaExceededError):
                copy_document(original_doc, user)

        assert Document.objects.count() == 1  # No copy was created
        mock_copy_file.assert_not_called()
        user.refresh_from_db()
        assert user.total_document_size == 0  # User size wasn't updated

    def test_copy_document_removes_uploader_info(self, mock_route_for_processing, mock_copy_file, user, document):
        """Test that uploader_info is removed from metadata on copy, but other metadata is kept."""
        # Arrange
        original_doc = document
        original_doc.file_size = 1000
        original_doc.metadata = {'uploader_info': {'name': 'test', 'email': 'test@test.com'}, 'other_key': 'value'}
        original_doc.save()

        # Act
        new_doc = copy_document(original_doc, user)

        # Assert
        assert 'uploader_info' in original_doc.metadata
        assert 'uploader_info' not in new_doc.metadata
        assert 'other_key' in new_doc.metadata
        assert new_doc.metadata['other_key'] == 'value'
