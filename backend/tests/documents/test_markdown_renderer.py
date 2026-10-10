from unittest.mock import MagicMock, patch
import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from core.models import Organization, User
from documents.models import Document, DocumentVersion
from documents.renderers import MarkdownRenderer, get_renderer, get_renderer_for_file
from documents.services import _get_doc_type_from_content_type


@pytest.fixture
def user(db):
    org = Organization.objects.create(name="Test Org")
    return User.objects.create_user(
        username="testuser",
        email="test@example.com",
        password="password123",
        organization=org,
    )


class TestMarkdownRendererContract:
    def test_can_handle_file(self):
        assert MarkdownRenderer.can_handle_file("text/markdown", "doc.md")
        assert MarkdownRenderer.can_handle_file("text/x-markdown", "doc.markdown")
        assert MarkdownRenderer.can_handle_file("application/octet-stream", "DOC.MD")
        assert MarkdownRenderer.can_handle_file("", "test.markdown")
        assert not MarkdownRenderer.can_handle_file("application/pdf", "doc.pdf")
        assert not MarkdownRenderer.can_handle_file("image/png", "photo.png")

    def test_can_handle_version(self, user):
        doc = Document.objects.create(
            name="notes.md", type="markdown", created_by=user, organization=user.organization
        )
        ver = DocumentVersion.objects.create(
            document=doc, version_number=1, original_storage_key="notes.md", content_type="text/markdown"
        )
        assert MarkdownRenderer.can_handle_version(ver)
        assert isinstance(get_renderer(ver), MarkdownRenderer)

    def test_no_dummy_dispatch_task(self):
        assert '_dispatch_task' not in MarkdownRenderer.__dict__

    def test_should_serve_pages_always_false(self):
        renderer = MarkdownRenderer()
        ver = MagicMock()
        assert renderer.should_serve_pages(ver, "ready") is False
        assert renderer.get_page_storage_key(ver, 1) is None


