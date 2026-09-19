from io import BytesIO
from unittest.mock import patch, MagicMock
import pytest
from PIL import Image

from rest_framework.test import APIClient

from documents.models import Document, DocumentVersion, DocumentPage
from sharelinks.models import ShareLink
from documents.renderers import get_renderer
from documents.services import _route_document_for_processing
from documents.tasks import transcode_heic_image_task


@pytest.mark.django_db
class TestHeicUploadRouting:
    def test_upload_heic_standard_mime(self, user):
        doc = Document.objects.create(name="photo.heic", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="photo.heic",
            storage_key="photo.heic",
            is_primary=True,
            file_size=1024,
            content_type="image/heic",
        )

        _route_document_for_processing(doc, ver, file_size=1024, content_type="image/heic")
        doc.refresh_from_db()
        ver.refresh_from_db()

        assert doc.type == "image"
        assert doc.download_only is False
        assert ver.has_pages is False
        assert ver.render_status == DocumentVersion.RENDER_NOT_GENERATED

    def test_upload_heic_octet_stream_fallback(self, user):
        doc = Document.objects.create(name="IMG_8783.HEIC", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="IMG_8783.HEIC",
            storage_key="IMG_8783.HEIC",
            is_primary=True,
            file_size=2048,
            content_type="application/octet-stream",
        )

        _route_document_for_processing(doc, ver, file_size=2048, content_type="application/octet-stream")
        doc.refresh_from_db()
        ver.refresh_from_db()

        assert doc.type == "image"
        assert doc.download_only is False
        assert ver.has_pages is False
        assert ver.render_status == DocumentVersion.RENDER_NOT_GENERATED

    def test_upload_standard_image_unaffected(self, user):
        doc = Document.objects.create(name="graphic.png", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="graphic.png",
            storage_key="graphic.png",
            is_primary=True,
            file_size=512,
            content_type="image/png",
        )

        _route_document_for_processing(doc, ver, file_size=512, content_type="image/png")
        doc.refresh_from_db()
        ver.refresh_from_db()

        assert doc.type == "image"
        assert doc.download_only is False
        assert ver.has_pages is True
        assert ver.render_status == DocumentVersion.RENDER_NOT_APPLICABLE


@pytest.mark.django_db
class TestHeicPreviewLifecycle:
    def test_get_effective_render_status_heic_not_generated(self, user):
        doc = Document.objects.create(name="IMG_0001.HEIC", type="image", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="IMG_0001.HEIC",
            storage_key="IMG_0001.HEIC",
            is_primary=True,
            has_pages=False,
            render_status=DocumentVersion.RENDER_NOT_GENERATED,
            content_type="image/heic",
        )

        assert get_renderer(ver).get_effective_render_status(ver) == DocumentVersion.RENDER_NOT_GENERATED

    def test_get_effective_render_status_heic_ready_when_has_pages(self, user):
        doc = Document.objects.create(name="IMG_0001.HEIC", type="image", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="IMG_0001.HEIC",
            storage_key="IMG_0001.HEIC",
            is_primary=True,
            has_pages=True,
            render_status=DocumentVersion.RENDER_READY,
            content_type="image/heic",
        )

        assert get_renderer(ver).get_effective_render_status(ver) == DocumentVersion.RENDER_READY

    @patch('documents.tasks.transcode_heic_image_task.delay')
    def test_enqueue_server_preview_render_dispatches_task_for_heic(self, mock_delay, user):
        doc = Document.objects.create(name="test.heic", type="image", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="test.heic",
            storage_key="test.heic",
            is_primary=True,
            has_pages=False,
            render_status=DocumentVersion.RENDER_NOT_GENERATED,
            content_type="image/heic",
        )

        result = get_renderer(ver).enqueue_render_task(ver)
        ver.refresh_from_db()

        assert result == DocumentVersion.RENDER_QUEUED
        assert ver.render_status == DocumentVersion.RENDER_QUEUED
        mock_delay.assert_called_once_with(str(ver.id))


