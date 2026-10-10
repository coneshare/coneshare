import os
from typing import Optional

from core import services as core_services
from documents.models import Document, DocumentVersion
from .base import BasePreviewRenderer
from .constants import MARKDOWN_EXTENSIONS, MARKDOWN_MIMETYPES
from .utils import normalize_content_type


class MarkdownRenderer(BasePreviewRenderer):
    """
    Renderer for Markdown files (.md, .markdown).
    Directly served to client for instant client-side rendering without Celery tasks.
    """

    can_reuse_page_url_for_download: bool = False

    @classmethod
    def can_handle_file(cls, content_type: str, filename: str) -> bool:
        norm_type = normalize_content_type(content_type, filename)
        if norm_type in MARKDOWN_MIMETYPES:
            return True
        if filename:
            ext = os.path.splitext(filename)[1].lower()
            if ext in MARKDOWN_EXTENSIONS:
                return True
        return False

    @classmethod
    def can_handle_version(cls, version: DocumentVersion) -> bool:
        filename = version.document.name if version.document else ''
        storage_key = version.original_storage_key or version.storage_key or ''
        norm_type = normalize_content_type(version.content_type, filename)
        if norm_type in MARKDOWN_MIMETYPES:
            return True
        if filename and os.path.splitext(filename)[1].lower() in MARKDOWN_EXTENSIONS:
            return True
        if storage_key and os.path.splitext(storage_key)[1].lower() in MARKDOWN_EXTENSIONS:
            return True
        if version.type == 'markdown' or (version.document and version.document.type == 'markdown'):
            return True
        return False

    def initialize_metadata(
        self, document: Document, version: DocumentVersion, file_size: int, content_type: str
    ):
        norm_type = normalize_content_type(content_type, document.name)
        max_preview_size_mb = core_services.get_dynamic_setting('MAX_PREVIEW_FILE_SIZE_MB')
        is_too_large = file_size > (max_preview_size_mb * 1024 * 1024)

        document.download_only = is_too_large
        document.type = 'markdown'
        document.content_type = norm_type or 'text/markdown'
        document.file_size = file_size
        document.status_message = ''
        document.status = 'ready'
        document.num_pages = 1

        version.type = 'markdown'
        version.num_pages = 1
        version.has_pages = False
        version.render_error = ''
        # Client-side render: ready immediately upon upload if within size limits
        version.render_status = (
            DocumentVersion.RENDER_READY if not is_too_large else DocumentVersion.RENDER_NOT_APPLICABLE
        )
        version.save()
        document.save()

    def is_dynamically_previewable(self, version: DocumentVersion) -> bool:
        doc = version.document
        if doc and doc.is_download_only:
            return False
        max_preview_size = core_services.get_dynamic_setting('MAX_PREVIEW_FILE_SIZE_MB')
        file_size = version.file_size or (doc.file_size if doc else 0)
        return not bool(file_size and file_size > (max_preview_size * 1024 * 1024))

    def get_preview_mode(self, version: DocumentVersion) -> str:
        if not self.is_dynamically_previewable(version):
            return 'download_only'
        return 'markdown'

    def enqueue_render_task(self, version: DocumentVersion) -> str:
        """
        Synchronous client-side renderer: short-circuit immediately.
        Avoids scheduling no-op Celery tasks and prevents stuck RENDER_QUEUED states.
        """
        if self.is_dynamically_previewable(version):
            if version.render_status != DocumentVersion.RENDER_READY:
                DocumentVersion.objects.filter(pk=version.pk).update(render_status=DocumentVersion.RENDER_READY)
                version.render_status = DocumentVersion.RENDER_READY
            return DocumentVersion.RENDER_READY
        else:
            if version.render_status != DocumentVersion.RENDER_NOT_APPLICABLE:
                DocumentVersion.objects.filter(pk=version.pk).update(render_status=DocumentVersion.RENDER_NOT_APPLICABLE)
                version.render_status = DocumentVersion.RENDER_NOT_APPLICABLE
            return DocumentVersion.RENDER_NOT_APPLICABLE

    def should_serve_pages(self, version: DocumentVersion, render_status: str) -> bool:
        return False

    def get_page_storage_key(self, version: DocumentVersion, page_number: int) -> Optional[str]:
        return None
