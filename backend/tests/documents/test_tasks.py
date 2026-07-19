import tempfile as real_tempfile
import shutil
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
from django.test import override_settings

from documents.models import Document, DocumentVersion, DocumentPage
from documents.tasks import generate_pdf_pages_task, generate_video_stream_task, _resolve_pdf_object
from documents.services import _normalize_content_type


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
            storage_key="path/to/original.pdf",
            is_primary=True,
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
        page1 = DocumentPage.objects.get(document_version=version, page_number=1)
        assert page1.page_links == {"links": []}

        # 5. Refresh model instances from DB to check updated fields
        document.refresh_from_db()
        version.refresh_from_db()

        # 6. Verify the Document status is updated to 'ready'
        assert document.status == 'ready'

        # 7. Verify the DocumentVersion metadata is updated
        assert version.num_pages == 2
        assert version.has_pages
        assert version.render_status == DocumentVersion.RENDER_READY
        assert version.render_error == ''

    @patch('documents.tasks.pdfinfo_from_bytes')
    @patch('documents.tasks.requests.put')
    @patch('documents.tasks.fileserver_client.generate_upload_url')
    @patch('documents.tasks.requests.get')
    @patch('documents.tasks.fileserver_client.generate_download_url')
    @patch('documents.tasks.convert_from_bytes')
    def test_task_does_not_restore_stale_version_as_primary(
        self,
        mock_convert,
        mock_fs_download_url,
        mock_requests_get,
        mock_fs_upload_url,
        mock_requests_put,
        mock_pdfinfo,
        user,
    ):
        document = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="versioned.pdf",
            status='ready',
            storage_key="path/to/current.pdf",
            num_pages=7,
            status_message="Current version is ready.",
        )
        stale_version = DocumentVersion.objects.create(
            document=document,
            version_number=1,
            original_storage_key="path/to/stale.pdf",
            storage_key="path/to/stale.pdf",
            is_primary=False,
            render_status=DocumentVersion.RENDER_PROCESSING,
        )
        current_version = DocumentVersion.objects.create(
            document=document,
            version_number=2,
            original_storage_key="path/to/current.pdf",
            storage_key="path/to/current.pdf",
            is_primary=True,
            num_pages=7,
        )

        sample_pdf_bytes = b"dummy-pdf-content"
        mock_image = MagicMock()
        mock_image.save.side_effect = lambda buf, format: buf.write(b'img1')
        mock_convert.return_value = [mock_image]
        mock_pdfinfo.return_value = {'Pages': 1}
        mock_fs_download_url.return_value = "/files/download/token"
        mock_get_response = MagicMock()
        mock_get_response.raise_for_status.return_value = None
        mock_get_response.content = sample_pdf_bytes
        mock_requests_get.return_value = mock_get_response
        mock_fs_upload_url.return_value = "/upload/page1"
        mock_put_response = MagicMock()
        mock_put_response.raise_for_status.return_value = None
        mock_requests_put.return_value = mock_put_response

        generate_pdf_pages_task(stale_version.id)

        document.refresh_from_db()
        stale_version.refresh_from_db()
        current_version.refresh_from_db()

        assert stale_version.is_primary is False
        assert stale_version.has_pages is True
        assert stale_version.render_status == DocumentVersion.RENDER_READY
        assert current_version.is_primary is True
        assert document.storage_key == "path/to/current.pdf"
        assert document.num_pages == 7
        assert document.status_message == "Current version is ready."

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
            storage_key="path/to/large.pdf",
            is_primary=True,
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

        # 4. Verify Document/Version fields preserve file access and fail only render state
        assert document.status == 'ready'
        assert document.download_only is False
        assert document.num_pages == 11
        assert document.status_message == "Document has too many pages to generate a preview."
        assert version.num_pages == 11
        assert version.has_pages is False
        assert version.render_status == DocumentVersion.RENDER_FAILED
        assert version.render_error == "Document has too many pages to generate a preview."

    @patch('documents.tasks.pdfinfo_from_bytes')
    @patch('documents.tasks.convert_from_bytes')
    @patch('documents.tasks.requests.get')
    @patch('documents.tasks.fileserver_client.generate_download_url')
    @override_settings(MAX_PREVIEW_PAGES=10)
    def test_task_does_not_update_document_when_stale_version_exceeds_page_limit(
        self, mock_fs_download, mock_requests_get, mock_convert, mock_pdfinfo, user
    ):
        document = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="versioned-large.pdf",
            status='ready',
            storage_key="path/to/current.pdf",
            num_pages=7,
            status_message="Current version is ready.",
        )
        stale_version = DocumentVersion.objects.create(
            document=document,
            version_number=1,
            original_storage_key="path/to/stale.pdf",
            storage_key="path/to/stale.pdf",
            is_primary=False,
            render_status=DocumentVersion.RENDER_PROCESSING,
        )
        current_version = DocumentVersion.objects.create(
            document=document,
            version_number=2,
            original_storage_key="path/to/current.pdf",
            storage_key="path/to/current.pdf",
            is_primary=True,
            num_pages=7,
        )

        mock_fs_download.return_value = "/files/download/token"
        mock_get_response = MagicMock()
        mock_get_response.raise_for_status.return_value = None
        mock_get_response.content = b"large-pdf-content"
        mock_requests_get.return_value = mock_get_response
        mock_pdfinfo.return_value = {'Pages': 11}

        generate_pdf_pages_task(stale_version.id)

        document.refresh_from_db()
        stale_version.refresh_from_db()
        current_version.refresh_from_db()

        mock_convert.assert_not_called()
        assert stale_version.is_primary is False
        assert stale_version.num_pages == 11
        assert stale_version.render_status == DocumentVersion.RENDER_FAILED
        assert current_version.is_primary is True
        assert document.storage_key == "path/to/current.pdf"
        assert document.num_pages == 7
        assert document.status_message == "Current version is ready."

    @patch('documents.tasks.pdfinfo_from_bytes')
    @patch('documents.tasks.requests.put')
    @patch('documents.tasks.fileserver_client.generate_upload_url')
    @patch('documents.tasks.requests.get')
    @patch('documents.tasks.fileserver_client.generate_download_url')
    @patch('documents.tasks.convert_from_bytes')
    @patch('documents.tasks.PdfReader')
    def test_task_extracts_links_successfully(
        self,
        mock_pdf_reader_class,
        mock_convert,
        mock_fs_download_url,
        mock_requests_get,
        mock_fs_upload_url,
        mock_requests_put,
        mock_pdfinfo,
        user,
    ):
        """Test that generate_pdf_pages_task extracts links from PDF annotations and stores them."""
        document = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="test_links.pdf",
            status='processing',
        )
        version = DocumentVersion.objects.create(
            document=document,
            version_number=1,
            original_storage_key="path/to/original.pdf",
            storage_key="path/to/original.pdf",
            is_primary=True,
        )

        # 1. Mock Poppler conversion (1 page)
        mock_images = [MagicMock()]
        mock_images[0].save.side_effect = lambda buf, format: buf.write(b'img1')
        mock_convert.return_value = mock_images
        mock_pdfinfo.return_value = {'Pages': 1}

        # 2. Mock pypdf PdfReader
        mock_reader = MagicMock()
        mock_pdf_reader_class.return_value = mock_reader

        class MockPdfObject(dict):
            def get_object(self):
                return self

        class MockPage(dict):
            def __init__(self, width, height, annots):
                super().__init__()
                self.mediabox = MagicMock()
                self.mediabox.width = width
                self.mediabox.height = height
                if annots:
                    self["/Annots"] = annots

        # Mock Annotation structure
        action = MockPdfObject({
            "/S": "/URI",
            "/URI": "https://example.com/target"
        })
        
        obj = MockPdfObject({
            "/Subtype": "/Link",
            "/A": action,
            "/Rect": [120.0, 120.0, 60.0, 80.0]  # Reversed coordinates (x1 > x2, y1 > y2) to test normalization
        })
        
        annot = MockPdfObject()
        annot.get_object = lambda: obj

        # Create the mock page
        mock_page = MockPage(600, 800, [annot])
        mock_reader.pages = [mock_page]

        # Configure network mocks
        mock_fs_download_url.return_value = "/files/download/token"
        mock_get_response = MagicMock()
        mock_get_response.raise_for_status.return_value = None
        mock_get_response.content = b"fake-pdf"
        mock_requests_get.return_value = mock_get_response
        mock_fs_upload_url.return_value = "/upload/page1"
        mock_requests_put.return_value = MagicMock()

        # Run task
        generate_pdf_pages_task(version.id)

        # Assert DocumentPage was created and has correct page_links mapping
        assert DocumentPage.objects.filter(document_version=version, page_number=1).exists()
        page = DocumentPage.objects.get(document_version=version, page_number=1)
        
        expected_links = {
            "links": [
                {
                    "url": "https://example.com/target",
                    "bbox": {
                        "left": (60.0 / 600.0) * 100,  # 10.0%
                        "top": ((800.0 - 120.0) / 800.0) * 100,  # 85.0%
                        "width": ((120.0 - 60.0) / 600.0) * 100,  # 10.0%
                        "height": ((120.0 - 80.0) / 800.0) * 100  # 5.0%
                    }
                }
            ]
        }
        assert page.page_links == expected_links

    @patch('documents.tasks.pdfinfo_from_bytes')
    @patch('documents.tasks.requests.put')
    @patch('documents.tasks.fileserver_client.generate_upload_url')
    @patch('documents.tasks.requests.get')
    @patch('documents.tasks.fileserver_client.generate_download_url')
    @patch('documents.tasks.convert_from_bytes')
    @patch('documents.tasks.PdfReader')
    def test_task_extracts_links_with_indirect_objects(
        self,
        mock_pdf_reader_class,
        mock_convert,
        mock_fs_download_url,
        mock_requests_get,
        mock_fs_upload_url,
        mock_requests_put,
        mock_pdfinfo,
        user,
    ):
        """Test that generate_pdf_pages_task resolves nested indirect objects and byte strings in PDF annotations."""
        document = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="test_indirect_links.pdf",
            status='processing',
        )
        version = DocumentVersion.objects.create(
            document=document,
            version_number=1,
            original_storage_key="path/to/original.pdf",
            storage_key="path/to/original.pdf",
            is_primary=True,
        )

        mock_images = [MagicMock()]
        mock_images[0].save.side_effect = lambda buf, format: buf.write(b'img1')
        mock_convert.return_value = mock_images
        mock_pdfinfo.return_value = {'Pages': 1}

        mock_reader = MagicMock()
        mock_pdf_reader_class.return_value = mock_reader

        class MockPdfObject(dict):
            def get_object(self):
                return self

        # Mock nested indirect objects
        class MockIndirectObject:
            def __init__(self, target):
                self.target = target
            def get_object(self):
                return self.target

        class MockPage(dict):
            def __init__(self, width, height, annots):
                super().__init__()
                self.mediabox = MagicMock()
                self.mediabox.width = width
                self.mediabox.height = height
                if annots:
                    self["/Annots"] = annots

        # The URI is a byte string inside an indirect object
        uri_bytes_indirect = MockIndirectObject(b"https://example.com/indirect-target")
        action = MockPdfObject({
            "/S": "/URI",
            "/URI": uri_bytes_indirect
        })
        
        # Coordinates are indirect objects
        rect = [
            MockIndirectObject(120.0),
            MockIndirectObject(120.0),
            MockIndirectObject(60.0),
            MockIndirectObject(80.0)
        ]

        obj = MockPdfObject({
            "/Subtype": "/Link",
            "/A": action,
            "/Rect": rect
        })
        
        annot = MockIndirectObject(obj)

        mock_page = MockPage(600, 800, [annot])
        mock_reader.pages = [mock_page]

        mock_fs_download_url.return_value = "/files/download/token"
        mock_get_response = MagicMock()
        mock_get_response.raise_for_status.return_value = None
        mock_get_response.content = b"fake-pdf"
        mock_requests_get.return_value = mock_get_response
        mock_fs_upload_url.return_value = "/upload/page1"
        mock_requests_put.return_value = MagicMock()

        # Run task - this must execute without raising TypeError
        generate_pdf_pages_task(version.id)

        # Assert page was created with resolved links
        page = DocumentPage.objects.get(document_version=version, page_number=1)
        expected_links = {
            "links": [
                {
                    "url": "https://example.com/indirect-target",
                    "bbox": {
                        "left": (60.0 / 600.0) * 100,
                        "top": ((800.0 - 120.0) / 800.0) * 100,
                        "width": ((120.0 - 60.0) / 600.0) * 100,
                        "height": ((120.0 - 80.0) / 800.0) * 100
                    }
                }
            ]
        }
        assert page.page_links == expected_links

