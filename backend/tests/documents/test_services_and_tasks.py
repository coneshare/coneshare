from unittest.mock import patch, MagicMock, mock_open
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from documents.models import Document, DocumentVersion, DocumentPage
from documents.services import create_document_from_upload, delete_document_and_files
from documents.tasks import generate_pdf_pages_task


@pytest.mark.django_db
class TestCreateDocumentFromUpload:
    @patch('documents.services.generate_pdf_pages_task.delay')
    @patch('django.core.files.storage.default_storage.save')
    def test_service_creates_records_and_dispatches_task(self, mock_storage_save, mock_task_delay, user):
        # Setup test-specific data
        mock_file = SimpleUploadedFile(
            "test.pdf", b"file_content", content_type="application/pdf"
        )
        # Configure mock to return a predictable path
        mock_storage_save.return_value = f"{user.organization.id}/mock_path.pdf"

        # Call the service function
        document = create_document_from_upload(
            requesting_user=user,
            uploaded_file=mock_file
        )

        # 1. Assert that default_storage.save was called correctly
        mock_storage_save.assert_called_once()
        assert str(user.organization.id) in mock_storage_save.call_args[0][0]
        assert mock_file == mock_storage_save.call_args[0][1]

        # 2. Assert one Document object was created with correct fields
        assert Document.objects.count() == 1
        created_document = Document.objects.first()
        assert created_document == document
        assert created_document.status == 'processing'
        assert created_document.name == 'test.pdf'
        assert created_document.created_by == user

        # 3. Assert one DocumentVersion object was created correctly
        assert DocumentVersion.objects.count() == 1
        version = DocumentVersion.objects.first()
        assert version.document == created_document
        assert version.version_number == 1

        # 4. Assert that the Celery task was called once with the new version's ID
        mock_task_delay.assert_called_once_with(version.id)


@pytest.mark.django_db
class TestGeneratePdfPagesTask:
    @patch('django.core.files.storage.default_storage.save')
    @patch('documents.tasks.convert_from_bytes')
    @patch('django.core.files.storage.default_storage.open', new_callable=mock_open)
    def test_task_processes_pdf_and_updates_db(self, mock_storage_open, mock_convert, mock_storage_save, user):
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

        # Configure mocks
        mock_storage_open.return_value.read.return_value = sample_pdf_bytes
        mock_convert.return_value = mock_images

        # Call the task function directly with the version ID
        generate_pdf_pages_task(version.id)

        # 1. Assert that storage.open was called with the correct key
        mock_storage_open.assert_called_once_with(version.storage_key)

        # 2. Assert that convert_from_bytes was called with the PDF data
        mock_convert.assert_called_once_with(sample_pdf_bytes, fmt='png')

        # 3. Assert that storage.save was called for each generated page
        assert mock_storage_save.call_count == 2

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
    @patch('django.core.files.storage.default_storage.delete')
    def test_service_deletes_db_records_and_storage_files(self, mock_storage_delete, user):
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
        assert mock_storage_delete.call_count == 3
        mock_storage_delete.assert_any_call("original.pdf")
        mock_storage_delete.assert_any_call("page_1.png")
        mock_storage_delete.assert_any_call("page_2.png")
