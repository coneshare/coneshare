import os
from typing import Optional

from django.conf import settings

from core import services as core_services
from documents.models import Document, DocumentVersion
from .base import BasePreviewRenderer
from .constants import PDF_EXTENSIONS, PDF_MIMETYPE, SPREADSHEET_EXTENSIONS
from .utils import normalize_content_type


class PDFRenderer(BasePreviewRenderer):
    """
    Renderer for PDF documents.
    Supports both client-side PDF.js rendering ('client_pdf') and server-side
    page image generation ('server_pages') via poppler.
    """

    can_reuse_page_url_for_download: bool = False

    @classmethod
    def can_handle_file(cls, content_type: str, filename: str) -> bool:
        norm_type = normalize_content_type(content_type, filename)
        if norm_type == PDF_MIMETYPE:
            return True
        if filename:
            ext = os.path.splitext(filename)[1].lower()
            if ext in PDF_EXTENSIONS:
                return True
        return False

    @classmethod
    def can_handle_version(cls, version: DocumentVersion) -> bool:
        # Exclude Office and Spreadsheet documents whose converted version may be PDF;
        # those are managed by OfficeRenderer and SpreadsheetRenderer.
        if version.document and version.document.type in {'document', 'spreadsheet'}:
            return False
        if version.type in {'document', 'spreadsheet'}:
            return False
        filename = version.document.name if version.document else ''
        storage_key = version.original_storage_key or version.storage_key or ''
        if (filename and os.path.splitext(filename)[1].lower() in SPREADSHEET_EXTENSIONS) or (
            storage_key and os.path.splitext(storage_key)[1].lower() in SPREADSHEET_EXTENSIONS
        ):
            return False
        norm_type = normalize_content_type(version.content_type, filename)
        if norm_type == PDF_MIMETYPE:
            return True
        if filename and os.path.splitext(filename)[1].lower() in PDF_EXTENSIONS:
            return True
        if storage_key and os.path.splitext(storage_key)[1].lower() in PDF_EXTENSIONS:
            return True
        if version.type == 'pdf' or (version.document and version.document.type == 'pdf'):
            return True
        return False

    def initialize_metadata(
        self, document: Document, version: DocumentVersion, file_size: int, content_type: str
    ):
        norm_type = normalize_content_type(content_type, document.name)
        max_preview_size_mb = core_services.get_dynamic_setting('MAX_PREVIEW_FILE_SIZE_MB')
        is_too_large = file_size > (max_preview_size_mb * 1024 * 1024)

        document.download_only = is_too_large
        document.type = 'pdf'
        document.content_type = norm_type
        document.file_size = file_size
        document.status_message = ''
        document.status = 'ready'

        version.type = 'pdf'
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
        if not doc or doc.is_download_only:
            return False
        if doc.type not in {'pdf', 'document'} or version.type not in {'pdf', 'document'}:
            return False
        if getattr(settings, 'PDF_PREVIEW_ENGINE', 'server_pages') != 'server_pages':
            return False
        max_preview_size = core_services.get_dynamic_setting('MAX_PREVIEW_FILE_SIZE_MB')
        file_size = version.file_size or (doc.file_size if doc else 0)
        if file_size and file_size > (max_preview_size * 1024 * 1024):
            return False
        return True

    def get_preview_mode(self, version: DocumentVersion) -> str:
        doc = version.document
        if doc and doc.is_download_only:
            return 'download_only'
        max_preview_size = core_services.get_dynamic_setting('MAX_PREVIEW_FILE_SIZE_MB')
        file_size = version.file_size or (doc.file_size if doc else 0)
        if file_size and file_size > (max_preview_size * 1024 * 1024):
            return 'download_only'
        if getattr(settings, 'PDF_PREVIEW_ENGINE', 'server_pages') == 'pdfjs':
            return 'client_pdf'
        return 'server_pages'

    def _dispatch_task(self, version: DocumentVersion):
        from documents.tasks import generate_pdf_pages_task
        generate_pdf_pages_task.delay(version.id)