@pytest.mark.django_db
class TestHeicTranscodingTask:
    @patch('documents.tasks.fileserver_client')
    @patch('documents.tasks.requests.get')
    def test_transcode_heic_image_task_success(self, mock_get, mock_fileserver, user):
        # Create a simple test image in JPEG format to simulate decoded image
        img = Image.new('RGB', (100, 100), color='blue')
        img_bytes = BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)

        mock_get.return_value.status_code = 200
        mock_get.return_value.content = img_bytes.getvalue()
        mock_fileserver.generate_download_url.return_value = "http://fileserver/photo.heic"

        doc = Document.objects.create(name="photo.heic", type="image", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="docs/photo.heic",
            storage_key="docs/photo.heic",
            is_primary=True,
            has_pages=False,
            render_status=DocumentVersion.RENDER_QUEUED,
            content_type="image/heic",
        )

        transcode_heic_image_task(ver.id)

        ver.refresh_from_db()
        assert ver.has_pages is True
        assert ver.render_status == DocumentVersion.RENDER_READY
        assert ver.render_error == ''
        assert ver.pages.count() == 1

        page = ver.pages.first()
        assert page.page_number == 1
        assert page.storage_key == "docs/photo_page_1.jpg"

        # Verify upload_file was called with expected storage key
        mock_fileserver.upload_file.assert_called_once()
        args, kwargs = mock_fileserver.upload_file.call_args
        assert args[0] == "docs/photo_page_1.jpg"
        assert kwargs.get('content_type') == 'image/jpeg'

    @patch('documents.tasks.fileserver_client')
    @patch('documents.tasks.requests.get')
    def test_transcode_heic_image_task_failure(self, mock_get, mock_fileserver, user):
        mock_get.return_value.status_code = 200
        mock_get.return_value.content = b"invalid_corrupt_bytes"
        mock_fileserver.generate_download_url.return_value = "http://fileserver/corrupt.heic"

        doc = Document.objects.create(name="corrupt.heic", type="image", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="docs/corrupt.heic",
            storage_key="docs/corrupt.heic",
            is_primary=True,
            has_pages=False,
            render_status=DocumentVersion.RENDER_QUEUED,
            content_type="image/heic",
        )

        transcode_heic_image_task(ver.id)

        ver.refresh_from_db()
        assert ver.has_pages is False
        assert ver.render_status == DocumentVersion.RENDER_FAILED
        assert "Failed to transcode HEIC image" in ver.render_error

    @patch('documents.tasks.fileserver_client')
    @patch('documents.tasks.requests.get')
    def test_transcode_heic_image_downsamples_large_dimension(self, mock_get, mock_fileserver, user):
        # Create a 3000x2000 test image
        img = Image.new('RGB', (3000, 2000), color='green')
        img_bytes = BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)

        mock_get.return_value.status_code = 200
        mock_get.return_value.content = img_bytes.getvalue()
        mock_fileserver.generate_download_url.return_value = "http://fileserver/huge.heic"

        doc = Document.objects.create(name="huge.heic", type="image", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="docs/huge.heic",
            storage_key="docs/huge.heic",
            is_primary=True,
            has_pages=False,
            render_status=DocumentVersion.RENDER_QUEUED,
            content_type="image/heic",
        )

        transcode_heic_image_task(ver.id)

        ver.refresh_from_db()
        assert ver.has_pages is True
        page = ver.pages.first()
        assert page.metadata["width"] <= 2560
        assert page.metadata["height"] <= 2560


