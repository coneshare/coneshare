from typing import Optional

from backend.utils import get_unique_name
from core.models import User
from datarooms.models import Dataroom
from documents.models import Document

from .models import ShareLink


def _get_unique_share_link_name(document: Document, original_name: str) -> str:
    """Generates a unique name for a share link within a document to avoid duplicates."""
    filter_kwargs = {'document': document}
    return get_unique_name(ShareLink, original_name, filter_kwargs, has_extension=False)


def _get_unique_dataroom_share_link_name(dataroom: Dataroom, original_name: str) -> str:
    """Generates a unique name for a share link for a dataroom to avoid duplicates."""
    filter_kwargs = {'dataroom': dataroom}
    return get_unique_name(ShareLink, original_name, filter_kwargs, has_extension=False)


def _is_valid_recipient(user: Optional[User]) -> bool:
    """Returns True if the user exists, is active, and has an email address configured."""
    return bool(user and user.is_active and user.email)


def resolve_notification_recipient(share_link: ShareLink) -> Optional[User]:
    """
    Determines the effective user who should receive notifications for activity on a ShareLink:
    1. By default, returns share_link.created_by if active and has an email.
    2. If the link belongs to a Dataroom, checks whether created_by is still a valid participant
       (either the room owner or an active collaborator).
    3. If created_by is inactive or no longer a collaborator on the room, falls back to the
       current Dataroom owner (dataroom.created_by).
    4. Returns None if no active recipient with an email address is found.
    """
    creator = share_link.created_by
    dataroom = share_link.dataroom

    if not dataroom:
        return creator if _is_valid_recipient(creator) else None

    # For dataroom share links:
    if _is_valid_recipient(creator):
        # Room owner
        if dataroom.created_by_id == creator.id:
            return creator
        # Active collaborator in this dataroom
        if dataroom.collaborators.filter(user=creator).exists():
            return creator

    # Fallback to current dataroom owner
    if _is_valid_recipient(dataroom.created_by):
        return dataroom.created_by

    return None
