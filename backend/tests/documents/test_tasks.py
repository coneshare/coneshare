import json
import tempfile as real_tempfile
import shutil
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
from django.conf import settings
from django.test import override_settings

from django.core.management import call_command

from documents.models import Document, DocumentVersion, DocumentPage
from documents.pdf_utils import extract_text_layout_for_pdf
from documents.renderers import normalize_content_type
from documents.tasks import (
    generate_pdf_pages_task,
    generate_video_stream_task,
    _resolve_pdf_object,
)
from documents.views import prepare_pages_data


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
        mock_probe_vcodec.stdout = json.dumps({
            "streams": [{
                "codec_name": "h264",
                "width": 1920,
                "height": 1080,
                "pix_fmt": "yuv420p"
            }]
        })
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

        # Assert ffmpeg command uses stream copying for both streams
        ffmpeg_cmd = mock_subprocess.call_args_list[3][0][0]
        assert "-vcodec" in ffmpeg_cmd and ffmpeg_cmd[ffmpeg_cmd.index("-vcodec") + 1] == "copy"
        assert "-acodec" in ffmpeg_cmd and ffmpeg_cmd[ffmpeg_cmd.index("-acodec") + 1] == "copy"
        assert "-threads" in ffmpeg_cmd

    @patch('documents.tasks.subprocess.run')
    @patch('documents.tasks.requests.put')
    @patch('documents.tasks.fileserver_client.generate_upload_url')
    @patch('documents.tasks.requests.get')
    @patch('documents.tasks.fileserver_client.generate_download_url')
    @patch('documents.tasks.tempfile.TemporaryDirectory')
    def test_video_transcoding_non_h264_optimization(
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
            name="clip.mov",
            type="video",
            status='processing',
        )
        version = DocumentVersion.objects.create(
            document=document,
            version_number=1,
            original_storage_key="path/to/clip.mov",
            storage_key="path/to/clip.mov",
            is_primary=True,
            type="video",
        )

        mock_fs_download_url.return_value = "/files/download/token"
        mock_get_response = MagicMock()
        mock_get_response.raise_for_status.return_value = None
        mock_get_response.iter_content.return_value = [b"chunk1"]
        mock_requests_get.return_value = mock_get_response

        # Mock ffprobe and ffmpeg calls: HEVC video, AAC audio
        mock_probe_duration = MagicMock()
        mock_probe_duration.stdout = "30.0\n"
        mock_probe_vcodec = MagicMock()
        mock_probe_vcodec.stdout = json.dumps({
            "streams": [{
                "codec_name": "hevc",
                "width": 2560,
                "height": 1440,
                "pix_fmt": "yuv420p10le"
            }]
        })
        mock_probe_acodec = MagicMock()
        mock_probe_acodec.stdout = "aac\n"
        mock_ffmpeg_run = MagicMock()

        mock_subprocess.side_effect = [
            mock_probe_duration,
            mock_probe_vcodec,
            mock_probe_acodec,
            mock_ffmpeg_run,
        ]

        mock_fs_upload_url.return_value = "/upload/hls-file"
        mock_requests_put.return_value = MagicMock()

        real_dir = real_tempfile.mkdtemp()
        real_dir_path = Path(real_dir)
        mock_context = MagicMock()
        mock_context.__enter__.return_value = real_dir
        mock_temp_dir.return_value = mock_context

        (real_dir_path / "playlist.m3u8").write_text("#EXTM3U\n")
        (real_dir_path / "playlist0.ts").write_bytes(b"ts-chunk")

        try:
            generate_video_stream_task(version.id)
        finally:
            shutil.rmtree(real_dir)

        # Inspect the ffmpeg command executed
        assert mock_subprocess.call_count == 4
        ffmpeg_cmd = mock_subprocess.call_args_list[3][0][0]

        # Verify performance & compatibility optimizations are applied
        i_idx = ffmpeg_cmd.index("-i")

        # Global filtergraph threads
        assert "-filter_threads" in ffmpeg_cmd
        ft_idx = ffmpeg_cmd.index("-filter_threads")
        assert ft_idx < i_idx
        assert ffmpeg_cmd[ft_idx + 1] == str(settings.VIDEO_TRANSCODE_THREADS)

        # Pre-input decoder threads and post-input encoder threads
        assert ffmpeg_cmd.count("-threads") == 2
        pre_threads_idx = ffmpeg_cmd.index("-threads")
        assert pre_threads_idx < i_idx
        assert ffmpeg_cmd[pre_threads_idx + 1] == str(settings.VIDEO_TRANSCODE_THREADS)

        post_threads_idx = ffmpeg_cmd.index("-threads", i_idx)
        assert ffmpeg_cmd[post_threads_idx + 1] == str(settings.VIDEO_TRANSCODE_THREADS)

        assert "-preset" in ffmpeg_cmd
        preset_idx = ffmpeg_cmd.index("-preset")
        assert ffmpeg_cmd[preset_idx + 1] == settings.VIDEO_TRANSCODE_PRESET

        assert "-pix_fmt" in ffmpeg_cmd
        pix_fmt_idx = ffmpeg_cmd.index("-pix_fmt")
        assert ffmpeg_cmd[pix_fmt_idx + 1] == "yuv420p"

        assert "-vf" in ffmpeg_cmd

        # When audio is already AAC, it should be copied rather than re-encoded
        acodec_idx = ffmpeg_cmd.index("-acodec")
        assert ffmpeg_cmd[acodec_idx + 1] == "copy"

    @patch('documents.tasks.subprocess.run')
    @patch('documents.tasks.requests.put')
    @patch('documents.tasks.fileserver_client.generate_upload_url')
    @patch('documents.tasks.requests.get')
    @patch('documents.tasks.fileserver_client.generate_download_url')
    @patch('documents.tasks.tempfile.TemporaryDirectory')
    def test_video_transcoding_h264_exceeds_bounds_transcodes(
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
            name="4k_h264.mp4",
            type="video",
            status='processing',
        )
        version = DocumentVersion.objects.create(
            document=document,
            version_number=1,
            original_storage_key="path/to/4k_h264.mp4",
            storage_key="path/to/4k_h264.mp4",
            is_primary=True,
            type="video",
        )

        mock_fs_download_url.return_value = "/files/download/token"
        mock_get_response = MagicMock()
        mock_get_response.raise_for_status.return_value = None
        mock_get_response.iter_content.return_value = [b"chunk1"]
        mock_requests_get.return_value = mock_get_response

        # Mock ffprobe: 4K H.264 video (3840x2160), exceeds MAX_WIDTH (1920)
        mock_probe_duration = MagicMock()
        mock_probe_duration.stdout = "60.0\n"

        mock_probe_vcodec = MagicMock()
        mock_probe_vcodec.stdout = json.dumps({
            "streams": [{
                "codec_name": "h264",
                "width": 3840,
                "height": 2160,
                "pix_fmt": "yuv420p"
            }]
        })

        mock_probe_acodec = MagicMock()
        mock_probe_acodec.stdout = "aac\n"
        mock_ffmpeg_run = MagicMock()

        mock_subprocess.side_effect = [
            mock_probe_duration,
            mock_probe_vcodec,
            mock_probe_acodec,
            mock_ffmpeg_run,
        ]

        mock_fs_upload_url.return_value = "/upload/hls-file"
        mock_requests_put.return_value = MagicMock()

        real_dir = real_tempfile.mkdtemp()
        real_dir_path = Path(real_dir)
        mock_context = MagicMock()
        mock_context.__enter__.return_value = real_dir
        mock_temp_dir.return_value = mock_context

        (real_dir_path / "playlist.m3u8").write_text("#EXTM3U\n")
        (real_dir_path / "playlist0.ts").write_bytes(b"ts-chunk")

        try:
            generate_video_stream_task(version.id)
        finally:
            shutil.rmtree(real_dir)

        # Inspect the ffprobe and ffmpeg commands executed
        assert mock_subprocess.call_count == 4
        v_probe_cmd = mock_subprocess.call_args_list[1][0][0]
        assert any("width" in arg for arg in v_probe_cmd)
        assert any("pix_fmt" in arg for arg in v_probe_cmd)

        ffmpeg_cmd = mock_subprocess.call_args_list[3][0][0]

        # 4K H.264 must NOT be stream copied; it must be transcoded with downscale filter
        assert "-vcodec" in ffmpeg_cmd
        vcodec_idx = ffmpeg_cmd.index("-vcodec")
        assert ffmpeg_cmd[vcodec_idx + 1] == "libx264"
        assert "-vf" in ffmpeg_cmd
        assert "-pix_fmt" in ffmpeg_cmd
        assert ffmpeg_cmd[ffmpeg_cmd.index("-pix_fmt") + 1] == "yuv420p"

    @patch('documents.tasks.subprocess.run')
    @patch('documents.tasks.requests.put')
    @patch('documents.tasks.fileserver_client.generate_upload_url')
    @patch('documents.tasks.requests.get')
    @patch('documents.tasks.fileserver_client.generate_download_url')
    @patch('documents.tasks.tempfile.TemporaryDirectory')
    def test_video_transcoding_h264_non_yuv420p_transcodes(
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
            name="10bit_h264.mp4",
            type="video",
            status='processing',
        )
        version = DocumentVersion.objects.create(
            document=document,
            version_number=1,
            original_storage_key="path/to/10bit_h264.mp4",
            storage_key="path/to/10bit_h264.mp4",
            is_primary=True,
            type="video",
        )

        mock_fs_download_url.return_value = "/files/download/token"
        mock_get_response = MagicMock()
        mock_get_response.raise_for_status.return_value = None
        mock_get_response.iter_content.return_value = [b"chunk1"]
        mock_requests_get.return_value = mock_get_response

        # Mock ffprobe: 1080p H.264 video with 10-bit High 10 profile (yuv420p10le)
        mock_probe_duration = MagicMock()
        mock_probe_duration.stdout = "60.0\n"

        mock_probe_vcodec = MagicMock()
        mock_probe_vcodec.stdout = json.dumps({
            "streams": [{
                "codec_name": "h264",
                "width": 1920,
                "height": 1080,
                "pix_fmt": "yuv420p10le"
            }]
        })

        mock_probe_acodec = MagicMock()
        mock_probe_acodec.stdout = "aac\n"
        mock_ffmpeg_run = MagicMock()

        mock_subprocess.side_effect = [
            mock_probe_duration,
            mock_probe_vcodec,
            mock_probe_acodec,
            mock_ffmpeg_run,
        ]

        mock_fs_upload_url.return_value = "/upload/hls-file"
        mock_requests_put.return_value = MagicMock()

        real_dir = real_tempfile.mkdtemp()
        real_dir_path = Path(real_dir)
        mock_context = MagicMock()
        mock_context.__enter__.return_value = real_dir
        mock_temp_dir.return_value = mock_context

        (real_dir_path / "playlist.m3u8").write_text("#EXTM3U\n")
        (real_dir_path / "playlist0.ts").write_bytes(b"ts-chunk")

        try:
            generate_video_stream_task(version.id)
        finally:
            shutil.rmtree(real_dir)

        # Inspect the ffprobe and ffmpeg commands executed
        assert mock_subprocess.call_count == 4
        ffmpeg_cmd = mock_subprocess.call_args_list[3][0][0]

        # 10-bit H.264 must NOT be stream copied; it must be transcoded to 8-bit yuv420p
        assert "-vcodec" in ffmpeg_cmd
        vcodec_idx = ffmpeg_cmd.index("-vcodec")
        assert ffmpeg_cmd[vcodec_idx + 1] == "libx264"
        assert "-pix_fmt" in ffmpeg_cmd
        assert ffmpeg_cmd[ffmpeg_cmd.index("-pix_fmt") + 1] == "yuv420p"


