import os
from typing import Optional

from core import services as core_services
from documents.models import Document, DocumentVersion
from .base import BasePreviewRenderer
from .constants import DIRECT_IMAGE_EXTENSIONS, DIRECT_IMAGE_MIMETYPES
from .utils import is_heic_file, normalize_content_type


class DirectImageRenderer(BasePreviewRenderer):
    """
    Renderer for standard web raster images (JPEG, PNG, GIF, WEBP).
    Directly served without server-side transcoding.
    SVG is intentionally excluded to prevent Stored XSS vectors.
    """

    can_reuse_page_url_for_download: bool = True

    @classmethod
    def can_handle_file(cls, content_type: str, filename: str) -> bool:
        norm_type = normalize_content_type(content_type, filename)
        if is_heic_file(norm_type, filename):
            return False
        if norm_type in DIRECT_IMAGE_MIMETYPES:
            return True
        if filename:
            ext = os.path.splitext(filename)[1].lower()
            if ext in DIRECT_IMAGE_EXTENSIONS:
                return True
        return False

    @classmethod
    def can_handle_version(cls, version: DocumentVersion) -> bool:
        filename = version.document.name if version.document else ''
        storage_key = version.original_storage_key or version.storage_key or ''
        norm_type = normalize_content_type(version.content_type, filename)
        if is_heic_file(norm_type, filename) or is_heic_file('', storage_key):
            return False
        if norm_type in DIRECT_IMAGE_MIMETYPES:
            return True
        if filename and os.path.splitext(filename)[1].lower() in DIRECT_IMAGE_EXTENSIONS:
            return True
        if storage_key and os.path.splitext(storage_key)[1].lower() in DIRECT_IMAGE_EXTENSIONS:
            return True
        if version.document and version.document.type == 'image':
            return True
        return False

    def initialize_metadata(
        self, document: Document, version: DocumentVersion, file_size: int, content_type: str
    ):
        norm_type = normalize_content_type(content_type, document.name)
        max_preview_size_mb = core_services.get_dynamic_setting('MAX_PREVIEW_FILE_SIZE_MB')
        is_too_large = file_size > (max_preview_size_mb * 1024 * 1024)

        document.download_only = is_too_large
        document.type = 'image'
        document.content_type = norm_type
        document.file_size = file_size
        document.status_message = ''
        document.status = 'ready'
        document.num_pages = 1

        version.type = 'image'
        version.num_pages = 1
        version.render_error = ''
        # Standard web images (JPEG, PNG, GIF, WEBP) require no background Celery
        # rendering tasks; the uploaded file serves directly as page 1.
        #
        # - If within limits (not is_too_large): has_pages is set to True immediately
        #   so viewer APIs can serve page 1 without waiting for background workers.
        # - If oversized (is_too_large): marked download_only and has_pages is set to False
        #   to prevent viewer APIs from generating page URLs and avoid heavy client/Pillow
        #   memory consumption.
        if is_too_large:
            version.has_pages = False
            version.render_status = DocumentVersion.RENDER_NOT_APPLICABLE
        else:
            version.has_pages = True
            version.render_status = DocumentVersion.RENDER_NOT_APPLICABLE
        version.save()
        document.save()

    def get_preview_mode(self, version: DocumentVersion) -> str:
        if version.document and version.document.is_download_only:
            return 'download_only'
        if not self.is_dynamically_previewable(version):
            return 'download_only'
        return 'image'

    def should_serve_pages(self, version: DocumentVersion, render_status: str) -> bool:
        if not version.has_pages:
            return False
        return render_status == DocumentVersion.RENDER_READY or self.get_preview_mode(version) == 'image'

    def get_page_storage_key(self, version: DocumentVersion, page_number: int) -> Optional[str]:
        if page_number == 1:
            page = version.pages.filter(page_number=1).first()
            return page.storage_key if page else (version.original_storage_key or version.storage_key)
        return None

    def get_preview_pages_data(
        self,
        document: Document,
        version: DocumentVersion,
        share_link=None,
        dataroom_document_id=None,
        enable_watermark_override=None,
    ) -> list:
        if not version.has_pages:
            return []

        page_obj = version.pages.filter(page_number=1).first()
        source_storage_key = page_obj.storage_key if page_obj else (version.original_storage_key or version.storage_key)
        page_metadata = page_obj.metadata if page_obj else {}

        watermark_enabled = (
            enable_watermark_override
            if enable_watermark_override is not None
            else (share_link.enable_watermark if share_link else False)
        )
        is_watermarked = bool(share_link and watermark_enabled and share_link.watermark_text)

        url = self._build_page_url(
            page_number=1,
            storage_key=source_storage_key,
            share_link=share_link,
            dataroom_document_id=dataroom_document_id,
            is_watermarked=is_watermarked,
            filename=document.name,
        )

        return [{
            'page_number': 1,
            'url': url,
            'metadata': page_metadata,
            'page_links': {'links': []},
        }]

    def enqueue_render_task(self, version: DocumentVersion) -> str:
        """
        Direct images are rendered by the client browser without Celery tasks.
        Short-circuit immediately to avoid corrupting DB render_status.
        """
        if version.has_pages:
            return DocumentVersion.RENDER_READY
        return DocumentVersion.RENDER_NOT_APPLICABLE
