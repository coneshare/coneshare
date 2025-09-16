from unittest.mock import patch, MagicMock, mock_open
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from core.models import User, Organization
from documents.models import Document, DocumentVersion, DocumentPage
from documents.services import create_document_from_upload
from documents.tasks import generate_pdf_pages_task


class TestCreateDocumentFromUpload(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Test Org")
        self.user = User.objects.create_user(
            email="test@example.com",
            password="password",
            organization=self.organization
        )
        self.mock_file = SimpleUploadedFile(
            "test.pdf", b"file_content", content_type="application/pdf"
        )

    @patch('documents.services.generate_pdf_pages_task.delay')
    @patch('django.core.files.storage.default_storage.save')
    def test_service_creates_records_and_dispatches_task(self, mock_storage_save, mock_task_delay):
        # Configure mock to return a predictable path
        mock_storage_save.return_value = f"{self.organization.id}/mock_path.pdf"

        # Call the service function
        document = create_document_from_upload(
            requesting_user=self.user,
            uploaded_file=self.mock_file
        )

        # 1. Assert that default_storage.save was called correctly
        mock_storage_save.assert_called_once()
        self.assertIn(str(self.organization.id), mock_storage_save.call_args[0][0])
        self.assertEqual(self.mock_file, mock_storage_save.call_args[0][1])

        # 2. Assert one Document object was created with correct fields
        self.assertEqual(Document.objects.count(), 1)
        created_document = Document.objects.first()
        self.assertEqual(created_document, document)
        self.assertEqual(created_document.status, 'processing')
        self.assertEqual(created_document.name, 'test.pdf')
        self.assertEqual(created_document.created_by, self.user)

        # 3. Assert one DocumentVersion object was created correctly
        self.assertEqual(DocumentVersion.objects.count(), 1)
        version = DocumentVersion.objects.first()
        self.assertEqual(version.document, created_document)
        self.assertEqual(version.version_number, 1)

        # 4. Assert that the Celery task was called once with the new version's ID
        mock_task_delay.assert_called_once_with(version.id)


class TestGeneratePdfPagesTask(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Test Org")
        self.user = User.objects.create_user(
            email="test@example.com",
            password="password",
            organization=self.organization
        )
        self.document = Document.objects.create(
            organization=self.organization,
            created_by=self.user,
            name="test.pdf",
            status='processing',
        )
        self.version = DocumentVersion.objects.create(
            document=self.document,
            version_number=1,
            original_storage_key="path/to/original.pdf"
        )
        self.sample_pdf_bytes = b"dummy-pdf-content"
        # Mock the return of the PDF conversion library
        self.mock_images = [MagicMock(), MagicMock()]

    @patch('django.core.files.storage.default_storage.save')
    @patch('documents.tasks.convert_from_bytes')
    @patch('django.core.files.storage.default_storage.open', new_callable=mock_open)
    def test_task_processes_pdf_and_updates_db(self, mock_storage_open, mock_convert, mock_storage_save):
        # Configure mocks
        mock_storage_open.return_value.read.return_value = self.sample_pdf_bytes
        mock_convert.return_value = self.mock_images

        # Call the task function directly with the version ID
        generate_pdf_pages_task(self.version.id)

        # 1. Assert that storage.open was called with the correct key
        mock_storage_open.assert_called_once_with(self.version.original_storage_key)

        # 2. Assert that convert_from_bytes was called with the PDF data
        mock_convert.assert_called_once_with(self.sample_pdf_bytes, fmt='png')

        # 3. Assert that storage.save was called for each generated page
        self.assertEqual(mock_storage_save.call_count, 2)

        # 4. Assert that two DocumentPage objects were created
        self.assertEqual(DocumentPage.objects.count(), 2)
        self.assertTrue(DocumentPage.objects.filter(document_version=self.version, page_number=1).exists())
        self.assertTrue(DocumentPage.objects.filter(document_version=self.version, page_number=2).exists())

        # 5. Refresh model instances from DB to check updated fields
        self.document.refresh_from_db()
        self.version.refresh_from_db()

        # 6. Verify the Document status is updated to 'ready'
        self.assertEqual(self.document.status, 'ready')

        # 7. Verify the DocumentVersion metadata is updated
        self.assertEqual(self.version.num_pages, 2)
        self.assertTrue(self.version.has_pages)
