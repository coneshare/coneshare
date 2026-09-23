import os
from typing import Optional

from core import services as core_services
from documents.models import Document, DocumentVersion
from .base import BasePreviewRenderer
from .constants import SPREADSHEET_EXTENSIONS, SPREADSHEET_MIMETYPES
from .utils import normalize_content_type


class SpreadsheetRenderer(BasePreviewRenderer):
    """
    Renderer for modern spreadsheet files (.xlsx, .csv).
    Parses workbook into a sanitized JSON preview payload and serves it to an
    interactive, multi-sheet client-side grid viewer.
    """

    can_reuse_page_url_for_download: bool = False

    @classmethod
    def can_handle_file(cls, content_type: str, filename: str) -> bool:
        norm_type = normalize_content_type(content_type, filename)
        if norm_type in SPREADSHEET_MIMETYPES:
            return True
        if filename:
            ext = os.path.splitext(filename)[1].lower()
            if ext in SPREADSHEET_EXTENSIONS:
                return True
        return False

    @classmethod
    def can_handle_version(cls, version: DocumentVersion) -> bool:
        # Zero-migration guard: If version already has rendered page images, let OfficeRenderer keep serving it
        if version.has_pages:
            return False

        if version.type == 'spreadsheet' or (version.document and version.document.type == 'spreadsheet'):
            return True

        filename = version.document.name if version.document else ''
        storage_key = version.original_storage_key or version.storage_key or ''
        norm_type = normalize_content_type(version.content_type, filename)
        if norm_type in SPREADSHEET_MIMETYPES:
            return True
        if filename and os.path.splitext(filename)[1].lower() in SPREADSHEET_EXTENSIONS:
            return True
        if storage_key and os.path.splitext(storage_key)[1].lower() in SPREADSHEET_EXTENSIONS:
            return True
        return False

    def initialize_metadata(
        self, document: Document, version: DocumentVersion, file_size: int, content_type: str
    ):
        norm_type = normalize_content_type(content_type, document.name)
        max_preview_size_mb = core_services.get_dynamic_setting('MAX_PREVIEW_FILE_SIZE_MB')
        is_too_large = file_size > (max_preview_size_mb * 1024 * 1024)

        document.download_only = is_too_large
        document.type = 'spreadsheet'
        document.content_type = norm_type
        document.file_size = file_size
        document.status_message = ''
        document.status = 'ready'

        version.type = 'spreadsheet'
        version.content_type = norm_type
        version.has_pages = False
        version.render_error = ''
        if is_too_large:
            version.render_status = DocumentVersion.RENDER_NOT_APPLICABLE
        else:
            version.render_status = DocumentVersion.RENDER_NOT_GENERATED
        version.save()
        document.save()

    def is_dynamically_previewable(self, version: DocumentVersion) -> bool:
        doc = version.document
        if not doc:
            return False
        max_preview_size = core_services.get_dynamic_setting('MAX_PREVIEW_FILE_SIZE_MB')
        file_size = version.file_size or (doc.file_size if doc else 0)
        if file_size and file_size > (max_preview_size * 1024 * 1024):
            return False
        return True

    def get_preview_mode(self, version: DocumentVersion) -> str:
        if not self.is_dynamically_previewable(version):
            return 'download_only'
        return 'spreadsheet'

    def _on_reset_to_previewable(self, version: DocumentVersion):
        doc = version.document
        if doc and doc.download_only:
            doc.download_only = False
            doc.save(update_fields=['download_only', 'updated_at'])

    def should_serve_pages(self, version: DocumentVersion, render_status: str) -> bool:
        return False

    def get_page_storage_key(self, version: DocumentVersion, page_number: int) -> Optional[str]:
        return None

    def _dispatch_task(self, version: DocumentVersion):
        from documents.tasks import generate_spreadsheet_preview_task
        generate_spreadsheet_preview_task.delay(version.id)

    def get_spreadsheet_preview_url(self, version: DocumentVersion) -> Optional[str]:
        if not version.storage_key:
            return None
        from documents.fileserver import fileserver_client
        return fileserver_client.generate_download_url(version.storage_key, is_internal=False)
