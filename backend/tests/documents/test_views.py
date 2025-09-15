from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import Organization
from documents.models import Document, Folder, ShareLink

User = get_user_model()


class DocumentsAPITests(APITestCase):
    """
    Tests for the documents API endpoints.
    """

    def setUp(self):
        """Set up the necessary objects for the tests."""
        self.organization = Organization.objects.first()
        self.user = User.objects.create_user(
            username='apiuser@example.com',
            email='apiuser@example.com',
            password='password123',
            organization=self.organization,
            role='admin'
        )
        self.user2 = User.objects.create_user(
            username='apiuser2@example.com',
            email='apiuser2@example.com',
            password='password123',
            organization=self.organization,
            role='member'
        )
        self.client.force_authenticate(user=self.user)

    def test_list_folders(self):
        """Test retrieving a list of folders."""
        Folder.objects.create(name="Root Folder", organization=self.organization)
        response = self.client.get('/api/v1/folders/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], "Root Folder")

    def test_create_folder(self):
        """Test creating a new folder."""
        data = {'name': 'New API Folder'}
        response = self.client.post('/api/v1/folders/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'New API Folder')
        self.assertEqual(Folder.objects.count(), 1)
        self.assertEqual(Folder.objects.get().organization, self.organization)

    def test_list_documents(self):
        """Test retrieving a list of documents is scoped to the current user."""
        # This document should be in the list
        Document.objects.create(
            name="My API Document",
            organization=self.organization,
            created_by=self.user,
            storage_key="api/key",
            original_storage_key="api/original",
            type="pdf",
            content_type="application/pdf"
        )
        # This document should NOT be in the list
        Document.objects.create(
            name="Other User's Document",
            organization=self.organization,
            created_by=self.user2,
            storage_key="api/key2",
            original_storage_key="api/original2",
            type="pdf",
            content_type="application/pdf"
        )
        response = self.client.get('/api/v1/documents/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], "My API Document")

    def test_create_document(self):
        """Test creating a new document."""
        data = {
            'name': 'New API Doc',
            'storage_key': 'new/key',
            'original_storage_key': 'new/original',
            'type': 'docx',
            'content_type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
        response = self.client.post('/api/v1/documents/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Document.objects.count(), 1)
        doc = Document.objects.get()
        self.assertEqual(doc.name, 'New API Doc')
        self.assertEqual(doc.organization, self.organization)
        self.assertEqual(doc.created_by, self.user)

    def test_list_share_links_is_scoped_to_user(self):
        """Test retrieving a list of share links is scoped to the current user."""
        doc1 = Document.objects.create(
            name="Doc for my link",
            organization=self.organization,
            created_by=self.user
        )
        doc2 = Document.objects.create(
            name="Doc for other user's link",
            organization=self.organization,
            created_by=self.user2
        )
        # This share link should be in the list
        ShareLink.objects.create(
            document=doc1,
            created_by=self.user,
            name="My Link"
        )
        # This share link should NOT be in the list
        ShareLink.objects.create(
            document=doc2,
            created_by=self.user2,
            name="Other User's Link"
        )
        response = self.client.get('/api/v1/share-links/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], "My Link")


    def test_upload_document_with_path(self):
        """Test uploading a file with a path to create folders."""
        dummy_file = SimpleUploadedFile(
            "report.docx", b"content", "application/msword"
        )

        response = self.client.post(
            '/api/v1/uploads/document/',
            {
                'file': dummy_file,
                'path': 'Client Reports/Q4/Final/report.docx'
            },
            format='multipart'
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Document.objects.count(), 1)
        self.assertEqual(Folder.objects.count(), 3)

        doc = Document.objects.first()
        self.assertEqual(doc.name, 'report.docx')
        self.assertIsNotNone(doc.folder)
        self.assertEqual(doc.folder.name, 'Final')
        self.assertEqual(doc.folder.parent.name, 'Q4')
        self.assertEqual(doc.folder.parent.parent.name, 'Client Reports')
        self.assertIsNone(doc.folder.parent.parent.parent)