def test_normalize_content_type():
    # Generic or empty types should be guessed from filename
    assert normalize_content_type('', 'video.mov') == 'video/quicktime'
    assert normalize_content_type('application/octet-stream', 'movie.mp4') == 'video/mp4'
    # Existing valid types should be preserved
    assert normalize_content_type('video/mp4', 'movie.mov') == 'video/mp4'
    assert normalize_content_type('application/pdf', 'doc.pdf') == 'application/pdf'


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


def test_extract_text_layout_for_pdf_valid_xml():
    sample_xml = b"""<?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head><title>test</title></head>
      <body>
        <doc>
          <page width="600.0" height="800.0">
            <flow>
              <block xMin="60.0" yMin="80.0" xMax="300.0" yMax="100.0">
                <line xMin="60.0" yMin="80.0" xMax="300.0" yMax="100.0">
                  <word xMin="60.0" yMin="80.0" xMax="120.0" yMax="100.0">Quarterly</word>
                  <word xMin="125.0" yMin="80.0" xMax="200.0" yMax="100.0">Revenue</word>
                  <word xMin="205.0" yMin="80.0" xMax="300.0" yMax="100.0">Summary</word>
                </line>
              </block>
            </flow>
          </page>
        </doc>
      </body>
    </html>
    """
    with patch("documents.pdf_utils._run_pdftotext") as mock_run:
        mock_run.return_value = sample_xml
        result = extract_text_layout_for_pdf(b"dummy_pdf_bytes")

    assert 1 in result
    lines = result[1]["lines"]
    assert len(lines) == 1
    assert lines[0]["text"] == "Quarterly Revenue Summary"
    assert lines[0]["bbox"]["left"] == 10.0  # 60 / 600 * 100
    assert lines[0]["bbox"]["top"] == 10.0   # 80 / 800 * 100
    assert lines[0]["bbox"]["width"] == 40.0 # (300 - 60) / 600 * 100
    assert lines[0]["bbox"]["height"] == 2.5 # (100 - 80) / 800 * 100
    assert lines[0]["font_size_pt"] == 20.0  # 100 - 80