@pytest.mark.django_db
class TestGenerateVideoStreamTask:
    @patch('documents.tasks.subprocess.run')
    @patch('documents.tasks.requests.put')
    @patch('documents.tasks.fileserver_client.generate_upload_url')
    @patch('documents.tasks.requests.get')
    @patch('documents.tasks.fileserver_client.generate_download_url')
    @patch('documents.tasks.tempfile.TemporaryDirectory')
    def test_video_transcoding_task(
        self,
        mock_temp_dir,
        mock_fs_download_url,
        mock_requests_get,
        mock_fs_upload_url,
        mock_requests_put,
        mock_subprocess,
        user
    ):
        document = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="test.mp4",
            type="video",
            status='processing',
        )
        version = DocumentVersion.objects.create(
            document=document,
            version_number=1,
            original_storage_key="path/to/original.mp4",
            storage_key="path/to/original.mp4",
            is_primary=True,
            type="video",
        )

        mock_fs_download_url.return_value = "/files/download/token"
        mock_get_response = MagicMock()
        mock_get_response.raise_for_status.return_value = None
        mock_get_response.iter_content.return_value = [b"chunk1", b"chunk2"]
        mock_requests_get.return_value = mock_get_response

        # Mock ffprobe and ffmpeg calls
        mock_probe_duration = MagicMock()
        mock_probe_duration.stdout = "120.5\n"
        mock_probe_vcodec = MagicMock()
        mock_probe_vcodec.stdout = "h264\n"
        mock_probe_acodec = MagicMock()
        mock_probe_acodec.stdout = "aac\n"

        mock_subprocess.side_effect = [
            mock_probe_duration,  # Duration probe
            mock_probe_vcodec,    # Video codec probe
            mock_probe_acodec,    # Audio codec probe
            MagicMock(),          # ffmpeg run
        ]

        mock_fs_upload_url.return_value = "/upload/hls-file"
        mock_requests_put.return_value = MagicMock()

        # Create a real temp directory for the test duration
        real_dir = real_tempfile.mkdtemp()
        real_dir_path = Path(real_dir)

        # Setup mock context manager for TemporaryDirectory
        mock_context = MagicMock()
        mock_context.__enter__.return_value = real_dir
        mock_temp_dir.return_value = mock_context

        # Write dummy files to the temp directory so the task finds and uploads them
        playlist_file = real_dir_path / "playlist.m3u8"
        playlist_file.write_text("#EXTM3U\n")
        chunk_file = real_dir_path / "playlist0.ts"
        chunk_file.write_bytes(b"ts-chunk")

        try:
            # Run task
            generate_video_stream_task(version.id)
        finally:
            shutil.rmtree(real_dir)

        # Assert document status and fields updated
        document.refresh_from_db()
        version.refresh_from_db()

        assert document.status == 'ready'
        assert version.render_status == DocumentVersion.RENDER_READY
        assert version.length == 120
        assert version.storage_key == "path/to/original_hls/playlist.m3u8"


def test_normalize_content_type():
    # Generic or empty types should be guessed from filename
    assert _normalize_content_type('', 'video.mov') == 'video/quicktime'
    assert _normalize_content_type('application/octet-stream', 'movie.mp4') == 'video/mp4'
    # Existing valid types should be preserved
    assert _normalize_content_type('video/mp4', 'movie.mov') == 'video/mp4'
    assert _normalize_content_type('application/pdf', 'doc.pdf') == 'application/pdf'


def test_resolve_pdf_object_circular_reference():
    class MockCircularObject:
        def __init__(self, name):
            self.name = name
            self.next_obj = None

        def get_object(self):
            return self.next_obj

    # Create two objects pointing to each other
    obj_a = MockCircularObject("A")
    obj_b = MockCircularObject("B")
    obj_a.next_obj = obj_b
    obj_b.next_obj = obj_a

    # Resolving obj_a should break cycle and return safely
    result = _resolve_pdf_object(obj_a)
    assert result in (obj_a, obj_b)