@pytest.mark.django_db
class TestMarkdownMetadataInitialization:
    def test_initialize_metadata_within_limit(self, user):
        doc = Document.objects.create(name="README.md", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(document=doc, version_number=1, is_primary=True)

        renderer = MarkdownRenderer()
        renderer.initialize_metadata(doc, ver, file_size=1024, content_type="text/markdown")

        doc.refresh_from_db()
        ver.refresh_from_db()

        assert doc.status == "ready"
        assert doc.type == "markdown"
        assert doc.download_only is False
        assert doc.num_pages == 1

        assert ver.type == "markdown"
        assert ver.num_pages == 1
        assert ver.has_pages is False
        assert ver.render_status == DocumentVersion.RENDER_READY
        assert ver.render_error == ""

    def test_initialize_metadata_oversized(self, user):
        doc = Document.objects.create(name="big.md", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(document=doc, version_number=1, is_primary=True)

        renderer = MarkdownRenderer()
        with patch('core.services.get_dynamic_setting', return_value=10):
            renderer.initialize_metadata(doc, ver, file_size=50 * 1024 * 1024, content_type="text/markdown")

        doc.refresh_from_db()
        ver.refresh_from_db()

        assert doc.status == "ready"
        assert doc.type == "markdown"
        assert doc.download_only is True
        assert ver.render_status == DocumentVersion.RENDER_NOT_APPLICABLE
        assert ver.has_pages is False


@pytest.mark.django_db
class TestMarkdownPreviewModeAndEnqueue:
    def test_get_preview_mode(self, user):
        doc = Document.objects.create(name="guide.md", type="markdown", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(document=doc, version_number=1, is_primary=True, file_size=1024)

        renderer = MarkdownRenderer()
        assert renderer.get_preview_mode(ver) == "markdown"

        with patch('core.services.get_dynamic_setting', return_value=0):
            with patch('documents.models.get_dynamic_setting', return_value=0):
                assert renderer.get_preview_mode(ver) == "download_only"

    def test_enqueue_render_task_synchronous(self, user):
        doc = Document.objects.create(name="guide.md", type="markdown", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc, version_number=1, is_primary=True, file_size=1024,
            render_status=DocumentVersion.RENDER_NOT_GENERATED
        )

        renderer = MarkdownRenderer()
        status = renderer.enqueue_render_task(ver)
        assert status == DocumentVersion.RENDER_READY

        ver.refresh_from_db()
        assert ver.render_status == DocumentVersion.RENDER_READY

    def test_enqueue_render_task_oversized(self, user):
        doc = Document.objects.create(name="huge.md", type="markdown", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc, version_number=1, is_primary=True, file_size=50 * 1024 * 1024,
            render_status=DocumentVersion.RENDER_NOT_GENERATED
        )

        renderer = MarkdownRenderer()
        with patch('core.services.get_dynamic_setting', return_value=10):
            status = renderer.enqueue_render_task(ver)
            assert status == DocumentVersion.RENDER_NOT_APPLICABLE

        ver.refresh_from_db()
    def test_dynamic_limit_adjustment_after_upload(self, user):
        doc = Document.objects.create(
            name="large.md", type="markdown", file_size=15 * 1024 * 1024,
            download_only=True, created_by=user, organization=user.organization
        )
        ver = DocumentVersion.objects.create(
            document=doc, version_number=1, is_primary=True, file_size=15 * 1024 * 1024,
            render_status=DocumentVersion.RENDER_NOT_APPLICABLE
        )
        renderer = MarkdownRenderer()

        # Under 10MB limit: oversized, download_only
        with patch('core.services.get_dynamic_setting', return_value=10):
            with patch('documents.models.get_dynamic_setting', return_value=10):
                assert renderer.is_dynamically_previewable(ver) is False
                assert renderer.get_preview_mode(ver) == 'download_only'

        # Admin raises limit to 20MB: file is now dynamically previewable even though download_only was persisted
        with patch('core.services.get_dynamic_setting', return_value=20):
            with patch('documents.models.get_dynamic_setting', return_value=20):
                assert renderer.is_dynamically_previewable(ver) is True
                assert renderer.get_preview_mode(ver) == 'markdown'
                assert renderer.enqueue_render_task(ver) == DocumentVersion.RENDER_READY


@pytest.mark.django_db
class TestMarkdownDocTypeResolution:
    def test_get_doc_type_from_content_type(self):
        assert _get_doc_type_from_content_type("text/markdown", "readme.md") == "markdown"
        assert _get_doc_type_from_content_type("text/x-markdown", "readme.markdown") == "markdown"
        assert _get_doc_type_from_content_type("application/octet-stream", "README.MD") == "markdown"
        assert _get_doc_type_from_content_type("", "guide.markdown") == "markdown"

    def test_document_is_download_only_dynamic(self, user):
        doc = Document.objects.create(
            name="notes.md", type="markdown", file_size=5 * 1024 * 1024,
            created_by=user, organization=user.organization
        )
        with patch('documents.models.get_dynamic_setting', return_value=10):
            assert doc.is_download_only is False

        with patch('documents.models.get_dynamic_setting', return_value=2):
            assert doc.is_download_only is True


@pytest.mark.django_db
class TestDocumentPreviewDataViewMarkdown:
    def test_preview_data_markdown(self, user):
        client = APIClient()
        client.force_authenticate(user=user)

        doc = Document.objects.create(
            name="README.md", type="markdown", status="ready", created_by=user, organization=user.organization
        )
        DocumentVersion.objects.create(
            document=doc, version_number=1, is_primary=True, original_storage_key="org_1/README.md",
            content_type="text/markdown", file_size=1024, render_status="ready"
        )

        with patch('documents.fileserver.fileserver_client.generate_preview_url', return_value="http://test.coneshare.com/files/preview/token123"):
            response = client.get(f'/api/v1/documents/{doc.id}/preview-data/')

        assert response.status_code == 200
        data = response.json()
        assert data['preview_mode'] == 'markdown'
        assert data['preview_status'] == 'ready'
        assert data['markdown_preview_url'] == "http://test.coneshare.com/files/preview/token123"
        assert data['pages'] == []
