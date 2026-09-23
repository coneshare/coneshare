from typing import List, Type

from documents.models import DocumentVersion
from .base import BasePreviewRenderer
from .direct_image import DirectImageRenderer
from .generic import GenericFileRenderer
from .office import OfficeRenderer
from .pdf import PDFRenderer
from .spreadsheet import SpreadsheetRenderer
from .transcoded_image import TranscodedImageRenderer
from .utils import is_heic_file, normalize_content_type
from .video import VideoRenderer

# Priority-ordered registry of renderer classes.
# Specialized renderers are evaluated before general ones; GenericFileRenderer is the fallback.
RENDERER_CLASSES: List[Type[BasePreviewRenderer]] = [
    TranscodedImageRenderer,  # Evaluates HEIC/HEIF before general image
    DirectImageRenderer,      # Standard raster images (JPEG, PNG, GIF, WEBP)
    PDFRenderer,              # PDF files
    SpreadsheetRenderer,      # Modern spreadsheets (XLSX, CSV)
    OfficeRenderer,           # Office formats (DOCX, PPTX, legacy XLS, etc.)
    VideoRenderer,            # Video formats (MP4, MOV, etc.)
    GenericFileRenderer,      # Catch-all fallback (download_only, SVG, etc.)
]


def get_renderer(version: DocumentVersion) -> BasePreviewRenderer:
    """Finds the matching renderer class and instantiates a clean, thread-isolated handler."""
    for renderer_cls in RENDERER_CLASSES:
        if renderer_cls.can_handle_version(version):
            return renderer_cls()
    return GenericFileRenderer()


def get_renderer_for_file(content_type: str, filename: str) -> BasePreviewRenderer:
    """Finds the matching renderer class and instantiates a clean, thread-isolated handler."""
    for renderer_cls in RENDERER_CLASSES:
        if renderer_cls.can_handle_file(content_type, filename):
            return renderer_cls()
    return GenericFileRenderer()


__all__ = [
    'BasePreviewRenderer',
    'DirectImageRenderer',
    'GenericFileRenderer',
    'OfficeRenderer',
    'PDFRenderer',
    'RENDERER_CLASSES',
    'SpreadsheetRenderer',
    'TranscodedImageRenderer',
    'VideoRenderer',
    'get_renderer',
    'get_renderer_for_file',
    'is_heic_file',
    'normalize_content_type',
]