def test_extract_text_layout_for_pdf_inverted_coordinates():
    sample_xml = b"""
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <doc>
          <page width="500.0" height="1000.0">
            <flow>
              <block>
                <line xMin="250.0" yMin="200.0" xMax="50.0" yMax="100.0">
                  <word>Inverted</word>
                  <word>Line</word>
                </line>
              </block>
            </flow>
          </page>
        </doc>
      </body>
    </html>
    """
    with patch("documents.pdf_utils._run_pdftotext") as mock_run:
        mock_run.return_value = sample_xml
        result = extract_text_layout_for_pdf(b"dummy_pdf_bytes")

    assert 1 in result
    line = result[1]["lines"][0]
    assert line["text"] == "Inverted Line"
    assert line["bbox"]["left"] == 10.0  # min(250, 50) / 500 * 100
    assert line["bbox"]["top"] == 10.0   # min(200, 100) / 1000 * 100
    assert line["bbox"]["width"] == 40.0 # (250 - 50) / 500 * 100
    assert line["bbox"]["height"] == 10.0 # (200 - 100) / 1000 * 100
    assert line["font_size_pt"] == 100.0


def test_extract_text_layout_for_pdf_error_handling():
    # Empty bytes
    assert extract_text_layout_for_pdf(b"") == {}

    # Subprocess/extraction error
    with patch("documents.pdf_utils._run_pdftotext", side_effect=Exception("poppler error")):
        assert extract_text_layout_for_pdf(b"bad_bytes") == {}

    # Corrupt XML
    with patch("documents.pdf_utils._run_pdftotext") as mock_run:
        mock_run.return_value = b"<malformed xml"
        assert extract_text_layout_for_pdf(b"bytes") == {}


