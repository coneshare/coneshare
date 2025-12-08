from unittest.mock import patch, MagicMock
import pytest
from django.test import override_settings

from documents.models import Document, DocumentVersion, DocumentPage
from documents.tasks import generate_pdf_pages_task


@pytest.mark.django_db
class TestGeneratePdfPagesTask:
    @patch('documents.tasks.pdfinfo_from_bytes')
    @patch('documents.tasks.requests.put')
    @patch('documents.tasks.fileserver_client.generate_upload_url')
    @patch('documents.tasks.requests.get')
    @patch('documents.tasks.fileserver_client.generate_download_url')
    @patch('documents.tasks.convert_from_bytes')
    def test_task_processes_pdf_and_updates_db(self, mock_convert, mock_fs_download_url, mock_requests_get, mock_fs_upload_url, mock_requests_put, mock_pdfinfo, user):
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
        mock_pdfinfo.return_value = {'Pages': 2}
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

    @patch('documents.tasks.pdfinfo_from_bytes')
    @patch('documents.tasks.convert_from_bytes')
    @patch('documents.tasks.requests.get')
    @patch('documents.tasks.fileserver_client.generate_download_url')
    @override_settings(MAX_PREVIEW_PAGES=10)
    def test_task_skips_large_pdf(self, mock_fs_download, mock_requests_get, mock_convert, mock_pdfinfo, user):
        # Setup test-specific data
        document = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="large_doc.pdf",
            status='processing',
        )
        version = DocumentVersion.objects.create(
            document=document,
            version_number=1,
            original_storage_key="path/to/large.pdf",
            storage_key="path/to/large.pdf"
        )
        
        # Configure mocks
        mock_fs_download.return_value = "/files/download/token"
        mock_get_response = MagicMock()
        mock_get_response.raise_for_status.return_value = None
        mock_get_response.content = b"large-pdf-content"
        mock_requests_get.return_value = mock_get_response
        mock_pdfinfo.return_value = {'Pages': 11} # Exceeds MAX_PREVIEW_PAGES

        # Call the task function
        generate_pdf_pages_task(version.id)

        # 1. Assert file was fetched to check page count
        mock_fs_download.assert_called_once_with(version.storage_key)
        mock_requests_get.assert_called_once()
        mock_pdfinfo.assert_called_once()

        # 2. Assert that expensive conversion was NOT called
        mock_convert.assert_not_called()

        # 3. Refresh models from DB to check fields
        document.refresh_from_db()
        version.refresh_from_db()

        # 4. Verify Document/Version fields are correctly set for download-only
        assert document.status == 'ready'
        assert document.download_only is True
        assert document.num_pages == 11
        assert document.status_message == "Document has too many pages to generate a preview."
        assert version.num_pages == 11
        assert version.has_pages is False
