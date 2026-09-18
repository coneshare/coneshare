from typing import Optional

from documents.models import Document, DocumentVersion
from .base import BasePreviewRenderer


class GenericFileRenderer(BasePreviewRenderer):
    """
    Fallback renderer for unrenderable, download-only file formats
    (e.g. archives, executables, SVGs).
    """

    @classmethod
    def can_handle_file(cls, content_type: str, filename: str) -> bool:
        return True

    @classmethod
    def can_handle_version(cls, version: DocumentVersion) -> bool:
        return True

    def initialize_metadata(
        self, document: Document, version: DocumentVersion, file_size: int, content_type: str
    ):
        document.download_only = True
        document.type = 'file'
        document.content_type = content_type
        document.file_size = file_size
        document.status = 'ready'
        document.status_message = ''

        version.type = 'file'
        version.has_pages = False
        version.render_status = DocumentVersion.RENDER_NOT_APPLICABLE
        version.render_error = ''
        version.save()
        document.save()

    def is_dynamically_previewable(self, version: DocumentVersion) -> bool:
        return False

    def get_preview_mode(self, version: DocumentVersion) -> str:
        return 'download_only'

    def should_serve_pages(self, version: DocumentVersion, render_status: str) -> bool:
        return False

    def get_page_storage_key(self, version: DocumentVersion, page_number: int) -> Optional[str]:
        return None

    def enqueue_render_task(self, version: DocumentVersion) -> str:
        """Generic files are download-only and never render pages."""
        return DocumentVersion.RENDER_NOT_APPLICABLE