def test_run_pdftotext_bounded_output():
    from documents.pdf_utils import _run_pdftotext

    mock_proc = MagicMock()
    mock_proc.poll.side_effect = [None, None, 0]
    mock_proc.returncode = 0

    def mock_popen(args, stdout, stderr, **kwargs):
        stdout.write(b"x" * 2000)
        stdout.flush()
        return mock_proc

    with patch("documents.pdf_utils.tempfile.NamedTemporaryFile"), \
         patch("documents.pdf_utils.subprocess.Popen", side_effect=mock_popen):
        # max_bytes = 1500; total will be 2000 -> exceeds threshold
        result = _run_pdftotext(b"dummy_pdf", max_bytes=1500)
        assert result == b""
        mock_proc.kill.assert_called_once()


def test_run_pdftotext_timeout():
    from documents.pdf_utils import _run_pdftotext

    mock_proc = MagicMock()
    mock_proc.poll.return_value = None

    with patch("documents.pdf_utils.tempfile.NamedTemporaryFile"), \
         patch("documents.pdf_utils.subprocess.Popen", return_value=mock_proc):
        result = _run_pdftotext(b"dummy_pdf", timeout=0.01)
        assert result == b""
        mock_proc.kill.assert_called_once()


@pytest.mark.django_db
def test_prepare_pages_data_watermark_suppression(user):
    document = Document.objects.create(
        organization=user.organization,
        created_by=user,
        name="test_text_watermark.pdf",
        status="ready",
    )
    version = DocumentVersion.objects.create(
        document=document,
        version_number=1,
        has_pages=True,
        render_status=DocumentVersion.RENDER_READY,
    )
    page = DocumentPage.objects.create(
        document_version=version,
        page_number=1,
        storage_key="test_page_1.png",
        metadata={
            "custom_meta": "keep_this",
            "text_content": {
                "lines": [
                    {
                        "text": "Confidential internal report",
                        "bbox": {"left": 10, "top": 10, "width": 80, "height": 5},
                        "font_size_pt": 12,
                    }
                ]
            },
        },
    )

    # 1. Non-watermarked preview: returns text_content and safe metadata
    pages_unwatermarked = prepare_pages_data(document, version, share_link=None)
    assert len(pages_unwatermarked) == 1
    assert pages_unwatermarked[0]["text_content"] == {
        "lines": [
            {
                "text": "Confidential internal report",
                "bbox": {"left": 10, "top": 10, "width": 80, "height": 5},
                "font_size_pt": 12,
            }
        ]
    }
    # safe_metadata does not leak text_content but preserves other metadata
    assert "text_content" not in pages_unwatermarked[0]["metadata"]
    assert pages_unwatermarked[0]["metadata"].get("custom_meta") == "keep_this"

    # 2. Watermarked share link: strictly suppresses text_content and strips from metadata
    mock_link = MagicMock()
    mock_link.enable_watermark = True
    mock_link.watermark_text = "CONFIDENTIAL"
    mock_link.slug = "secret-slug"
    mock_link.dataroom = None

    pages_watermarked = prepare_pages_data(document, version, share_link=mock_link)
    assert len(pages_watermarked) == 1
    assert pages_watermarked[0]["text_content"] == {"lines": []}
    assert "text_content" not in pages_watermarked[0]["metadata"]
    assert pages_watermarked[0]["metadata"].get("custom_meta") == "keep_this"


