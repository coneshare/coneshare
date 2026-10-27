from typing import Optional

from django.db.models import Q

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


def can_user_manage_share_link(user: Optional[User], share_link: ShareLink) -> bool:
    """
    Determines whether a user has administrative/owner privileges on a ShareLink
    (e.g., to bypass viewer gates, create preview sessions, or manage settings/Q&A):
    - User must be authenticated, active, and belong to the same organization.
    - Staff / Org Admin -> True.
    - Direct document link -> True if user is creator (share_link.created_by_id == user.id).
    - Dataroom link -> True if user is the Dataroom owner OR an active collaborator in that Dataroom.
    """
    if not user or not user.is_authenticated or not getattr(user, 'is_active', True):
        return False

    if user.is_staff:
        return True

    org_id = share_link.organization_id
    if not org_id or user.organization_id != org_id:
        return False

    if getattr(user, 'role', '') == 'admin':
        return True

    if share_link.document_id:
        return share_link.created_by_id == user.id

    if share_link.dataroom_id:
        dataroom = share_link.dataroom
        if not dataroom:
            return False
        if dataroom.created_by_id == user.id:
            return True
        return dataroom.collaborators.filter(user=user).exists()

    return False


def can_user_edit_share_link(user: Optional[User], share_link: ShareLink) -> bool:
    """
    Determines whether a user has mutation/deletion privileges on a ShareLink:
    - User must be authenticated, active, and belong to the same organization.
    - Staff / Org Admin -> True.
    - Direct document link -> True if user is creator (share_link.created_by_id == user.id).
    - Dataroom link -> True if user is Dataroom owner OR (user is link creator AND active collaborator).
    """
    if not user or not user.is_authenticated or not getattr(user, 'is_active', True):
        return False

    if user.is_staff:
        return True

    org_id = share_link.organization_id
    if not org_id or user.organization_id != org_id:
        return False

    if getattr(user, 'role', '') == 'admin':
        return True

    if share_link.document_id:
        return share_link.created_by_id == user.id

    if share_link.dataroom_id:
        dataroom = share_link.dataroom
        if not dataroom:
            return False
        if dataroom.created_by_id == user.id:
            return True
        is_collaborator = dataroom.collaborators.filter(user=user).exists()
        return share_link.created_by_id == user.id and is_collaborator

    return False


def get_accessible_share_links_q(user: User) -> Q:
    """
    Returns a Q object matching all ShareLinks manageable by the user:
    - Direct document links created by the user (or all document links in org for org admins).
    - Dataroom links belonging to datarooms accessible to the user (owner, active collaborator, or org admin).
    """
    # Deferred import to prevent circular dependency:
    # sharelinks.services -> datarooms.views -> sharelinks.serializers -> sharelinks.services
    from datarooms.views import get_dataroom_queryset_for_user
    accessible_datarooms = get_dataroom_queryset_for_user(user)
    base_q = Q(document__isnull=False, created_by=user) | Q(dataroom__in=accessible_datarooms)
    if getattr(user, 'role', '') == 'admin' and getattr(user, 'organization_id', None):
        base_q |= Q(document__organization_id=user.organization_id)
    return base_q

