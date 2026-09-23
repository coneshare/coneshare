from unittest.mock import MagicMock, patch
import pytest
from django.test import override_settings

from core.models import Organization, User
from documents.models import Document, DocumentPage, DocumentVersion
from documents.renderers import (
    DirectImageRenderer,
    GenericFileRenderer,
    OfficeRenderer,
    PDFRenderer,
    SpreadsheetRenderer,
    TranscodedImageRenderer,
    VideoRenderer,
    get_renderer,
    get_renderer_for_file,
)


@pytest.fixture
def user(db):
    org = Organization.objects.create(name="Test Org")
    return User.objects.create_user(
        username="testuser",
        email="test@example.com",
        password="password123",
        organization=org,
    )


class TestRendererRegistryPriority:
    """Validates priority resolution order and security filtering in get_renderer_for_file."""

    def test_heic_resolves_to_transcoded_image_renderer(self):
        renderer = get_renderer_for_file("image/heic", "photo.heic")
        assert isinstance(renderer, TranscodedImageRenderer)

        renderer_case_insensitive = get_renderer_for_file("image/heic", "photo.HEIC")
        assert isinstance(renderer_case_insensitive, TranscodedImageRenderer)

    def test_direct_images_resolve_to_direct_image_renderer(self):
        for ct, fn in [
            ("image/jpeg", "photo.jpg"),
            ("image/png", "diagram.png"),
            ("image/gif", "anim.gif"),
            ("image/webp", "pic.webp"),
        ]:
            renderer = get_renderer_for_file(ct, fn)
            assert isinstance(renderer, DirectImageRenderer), f"Failed for {fn}"

    def test_svg_strictly_excluded_from_direct_image_renderer(self):
        """SVG must fall back to GenericFileRenderer to prevent Stored XSS attacks."""
        renderer_by_mime = get_renderer_for_file("image/svg+xml", "logo.svg")
        assert isinstance(renderer_by_mime, GenericFileRenderer)

        renderer_by_ext = get_renderer_for_file("application/octet-stream", "logo.svg")
        assert isinstance(renderer_by_ext, GenericFileRenderer)

    def test_pdf_resolves_to_pdf_renderer(self):
        renderer = get_renderer_for_file("application/pdf", "document.pdf")
        assert isinstance(renderer, PDFRenderer)

    def test_office_resolves_to_office_renderer(self):
        for ct, fn in [
            ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "doc.docx"),
            ("application/msword", "doc.doc"),
            ("application/vnd.openxmlformats-officedocument.presentationml.presentation", "slides.pptx"),
            ("application/vnd.ms-powerpoint", "slides.ppt"),
        ]:
            renderer = get_renderer_for_file(ct, fn)
            assert isinstance(renderer, OfficeRenderer), f"Failed for {fn}"

    def test_spreadsheet_resolves_to_spreadsheet_renderer(self):
        for ct, fn in [
            ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "data.xlsx"),
            ("application/vnd.ms-excel", "data.xls"),
            ("text/csv", "sheet.csv"),
            ("application/octet-stream", "data.xlsx"),
            ("application/octet-stream", "data.xls"),
            ("application/octet-stream", "table.csv"),
        ]:
            renderer = get_renderer_for_file(ct, fn)
            assert isinstance(renderer, SpreadsheetRenderer), f"Failed for {fn}"

    def test_video_resolves_to_video_renderer(self):
        for ct, fn in [
            ("video/mp4", "movie.mp4"),
            ("video/quicktime", "clip.mov"),
            ("video/webm", "stream.webm"),
        ]:
            renderer = get_renderer_for_file(ct, fn)
            assert isinstance(renderer, VideoRenderer), f"Failed for {fn}"

    def test_unsupported_files_fallback_to_generic_renderer(self):
        for ct, fn in [
            ("application/zip", "archive.zip"),
            ("application/x-tar", "data.tar.gz"),
            ("application/octet-stream", "unknown.xyz"),
        ]:
            renderer = get_renderer_for_file(ct, fn)
            assert isinstance(renderer, GenericFileRenderer), f"Failed for {fn}"