@pytest.mark.django_db
def test_backfill_page_text_management_command(user):
    document = Document.objects.create(
        organization=user.organization,
        created_by=user,
        name="test_backfill.pdf",
        status="ready",
    )
    version = DocumentVersion.objects.create(
        document=document,
        version_number=1,
        storage_key="docs/test_backfill.pdf",
        has_pages=True,
        render_status=DocumentVersion.RENDER_READY,
    )
    page = DocumentPage.objects.create(
        document_version=version,
        page_number=1,
        storage_key="docs/test_backfill_page_1.png",
        metadata={},
    )

    sample_lines = [
        {"text": "Backfilled Text", "bbox": {"left": 5, "top": 5, "width": 50, "height": 2}, "font_size_pt": 14}
    ]

    with patch("documents.management.commands.backfill_page_text.fileserver_client.generate_download_url") as mock_url, \
         patch("documents.management.commands.backfill_page_text.requests.get") as mock_get, \
         patch("documents.management.commands.backfill_page_text.extract_text_layout_for_pdf") as mock_extract:

        mock_url.return_value = "https://files.example.com/test_backfill.pdf"
        mock_resp = MagicMock()
        mock_resp.content = b"%PDF-dummy"
        mock_get.return_value = mock_resp
        mock_extract.return_value = {1: {"lines": sample_lines}}

        call_command("backfill_page_text", document_id=str(document.id))

    page.refresh_from_db()
    assert page.text_content == {"lines": sample_lines}


@pytest.mark.django_db
def test_backfill_page_text_does_not_overwrite_on_extraction_failure(user):
    document = Document.objects.create(
        organization=user.organization,
        created_by=user,
        name="test_existing.pdf",
        status="ready",
    )
    version = DocumentVersion.objects.create(
        document=document,
        version_number=1,
        storage_key="docs/test_existing.pdf",
        has_pages=True,
        render_status=DocumentVersion.RENDER_READY,
    )
    existing_lines = [{"text": "Original Valid Text", "bbox": {"left": 10, "top": 10, "width": 50, "height": 5}, "font_size_pt": 12}]
    page = DocumentPage.objects.create(
        document_version=version,
        page_number=1,
        storage_key="docs/test_existing_page_1.png",
        metadata={"text_content": {"lines": existing_lines}},
    )

    with patch("documents.management.commands.backfill_page_text.fileserver_client.generate_download_url") as mock_url, \
         patch("documents.management.commands.backfill_page_text.requests.get") as mock_get, \
         patch("documents.management.commands.backfill_page_text.extract_text_layout_for_pdf") as mock_extract:

        mock_url.return_value = "https://files.example.com/test_existing.pdf"
        mock_resp = MagicMock()
        mock_resp.content = b"%PDF-dummy"
        mock_get.return_value = mock_resp
        # Simulate extraction failure returning empty dict {}
        mock_extract.return_value = {}

        call_command("backfill_page_text", document_id=str(document.id), force=True)

    page.refresh_from_db()
    # Verifies original text was preserved and not overwritten with empty lines
    assert page.text_content == {"lines": existing_lines}


@pytest.mark.django_db
def test_backfill_page_text_without_arguments_shows_help():
    with patch("documents.management.commands.backfill_page_text.Command.print_help") as mock_help:
        call_command("backfill_page_text")
        mock_help.assert_called_once()


