import os
from typing import Optional

from django.conf import settings

from core import services as core_services
from documents.models import Document, DocumentVersion
from .base import BasePreviewRenderer
from .constants import VIDEO_EXTENSIONS, VIDEO_MIMETYPES
from .utils import normalize_content_type


class VideoRenderer(BasePreviewRenderer):
    """
    Renderer for video files (MP4, MOV, AVI, etc.).
    Uses FFmpeg to produce an HLS video stream rather than static image pages.
    """

    can_reuse_page_url_for_download: bool = False

    @classmethod
    def can_handle_file(cls, content_type: str, filename: str) -> bool:
        norm_type = normalize_content_type(content_type, filename)
        if norm_type in VIDEO_MIMETYPES:
            return True
        if filename:
            ext = os.path.splitext(filename)[1].lower()
            if ext in VIDEO_EXTENSIONS:
                return True
        return False

    @classmethod
    def can_handle_version(cls, version: DocumentVersion) -> bool:
        filename = version.document.name if version.document else ''
        storage_key = version.original_storage_key or version.storage_key or ''
        norm_type = normalize_content_type(version.content_type, filename)
        if norm_type in VIDEO_MIMETYPES:
            return True
        if filename and os.path.splitext(filename)[1].lower() in VIDEO_EXTENSIONS:
            return True
        if storage_key and os.path.splitext(storage_key)[1].lower() in VIDEO_EXTENSIONS:
            return True
        if version.type == 'video' or (version.document and version.document.type == 'video'):
            return True
        return False

    def initialize_metadata(
        self, document: Document, version: DocumentVersion, file_size: int, content_type: str
    ):
        norm_type = normalize_content_type(content_type, document.name)
        max_video_size_mb = core_services.get_dynamic_setting('MAX_VIDEO_PREVIEW_SIZE_MB')
        max_size_bytes = max_video_size_mb * 1024 * 1024
        is_too_large = file_size > max_size_bytes
        is_previewable = getattr(settings, 'ENABLE_VIDEO_PREVIEW', False) and not is_too_large

        document.download_only = not is_previewable
        document.type = 'video'
        document.content_type = norm_type
        document.file_size = file_size
        document.status_message = ''
        document.status = 'ready'

        version.type = 'video'
        version.has_pages = False
        version.render_error = ''
        if is_previewable:
            version.render_status = DocumentVersion.RENDER_NOT_GENERATED
        else:
            version.render_status = DocumentVersion.RENDER_NOT_APPLICABLE
        version.save()
        document.save()

    def is_dynamically_previewable(self, version: DocumentVersion) -> bool:
        if not getattr(settings, 'ENABLE_VIDEO_PREVIEW', False):
            return False
        doc = version.document
        if doc and doc.is_download_only:
            return False
        max_video_size = core_services.get_dynamic_setting('MAX_VIDEO_PREVIEW_SIZE_MB')
        file_size = version.file_size or (doc.file_size if doc else 0)
        if file_size and file_size > (max_video_size * 1024 * 1024):
            return False
        return True

    def get_preview_mode(self, version: DocumentVersion) -> str:
        if not getattr(settings, 'ENABLE_VIDEO_PREVIEW', False):
            return 'download_only'
        doc = version.document
        if doc and doc.is_download_only:
            return 'download_only'
        max_video_size = core_services.get_dynamic_setting('MAX_VIDEO_PREVIEW_SIZE_MB')
        file_size = version.file_size or (doc.file_size if doc else 0)
        if file_size and file_size > (max_video_size * 1024 * 1024):
            return 'download_only'
        return 'video'

    def should_serve_pages(self, version: DocumentVersion, render_status: str) -> bool:
        return False

    def get_page_storage_key(self, version: DocumentVersion, page_number: int) -> Optional[str]:
        return None

    def get_preview_pages_data(
        self,
        document: Document,
        version: DocumentVersion,
        share_link=None,
        dataroom_document_id=None,
        enable_watermark_override=None,
    ) -> list:
        return []

    def _dispatch_task(self, version: DocumentVersion):
        from documents.tasks import generate_video_stream_task
        generate_video_stream_task.delay(version.id)