@pytest.mark.django_db
class TestVersionResolutionAndOfficeDivergence:
    """Validates get_renderer(version) behavior including Office documents converted to PDF."""

    def test_version_resolution_heic(self, user):
        doc = Document.objects.create(name="IMG_001.HEIC", type="image", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc, version_number=1, original_storage_key="IMG_001.HEIC", content_type="image/heic"
        )
        assert isinstance(get_renderer(ver), TranscodedImageRenderer)

    def test_version_resolution_direct_image(self, user):
        doc = Document.objects.create(name="photo.png", type="image", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc, version_number=1, original_storage_key="photo.png", content_type="image/png"
        )
        assert isinstance(get_renderer(ver), DirectImageRenderer)

    def test_version_resolution_office_when_version_type_diverges_to_pdf(self, user):
        """When LibreOffice converts an Office doc to PDF, document.type='document' while version.type='pdf'."""
        doc = Document.objects.create(name="notes.docx", type="document", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc, version_number=1, original_storage_key="notes.docx", type="pdf", content_type="application/pdf"
        )
        assert isinstance(get_renderer(ver), OfficeRenderer)

    def test_version_resolution_spreadsheet(self, user):
        doc = Document.objects.create(name="financials.xlsx", type="spreadsheet", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc, version_number=1, original_storage_key="financials.xlsx", type="spreadsheet", content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        assert isinstance(get_renderer(ver), SpreadsheetRenderer)

    def test_version_resolution_legacy_xlsx_with_pages_falls_back_to_office(self, user):
        """Zero migration invariant: legacy .xlsx with has_pages=True stays with OfficeRenderer."""
        doc = Document.objects.create(name="legacy.xlsx", type="document", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc, version_number=1, original_storage_key="legacy.xlsx", type="document", has_pages=True
        )
        assert isinstance(get_renderer(ver), OfficeRenderer)

    def test_version_resolution_spreadsheet_when_version_content_type_is_pdf(self, user):
        """When a spreadsheet's version content_type was set to application/pdf without pages, it must resolve to SpreadsheetRenderer."""
        doc = Document.objects.create(name="financials.xls", type="spreadsheet", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc, version_number=1, original_storage_key="financials.xls", type="document", content_type="application/pdf", has_pages=False
        )
        assert isinstance(get_renderer(ver), SpreadsheetRenderer)


@pytest.mark.django_db
class TestPageStorageKeyResolution:
    """Validates get_page_storage_key behavior across renderers."""

    def test_direct_image_page_storage_key(self, user):
        renderer = DirectImageRenderer()
        doc = Document.objects.create(name="pic.jpg", type="image", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc, version_number=1, original_storage_key="storage/pic.jpg", is_primary=True
        )

        assert renderer.get_page_storage_key(ver, 1) == "storage/pic.jpg"
        assert renderer.get_page_storage_key(ver, 2) is None
        assert renderer.get_page_storage_key(ver, 0) is None

    def test_transcoded_image_page_storage_key(self, user):
        renderer = TranscodedImageRenderer()
        doc = Document.objects.create(name="img.heic", type="image", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc, version_number=1, original_storage_key="orig/img.heic", is_primary=True
        )

        # Before transcoding completes, page 1 does NOT exist in DocumentPage; must return None (not raw HEIC)
        assert renderer.get_page_storage_key(ver, 1) is None

        # After transcoding completes, page 1 returns transcoded storage key
        DocumentPage.objects.create(
            document_version=ver, page_number=1, storage_key="pages/img_p1.jpg"
        )
        assert renderer.get_page_storage_key(ver, 1) == "pages/img_p1.jpg"
        assert renderer.get_page_storage_key(ver, 2) is None

    def test_pdf_paginated_storage_key(self, user):
        renderer = PDFRenderer()
        doc = Document.objects.create(name="doc.pdf", type="pdf", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc, version_number=1, original_storage_key="doc.pdf", is_primary=True
        )
        DocumentPage.objects.create(document_version=ver, page_number=1, storage_key="pages/doc_p1.png")
        DocumentPage.objects.create(document_version=ver, page_number=2, storage_key="pages/doc_p2.png")

        assert renderer.get_page_storage_key(ver, 1) == "pages/doc_p1.png"
        assert renderer.get_page_storage_key(ver, 2) == "pages/doc_p2.png"
        assert renderer.get_page_storage_key(ver, 3) is None

    def test_video_and_generic_and_spreadsheet_return_none(self, user):
        video_renderer = VideoRenderer()
        generic_renderer = GenericFileRenderer()
        spreadsheet_renderer = SpreadsheetRenderer()

        doc = Document.objects.create(name="clip.mp4", type="video", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(document=doc, version_number=1, is_primary=True)

        assert video_renderer.get_page_storage_key(ver, 1) is None
        assert generic_renderer.get_page_storage_key(ver, 1) is None
        assert spreadsheet_renderer.get_page_storage_key(ver, 1) is None
        assert spreadsheet_renderer.should_serve_pages(ver, "ready") is False


@pytest.mark.django_db
class TestDownloadUrlParity:
    """Validates get_download_url optimization and safety across renderers."""

    def test_direct_image_reuses_page_1_url(self, user):
        renderer = DirectImageRenderer()
        doc = Document.objects.create(name="photo.jpg", type="image", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc, version_number=1, original_storage_key="photo.jpg", is_primary=True
        )

        pages_data = [{'page_number': 1, 'url': 'http://fileserver/photo.jpg'}]
        download_url = renderer.get_download_url(doc, ver, pages_data)
        assert download_url == 'http://fileserver/photo.jpg'

    @patch('documents.fileserver.fileserver_client')
    def test_transcoded_image_downloads_original_asset_not_jpeg_page(self, mock_fs, user):
        mock_fs.generate_download_url.return_value = "http://fileserver/download/IMG_001.HEIC"

        renderer = TranscodedImageRenderer()
        doc = Document.objects.create(name="IMG_001.HEIC", type="image", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc, version_number=1, original_storage_key="IMG_001.HEIC", is_primary=True
        )

        pages_data = [{'page_number': 1, 'url': 'http://fileserver/pages/IMG_001_p1.jpg'}]
        download_url = renderer.get_download_url(doc, ver, pages_data)

        # Must NOT reuse the JPEG preview URL
        assert download_url == "http://fileserver/download/IMG_001.HEIC"
        mock_fs.generate_download_url.assert_called_once_with("IMG_001.HEIC", is_internal=False)

    @patch('documents.fileserver.fileserver_client')
    def test_direct_image_preview_pages_data_uses_storage_key_when_original_storage_key_absent(
        self, mock_fs, user
    ):
        mock_fs.generate_download_url.return_value = "http://fileserver/download/legacy_pic.jpg"

        renderer = DirectImageRenderer()
        doc = Document.objects.create(name="legacy_pic.jpg", type="image", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="",
            storage_key="legacy_pic.jpg",
            is_primary=True,
            has_pages=True,
        )

        pages = renderer.get_preview_pages_data(doc, ver)
        assert len(pages) == 1
        assert pages[0]['page_number'] == 1
        assert pages[0]['url'] == "http://fileserver/download/legacy_pic.jpg"
        mock_fs.generate_download_url.assert_called_once_with(
            "legacy_pic.jpg", is_internal=False, filename="legacy_pic.jpg"
        )

    @patch('documents.fileserver.fileserver_client')
    def test_get_download_url_fallback_to_storage_key(self, mock_fs, user):
        mock_fs.generate_download_url.return_value = "http://fileserver/download/doc.pdf"

        renderer = PDFRenderer()
        doc = Document.objects.create(name="doc.pdf", type="pdf", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="",
            storage_key="doc.pdf",
            is_primary=True,
        )

        download_url = renderer.get_download_url(doc, ver)
        assert download_url == "http://fileserver/download/doc.pdf"
        mock_fs.generate_download_url.assert_called_once_with("doc.pdf", is_internal=False)


@pytest.mark.django_db
class TestAtomicClaimConcurrency:
    """Validates Template Method atomic conditional update in enqueue_render_task."""

    @patch('documents.tasks.generate_pdf_pages_task.delay')
    def test_concurrent_enqueue_dispatches_task_only_once(self, mock_delay, user):
        doc = Document.objects.create(
            name="report.pdf", type="pdf", status="ready", created_by=user, organization=user.organization
        )
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            type="pdf",
            original_storage_key="report.pdf",
            is_primary=True,
            render_status=DocumentVersion.RENDER_NOT_GENERATED,
        )

        renderer = PDFRenderer()

        with override_settings(PDF_PREVIEW_ENGINE='server_pages'):
            status_1 = renderer.enqueue_render_task(ver)
            assert status_1 == DocumentVersion.RENDER_QUEUED
            assert mock_delay.call_count == 1

            # Second concurrent caller attempts to claim the same version
            status_2 = renderer.enqueue_render_task(ver)
            assert status_2 == DocumentVersion.RENDER_QUEUED
            # Task must NOT be dispatched a second time
            assert mock_delay.call_count == 1

    @patch('documents.tasks.generate_pdf_pages_task.delay')
    def test_dispatch_failure_transitions_to_render_failed(self, mock_delay, user):
        """
        When Celery task dispatch raises an exception, the version must atomically
        transition to RENDER_FAILED with an informative error message, rather than
        remaining stuck in RENDER_QUEUED forever.
        """
        mock_delay.side_effect = RuntimeError("Broker connection refused")

        doc = Document.objects.create(
            name="failing.pdf", type="pdf", status="ready", created_by=user, organization=user.organization
        )
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            type="pdf",
            original_storage_key="failing.pdf",
            is_primary=True,
            render_status=DocumentVersion.RENDER_NOT_GENERATED,
        )

        renderer = PDFRenderer()

        with override_settings(PDF_PREVIEW_ENGINE='server_pages'):
            with pytest.raises(RuntimeError, match="Broker connection refused"):
                renderer.enqueue_render_task(ver)

        # In-memory instance and database row must both be RENDER_FAILED
        assert ver.render_status == DocumentVersion.RENDER_FAILED
        assert "Failed to dispatch background rendering task" in ver.render_error

        ver.refresh_from_db()
        assert ver.render_status == DocumentVersion.RENDER_FAILED
        assert "Failed to dispatch background rendering task" in ver.render_error
        assert "Broker connection refused" in ver.render_error