@pytest.mark.django_db
def test_backfill_page_text_all_flag(user):
    document = Document.objects.create(
        organization=user.organization,
        created_by=user,
        name="test_all.pdf",
        status="ready",
    )
    version = DocumentVersion.objects.create(
        document=document,
        version_number=1,
        storage_key="docs/test_all.pdf",
        has_pages=True,
        render_status=DocumentVersion.RENDER_READY,
    )
    page = DocumentPage.objects.create(
        document_version=version,
        page_number=1,
        storage_key="docs/test_all_page_1.png",
        metadata={},
    )
    sample_lines = [{"text": "All Docs Text", "bbox": {"left": 5, "top": 5, "width": 50, "height": 2}, "font_size_pt": 14}]

    with patch("documents.management.commands.backfill_page_text.fileserver_client.generate_download_url") as mock_url, \
         patch("documents.management.commands.backfill_page_text.requests.get") as mock_get, \
         patch("documents.management.commands.backfill_page_text.extract_text_layout_for_pdf") as mock_extract:

        mock_url.return_value = "https://files.example.com/test_all.pdf"
        mock_resp = MagicMock()
        mock_resp.content = b"%PDF-dummy"
        mock_get.return_value = mock_resp
        mock_extract.return_value = {1: {"lines": sample_lines}}

        call_command("backfill_page_text", all=True)

    page.refresh_from_db()
    assert page.text_content == {"lines": sample_lines}


@pytest.mark.django_db
def test_backfill_page_text_skips_blank_pages_when_already_processed(user):
    document = Document.objects.create(
        organization=user.organization,
        created_by=user,
        name="test_blank.pdf",
        status="ready",
    )
    version = DocumentVersion.objects.create(
        document=document,
        version_number=1,
        storage_key="docs/test_blank.pdf",
        has_pages=True,
        render_status=DocumentVersion.RENDER_READY,
    )
    # Page has empty lines but has been processed (contains "text_content")
    page = DocumentPage.objects.create(
        document_version=version,
        page_number=1,
        storage_key="docs/test_blank_page_1.png",
        metadata={"text_content": {"lines": []}},
    )

    with patch("documents.management.commands.backfill_page_text.requests.get") as mock_get:
        call_command("backfill_page_text", all=True)
        # Should be skipped without downloading PDF
        mock_get.assert_not_called()


@pytest.mark.django_db
def test_backfill_page_text_preserves_existing_text_without_force(user):
    document = Document.objects.create(
        organization=user.organization,
        created_by=user,
        name="test_preserve.pdf",
        status="ready",
    )
    version = DocumentVersion.objects.create(
        document=document,
        version_number=1,
        storage_key="docs/test_preserve.pdf",
        has_pages=True,
        render_status=DocumentVersion.RENDER_READY,
    )
    existing_lines = [{"text": "Keep Me", "bbox": {"left": 5, "top": 5, "width": 50, "height": 2}, "font_size_pt": 14}]
    page1 = DocumentPage.objects.create(
        document_version=version,
        page_number=1,
        storage_key="docs/test_preserve_page_1.png",
        metadata={"text_content": {"lines": existing_lines}},
    )
    page2 = DocumentPage.objects.create(
        document_version=version,
        page_number=2,
        storage_key="docs/test_preserve_page_2.png",
        metadata={},  # missing text_content
    )
    new_page2_lines = [{"text": "Page 2 Text", "bbox": {"left": 5, "top": 5, "width": 50, "height": 2}, "font_size_pt": 12}]

    with patch("documents.management.commands.backfill_page_text.fileserver_client.generate_download_url") as mock_url, \
         patch("documents.management.commands.backfill_page_text.requests.get") as mock_get, \
         patch("documents.management.commands.backfill_page_text.extract_text_layout_for_pdf") as mock_extract:

        mock_url.return_value = "https://files.example.com/test_preserve.pdf"
        mock_resp = MagicMock()
        mock_resp.content = b"%PDF-dummy"
        mock_get.return_value = mock_resp
        # Extraction returns empty lines for page 1, and text for page 2
        mock_extract.return_value = {1: {"lines": []}, 2: {"lines": new_page2_lines}}

        call_command("backfill_page_text", document_id=str(document.id))

    page1.refresh_from_db()
    page2.refresh_from_db()
    # Page 1 preserved its existing lines
    assert page1.text_content == {"lines": existing_lines}
    # Page 2 was backfilled
    assert page2.text_content == {"lines": new_page2_lines}





