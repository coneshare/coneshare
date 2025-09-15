from django.contrib.auth import get_user_model
from django.test import TestCase

from core.models import Organization
from documents.models import Document, Folder, ShareLink, ShareLinkPreset, View, Viewer

User = get_user_model()


class DocumentsModelTests(TestCase):
    """
    Tests for the models in the documents app.
    """

    def setUp(self):
        """Set up the necessary objects for the tests."""
        self.organization = Organization.objects.create(name="Test Corp")
        self.user = User.objects.create_user(
            username='testuser@example.com',
            email='testuser@example.com',
            password='password123',
            organization=self.organization
        )
        self.folder = Folder.objects.create(
            name="Test Folder",
            organization=self.organization
        )
        self.document = Document.objects.create(
            name="Test Document",
            organization=self.organization,
            created_by=self.user,
            storage_key="test/key",
            original_storage_key="test/original_key",
            type="pdf",
            content_type="application/pdf"
        )

    def test_folder_creation(self):
        """Test that a Folder instance can be created."""
        self.assertIsInstance(self.folder, Folder)
        self.assertEqual(str(self.folder), "Test Folder")
        self.assertEqual(self.folder.organization, self.organization)

    def test_document_creation(self):
        """Test that a Document instance can be created."""
        self.assertIsInstance(self.document, Document)
        self.assertEqual(str(self.document), "Test Document")
        self.assertEqual(self.document.organization, self.organization)
        self.assertEqual(self.document.created_by, self.user)
        self.assertEqual(self.document.status, 'ready')

    def test_share_link_preset_creation(self):
        """Test that a ShareLinkPreset instance can be created."""
        preset = ShareLinkPreset.objects.create(
            name="Default Preset",
            organization=self.organization
        )
        self.assertIsInstance(preset, ShareLinkPreset)
        self.assertEqual(str(preset), "Default Preset")

    def test_share_link_creation(self):
        """Test that a ShareLink instance can be created."""
        share_link = ShareLink.objects.create(
            name="test",
            document=self.document,
            created_by=self.user,
            slug="test-slug-123"
        )
        self.assertIsInstance(share_link, ShareLink)
        self.assertEqual(str(share_link), "test")
        self.assertEqual(share_link.document, self.document)
        self.assertEqual(share_link.created_by, self.user)

    def test_viewer_creation(self):
        """Test that a Viewer instance can be created."""
        viewer = Viewer.objects.create(
            organization=self.organization,
            email="viewer@example.com"
        )
        self.assertIsInstance(viewer, Viewer)
        self.assertEqual(str(viewer), "viewer@example.com")

    def test_view_creation(self):
        """Test that a View instance can be created."""
        share_link = ShareLink.objects.create(document=self.document, slug="another-slug")
        view = View.objects.create(share_link=share_link, duration_seconds=0, completion_rate=0)
        self.assertIsInstance(view, View)
