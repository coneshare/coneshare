from backend.utils import get_unique_name
from documents.models import Document

from .models import ShareLink


def _get_unique_share_link_name(document: Document, original_name: str) -> str:
    """Generates a unique name for a share link within a document to avoid duplicates."""
    filter_kwargs = {'document': document}
    return get_unique_name(ShareLink, original_name, filter_kwargs, has_extension=False)