@pytest.mark.django_db
class TestHeicPreviewDataApiView:
    @patch('documents.services.transcode_heic_image_task.delay')
    def test_preview_data_heic_empty_pages_during_processing(self, mock_delay, user):
        doc = Document.objects.create(name="IMG_8783.HEIC", type="image", status="ready", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="docs/IMG_8783.HEIC",
            storage_key="docs/IMG_8783.HEIC",
            is_primary=True,
            has_pages=False,
            render_status=DocumentVersion.RENDER_NOT_GENERATED,
            content_type="image/heic",
        )

        client = APIClient()
        client.force_authenticate(user=user)

        response = client.get(f"/api/v1/documents/{doc.id}/preview-data/")
        assert response.status_code == 200
        data = response.json()

        assert data["preview_status"] == "processing"
        assert data["pages"] == []

    @patch('documents.fileserver.fileserver_client')
    def test_preview_data_heic_ready_state_serves_preview_page(self, mock_fileserver, user):
        mock_fileserver.generate_download_url.side_effect = lambda key, **kw: f"http://fileserver/{key}"

        doc = Document.objects.create(name="IMG_8783.HEIC", type="image", status="ready", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="docs/IMG_8783.HEIC",
            storage_key="docs/IMG_8783.HEIC",
            is_primary=True,
            has_pages=True,
            render_status=DocumentVersion.RENDER_READY,
            content_type="image/heic",
        )
        DocumentPage.objects.create(
            document_version=ver,
            page_number=1,
            storage_key="docs/IMG_8783_page_1.jpg",
            metadata={"width": 1920, "height": 1080},
            page_links={"links": []},
        )

        client = APIClient()
        client.force_authenticate(user=user)

        response = client.get(f"/api/v1/documents/{doc.id}/preview-data/")
        assert response.status_code == 200
        data = response.json()

        assert data["preview_status"] == "ready"
        assert len(data["pages"]) == 1
        assert "docs/IMG_8783_page_1.jpg" in data["pages"][0]["url"]
        # download_url must serve original HEIC file, not the converted preview
        assert "docs/IMG_8783.HEIC" in data["download_url"]


@pytest.mark.django_db
class TestHeicShareLinkView:
    @patch('sharelinks.views.fileserver_client')
    def test_sharelink_page_serves_transcoded_page(self, mock_fileserver, user):
        mock_fileserver.generate_download_url.return_value = "http://fileserver/docs/photo_page_1.jpg"

        doc = Document.objects.create(name="photo.heic", type="image", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="docs/photo.heic",
            storage_key="docs/photo.heic",
            is_primary=True,
            has_pages=True,
            render_status=DocumentVersion.RENDER_READY,
            content_type="image/heic",
        )
        DocumentPage.objects.create(
            document_version=ver,
            page_number=1,
            storage_key="docs/photo_page_1.jpg",
            metadata={"width": 800, "height": 600},
            page_links={"links": []},
        )

        link = ShareLink.objects.create(
            created_by=user,
            document=doc,
            allow_download=True,
            enable_watermark=False,
        )

        client = APIClient()
        # Authorize session for this link
        session = client.session
        session['authorized_share_links'] = {str(link.id): {'viewer_email': 'guest@example.com'}}
        session.save()

        response = client.get(f"/api/v1/links/{link.slug}/page/1/")
        assert response.status_code == 302
        assert response.url == "http://fileserver/docs/photo_page_1.jpg"
        mock_fileserver.generate_download_url.assert_called_with("docs/photo_page_1.jpg", is_internal=False)

    @patch('sharelinks.views.requests.get')
    @patch('sharelinks.views.fileserver_client.generate_download_url')
    def test_watermarked_heic_page_render(self, mock_fs_download_url, mock_requests_get, user):
        img = Image.new('RGB', (200, 200), color='white')
        buffer = BytesIO()
        img.save(buffer, format='JPEG')
        buffer.seek(0)

        mock_fs_download_url.return_value = "http://fileserver/docs/photo_page_1.jpg"
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_response.content = buffer.getvalue()
        mock_requests_get.return_value = mock_response

        doc = Document.objects.create(name="photo.heic", type="image", status="ready", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="docs/photo.heic",
            storage_key="docs/photo.heic",
            is_primary=True,
            has_pages=True,
            render_status=DocumentVersion.RENDER_READY,
            content_type="image/heic",
        )
        DocumentPage.objects.create(
            document_version=ver,
            page_number=1,
            storage_key="docs/photo_page_1.jpg",
            metadata={"width": 200, "height": 200},
            page_links={"links": []},
        )

        link = ShareLink.objects.create(
            created_by=user,
            document=doc,
            allow_download=True,
            enable_watermark=True,
            watermark_text="Confidential {{email}}",
        )

        client = APIClient()
        session = client.session
        session['authorized_share_links'] = {str(link.id): {'viewer_email': 'viewer@example.com'}}
        session.save()

        response = client.get(f"/api/v1/links/{link.slug}/render-page/1/", REMOTE_ADDR='192.168.1.1')
        assert response.status_code == 200
        assert response.get('Content-Type') == 'image/jpeg'
        mock_fs_download_url.assert_called_with("docs/photo_page_1.jpg", is_internal=True)

