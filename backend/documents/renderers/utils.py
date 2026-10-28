import mimetypes
import os

from .constants import DANGEROUS_SCRIPT_EXTENSIONS, HEIC_EXTENSIONS, HEIC_MIMETYPES, MARKDOWN_EXTENSIONS


def normalize_content_type(content_type: str, filename: str = '') -> str:
    """Guesses MIME type if missing or application/octet-stream."""
    if filename:
        ext = os.path.splitext(filename)[1].lower()
        if ext in MARKDOWN_EXTENSIONS:
            return 'text/markdown'
        # Prevent active web scripting extensions from adopting incompatible previewable content types
        if ext in DANGEROUS_SCRIPT_EXTENSIONS:
            guessed_type, _ = mimetypes.guess_type(filename)
            return guessed_type or 'application/octet-stream'

    if not content_type or content_type == 'application/octet-stream':
        if filename:
            guessed_type, _ = mimetypes.guess_type(filename)
            if guessed_type:
                return guessed_type
    return content_type or ''


def is_heic_file(content_type: str, filename: str = '') -> bool:
    """Checks if MIME type or filename extension represents an HEIC/HEIF file."""
    if content_type in HEIC_MIMETYPES:
        return True
    if filename:
        ext = os.path.splitext(filename)[1].lower()
        if ext in HEIC_EXTENSIONS:
            return True
    return False
