import os
from typing import Optional

from core import services as core_services
from documents.models import Document, DocumentVersion, DocumentPage
from .base import BasePreviewRenderer
from .utils import is_heic_file, normalize_content_type


class TranscodedImageRenderer(BasePreviewRenderer):
    """
    Renderer for images requiring server-side transcoding (HEIC/HEIF; future TIFF/RAW).
    Converts single-frame images to web-compatible JPEG preview pages asynchronously.
    """

    can_reuse_page_url_for_download: bool = False

    @classmethod
    def can_handle_file(cls, content_type: str, filename: str) -> bool:
        norm_type = normalize_content_type(content_type, filename)
        return is_heic_file(norm_type, filename)

    @classmethod
    def can_handle_version(cls, version: DocumentVersion) -> bool:
        filename = version.document.name if version.document else ''
        storage_key = version.original_storage_key or version.storage_key or ''
        norm_type = normalize_content_type(version.content_type, filename)
        return (
            is_heic_file(norm_type, filename)
            or is_heic_file('', storage_key)
        )

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
        version.has_pages = False
        version.render_error = ''
        if is_too_large:
            version.render_status = DocumentVersion.RENDER_NOT_APPLICABLE
        else:
            version.render_status = DocumentVersion.RENDER_NOT_GENERATED
        version.save()
        document.save()

    def get_preview_mode(self, version: DocumentVersion) -> str:
        if not self.is_dynamically_previewable(version):
            return 'download_only'
        return 'image'

    def should_serve_pages(self, version: DocumentVersion, render_status: str) -> bool:
        return render_status == DocumentVersion.RENDER_READY and version.has_pages

    def get_page_storage_key(self, version: DocumentVersion, page_number: int) -> Optional[str]:
        if page_number == 1:
            page = version.pages.filter(page_number=1).first()
            return page.storage_key if page else None
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
        source_storage_key = page_obj.storage_key if page_obj else version.original_storage_key
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

        safe_metadata = (
            {k: v for k, v in page_metadata.items() if k != 'text_content'}
            if isinstance(page_metadata, dict)
            else {}
        )
        return [{
            'page_number': 1,
            'url': url,
            'metadata': safe_metadata,
            'page_links': {'links': []},
            'text_content': {'lines': []},
        }]

    def _dispatch_task(self, version: DocumentVersion):
        from documents.tasks import transcode_heic_image_task
        transcode_heic_image_task.delay(str(version.id))

    def _on_reset_to_previewable(self, version: DocumentVersion):
        doc = version.document
        if doc:
            doc_update_fields = []
            if doc.download_only:
                doc.download_only = False
                doc_update_fields.append('download_only')
            if doc.type != 'image':
                doc.type = 'image'
                doc_update_fields.append('type')
            if doc_update_fields:
                doc_update_fields.append('updated_at')
                doc.save(update_fields=doc_update_fields)