@pytest.mark.django_db
class TestInitializeMetadata:
    """Validates metadata initialization and database persistence across all renderers."""

    def test_generic_file_renderer_persists_document_and_version(self, user):
        doc = Document.objects.create(name="archive.zip", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(document=doc, version_number=1, is_primary=True)

        renderer = GenericFileRenderer()
        renderer.initialize_metadata(doc, ver, file_size=1024, content_type="application/zip")

        # Reload from DB to confirm persistence
        doc.refresh_from_db()
        ver.refresh_from_db()

        assert doc.download_only is True
        assert doc.type == 'file'
        assert doc.content_type == 'application/zip'
        assert doc.file_size == 1024
        assert doc.status == 'ready'

        assert ver.type == 'file'
        assert ver.has_pages is False
        assert ver.render_status == DocumentVersion.RENDER_NOT_APPLICABLE

    def test_direct_image_renderer_persists_metadata(self, user):
        doc = Document.objects.create(name="photo.png", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(document=doc, version_number=1, is_primary=True)

        renderer = DirectImageRenderer()
        renderer.initialize_metadata(doc, ver, file_size=2048, content_type="image/png")

        doc.refresh_from_db()
        ver.refresh_from_db()

        assert doc.download_only is False
        assert doc.type == 'image'
        assert doc.num_pages == 1
        assert ver.has_pages is True
        assert ver.render_status == DocumentVersion.RENDER_NOT_APPLICABLE

    def test_transcoded_image_renderer_persists_metadata(self, user):
        doc = Document.objects.create(name="photo.heic", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(document=doc, version_number=1, is_primary=True)

        renderer = TranscodedImageRenderer()
        renderer.initialize_metadata(doc, ver, file_size=4096, content_type="image/heic")

        doc.refresh_from_db()
        ver.refresh_from_db()

        assert doc.download_only is False
        assert doc.type == 'image'
        assert ver.has_pages is False
        assert ver.render_status == DocumentVersion.RENDER_NOT_GENERATED

    def test_pdf_renderer_persists_metadata(self, user):
        doc = Document.objects.create(name="manual.pdf", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(document=doc, version_number=1, is_primary=True)

        renderer = PDFRenderer()
        renderer.initialize_metadata(doc, ver, file_size=8192, content_type="application/pdf")

        doc.refresh_from_db()
        ver.refresh_from_db()

        assert doc.download_only is False
        assert doc.type == 'pdf'
        assert ver.type == 'pdf'
        assert ver.has_pages is False
        assert ver.render_status == DocumentVersion.RENDER_NOT_GENERATED

    def test_office_renderer_persists_metadata(self, user):
        doc = Document.objects.create(name="report.docx", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(document=doc, version_number=1, is_primary=True)

        renderer = OfficeRenderer()
        renderer.initialize_metadata(
            doc, ver, file_size=16384,
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )

        doc.refresh_from_db()
        ver.refresh_from_db()

        assert doc.download_only is False
        assert doc.type == 'document'
        assert ver.type == 'document'
        assert ver.has_pages is False
        assert ver.render_status == DocumentVersion.RENDER_NOT_GENERATED

    def test_video_renderer_persists_metadata(self, user):
        doc = Document.objects.create(name="clip.mp4", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(document=doc, version_number=1, is_primary=True)

        renderer = VideoRenderer()
        with override_settings(ENABLE_VIDEO_PREVIEW=True):
            renderer.initialize_metadata(doc, ver, file_size=32768, content_type="video/mp4")

        doc.refresh_from_db()
        ver.refresh_from_db()

        assert doc.download_only is False
        assert doc.type == 'video'
        assert ver.type == 'video'
        assert ver.has_pages is False
        assert ver.render_status == DocumentVersion.RENDER_NOT_GENERATED


@pytest.mark.django_db
class TestEnqueueRenderTaskNonServerRenderable:
    """Validates that non-server-renderable files (direct images, generic files) do not corrupt DB state."""

    def test_direct_image_enqueue_does_not_mutate_db_to_not_generated(self, user):
        doc = Document.objects.create(name="photo.png", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(document=doc, version_number=1, is_primary=True)

        renderer = DirectImageRenderer()
        renderer.initialize_metadata(doc, ver, file_size=1024, content_type="image/png")

        ver.refresh_from_db()
        assert ver.render_status == DocumentVersion.RENDER_NOT_APPLICABLE
        assert ver.has_pages is True

        # Calling enqueue_render_task must return RENDER_READY and preserve RENDER_NOT_APPLICABLE in DB
        result = renderer.enqueue_render_task(ver)
        assert result == DocumentVersion.RENDER_READY

        ver.refresh_from_db()
        assert ver.render_status == DocumentVersion.RENDER_NOT_APPLICABLE

    def test_oversized_direct_image_enqueue_returns_not_applicable_without_db_change(self, user):
        doc = Document.objects.create(name="huge.png", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(document=doc, version_number=1, is_primary=True)

        renderer = DirectImageRenderer()
        renderer.initialize_metadata(doc, ver, file_size=500 * 1024 * 1024, content_type="image/png")

        ver.refresh_from_db()
        assert ver.render_status == DocumentVersion.RENDER_NOT_APPLICABLE
        assert ver.has_pages is False

        result = renderer.enqueue_render_task(ver)
        assert result == DocumentVersion.RENDER_NOT_APPLICABLE

        ver.refresh_from_db()
        assert ver.render_status == DocumentVersion.RENDER_NOT_APPLICABLE

    def test_generic_file_enqueue_returns_not_applicable_without_db_change(self, user):
        doc = Document.objects.create(name="archive.zip", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(document=doc, version_number=1, is_primary=True)

        renderer = GenericFileRenderer()
        renderer.initialize_metadata(doc, ver, file_size=1024, content_type="application/zip")

        ver.refresh_from_db()
        assert ver.render_status == DocumentVersion.RENDER_NOT_APPLICABLE

        result = renderer.enqueue_render_task(ver)
        assert result == DocumentVersion.RENDER_NOT_APPLICABLE

        ver.refresh_from_db()
        assert ver.render_status == DocumentVersion.RENDER_NOT_APPLICABLE


@pytest.mark.django_db
class TestDynamicPreviewableSizeEnforcement:
    """Validates that large versions correctly respect size limits even when doc.file_size is small."""

    def test_pdf_with_small_doc_size_and_large_version_size_is_not_previewable(self, user):
        doc = Document.objects.create(
            name="contract.pdf",
            type="pdf",
            file_size=5000,
            download_only=False,
            created_by=user,
            organization=user.organization,
        )
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=2,
            type="pdf",
            file_size=500 * 1024 * 1024,
            is_primary=True,
        )
        renderer = PDFRenderer()
        with override_settings(PDF_PREVIEW_ENGINE='server_pages'):
            assert renderer.is_dynamically_previewable(ver) is False

    def test_office_with_small_doc_size_and_large_version_size_is_not_previewable(self, user):
        doc = Document.objects.create(
            name="report.docx",
            type="document",
            file_size=5000,
            download_only=False,
            created_by=user,
            organization=user.organization,
        )
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=2,
            type="document",
            file_size=500 * 1024 * 1024,
            is_primary=True,
        )
        renderer = OfficeRenderer()
        with override_settings(ENABLE_OFFICE_PREVIEW=True, PDF_PREVIEW_ENGINE='server_pages'):
            assert renderer.is_dynamically_previewable(ver) is False

    def test_video_with_small_doc_size_and_large_version_size_is_not_previewable(self, user):
        doc = Document.objects.create(
            name="clip.mp4",
            type="video",
            file_size=5000,
            download_only=False,
            created_by=user,
            organization=user.organization,
        )
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=2,
            type="video",
            file_size=500 * 1024 * 1024,
            is_primary=True,
        )
        renderer = VideoRenderer()
        with override_settings(ENABLE_VIDEO_PREVIEW=True):
            assert renderer.is_dynamically_previewable(ver) is False


class TestDispatchTaskContract:
    """Validates the _dispatch_task template method semantics."""

    def test_direct_image_and_generic_renderers_do_not_define_dummy_dispatch_task(self):
        # Subclasses without Celery tasks should not define dummy pass methods
        assert '_dispatch_task' not in DirectImageRenderer.__dict__
        assert '_dispatch_task' not in GenericFileRenderer.__dict__

    def test_base_dispatch_task_raises_not_implemented_error(self):
        from documents.renderers.base import BasePreviewRenderer

        renderer = DirectImageRenderer()
        # Direct call to base _dispatch_task must raise NotImplementedError
        with pytest.raises(NotImplementedError) as exc_info:
            BasePreviewRenderer._dispatch_task(renderer, MagicMock())
        assert "inherits the default enqueue_render_task but does not implement _dispatch_task" in str(exc_info.value)

    def test_subclass_can_instantiate_without_dispatch_task_but_enqueue_fails_fast(self, user):
        from documents.renderers.base import BasePreviewRenderer

        class IncompleteAsyncRenderer(BasePreviewRenderer):
            @classmethod
            def can_handle_file(cls, content_type: str, filename: str) -> bool:
                return True

            @classmethod
            def can_handle_version(cls, version: DocumentVersion) -> bool:
                return True

            def initialize_metadata(self, document: Document, version: DocumentVersion, file_size: int, content_type: str):
                pass

            def get_preview_mode(self, version: DocumentVersion) -> str:
                return 'server_pages'

        # Instantiation succeeds because _dispatch_task is no longer an @abstractmethod
        incomplete_renderer = IncompleteAsyncRenderer()

        doc = Document.objects.create(name="dummy.txt", created_by=user, organization=user.organization)
        ver = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            render_status=DocumentVersion.RENDER_NOT_GENERATED,
            is_primary=True,
        )

        # But enqueuing fails fast instead of silently hanging in RENDER_QUEUED
        with pytest.raises(NotImplementedError) as exc_info:
            incomplete_renderer.enqueue_render_task(ver)
        assert "IncompleteAsyncRenderer inherits the default enqueue_render_task but does not implement _dispatch_task" in str(exc_info.value)


@pytest.mark.django_db
class TestBuildPageUrlContract:
    """Validates BasePreviewRenderer._build_page_url formatting for share links and datarooms."""

    @override_settings(SITE_DOMAIN="http://test.coneshare.com")
    def test_build_page_url_standard_share_link(self):
        renderer = DirectImageRenderer()
        link = MagicMock(slug="abc1234", dataroom=None)

        url = renderer._build_page_url(page_number=1, storage_key="pages/1.png", share_link=link, is_watermarked=False)
        assert url == "http://test.coneshare.com/api/v1/links/abc1234/page/1/"

        watermarked_url = renderer._build_page_url(page_number=1, storage_key="pages/1.png", share_link=link, is_watermarked=True)
        assert watermarked_url == "http://test.coneshare.com/api/v1/links/abc1234/render-page/1/"

    @override_settings(SITE_DOMAIN="http://test.coneshare.com")
    def test_build_page_url_dataroom_share_link(self):
        renderer = DirectImageRenderer()
        link = MagicMock(slug="abc1234", dataroom=MagicMock())

        # With dataroom_document_id
        url = renderer._build_page_url(
            page_number=1, storage_key="pages/1.png", share_link=link, dataroom_document_id="ddoc_999", is_watermarked=False
        )
        assert url == "http://test.coneshare.com/api/v1/links/abc1234/page/1/?dataroom_document_id=ddoc_999"

        watermarked_url = renderer._build_page_url(
            page_number=1, storage_key="pages/1.png", share_link=link, dataroom_document_id="ddoc_999", is_watermarked=True
        )
        assert watermarked_url == "http://test.coneshare.com/api/v1/links/abc1234/render-page/1/?dataroom_document_id=ddoc_999"

        # When dataroom_document_id is None, it safely omits the param rather than writing ?dataroom_document_id=None
        url_without_id = renderer._build_page_url(
            page_number=1, storage_key="pages/1.png", share_link=link, dataroom_document_id=None, is_watermarked=False
        )
        assert url_without_id == "http://test.coneshare.com/api/v1/links/abc1234/page/1/"


