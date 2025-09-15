from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import Organization
from documents.models import Document, Folder

User = get_user_model()


class DocumentsAPITests(APITestCase):
    """
    Tests for the documents API endpoints.
    """

    def setUp(self):
        """Set up the necessary objects for the tests."""
        self.organization = Organization.objects.create(name="API Test Corp")
        self.user = User.objects.create_user(
            username='apiuser@example.com',
            email='apiuser@example.com',
            password='password123',
            organization=self.organization,
            role='admin'
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
        """Test retrieving a list of documents."""
        Document.objects.create(
            name="API Document",
            organization=self.organization,
            created_by=self.user,
            storage_key="api/key",
            original_storage_key="api/original",
            type="pdf",
            content_type="application/pdf"
        )
        response = self.client.get('/api/v1/documents/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], "API Document")

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
