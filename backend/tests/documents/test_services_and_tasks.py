from unittest.mock import patch, MagicMock
import pytest

from documents.models import Document, DocumentVersion, DocumentPage
from documents.services import create_document_from_upload, delete_document_and_files
from documents.tasks import generate_pdf_pages_task


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
class TestGeneratePdfPagesTask:
    @patch('documents.tasks.requests.put')
    @patch('documents.tasks.fileserver_client.generate_upload_url')
    @patch('documents.tasks.requests.get')
    @patch('documents.tasks.fileserver_client.generate_download_url')
    @patch('documents.tasks.convert_from_bytes')
    def test_task_processes_pdf_and_updates_db(self, mock_convert, mock_fs_download_url, mock_requests_get, mock_fs_upload_url, mock_requests_put, user):
        # Setup test-specific data
        document = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="test.pdf",
            status='processing',
        )
        version = DocumentVersion.objects.create(
            document=document,
            version_number=1,
            original_storage_key="path/to/original.pdf",
            storage_key="path/to/original.pdf"
        )
        sample_pdf_bytes = b"dummy-pdf-content"
        mock_images = [MagicMock(), MagicMock()]
        mock_images[0].save.side_effect = lambda buf, format: buf.write(b'img1')
        mock_images[1].save.side_effect = lambda buf, format: buf.write(b'img2')

        # Configure mocks
        mock_fs_download_url.return_value = "/files/download/token"
        mock_get_response = MagicMock()
        mock_get_response.raise_for_status.return_value = None
        mock_get_response.content = sample_pdf_bytes
        mock_requests_get.return_value = mock_get_response
        mock_convert.return_value = mock_images
        mock_fs_upload_url.side_effect = ["/upload/page1", "/upload/page2"]
        mock_put_response = MagicMock()
        mock_put_response.raise_for_status.return_value = None
        mock_requests_put.return_value = mock_put_response

        # Call the task function directly with the version ID
        generate_pdf_pages_task(version.id)

        # 1. Assert that file server download was called
        mock_fs_download_url.assert_called_once_with(version.storage_key)
        mock_requests_get.assert_called_once()

        # 2. Assert that convert_from_bytes was called with the PDF data
        mock_convert.assert_called_once_with(sample_pdf_bytes, fmt='png')

        # 3. Assert that file server upload was called for each page
        assert mock_fs_upload_url.call_count == 2
        assert mock_requests_put.call_count == 2

        # 4. Assert that two DocumentPage objects were created
        assert DocumentPage.objects.count() == 2
        assert DocumentPage.objects.filter(document_version=version, page_number=1).exists()
        assert DocumentPage.objects.filter(document_version=version, page_number=2).exists()

        # 5. Refresh model instances from DB to check updated fields
        document.refresh_from_db()
        version.refresh_from_db()

        # 6. Verify the Document status is updated to 'ready'
        assert document.status == 'ready'

        # 7. Verify the DocumentVersion metadata is updated
        assert version.num_pages == 2
        assert version.has_pages


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
