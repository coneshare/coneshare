from typing import Dict, Iterable, Optional, Set

from django.db.models import Q

from backend.utils import get_unique_name
from core.models import User
from datarooms.models import Dataroom, DataroomDocument
from documents.fileserver import fileserver_client
from documents.models import Document

from .models import ShareLink, ViewSession

DocPagesMap = Dict[int, str]
PagesMap = Dict[str, DocPagesMap]


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
    Returns a Q object matching all ShareLinks belonging to or manageable by the user
    in their personal context (home dashboard, personal links list, personal analytics):
    - Direct document links created by the user.
    - Dataroom links belonging to datarooms where the user is an owner or active collaborator.
    """
    user_datarooms = Dataroom.objects.filter(
        Q(created_by=user) | Q(collaborators__user=user),
        organization=user.organization
    ).distinct()
    return Q(document__isnull=False, created_by=user) | Q(dataroom__in=user_datarooms)


def _get_document_page_urls(doc: Document) -> DocPagesMap:
    """Generates signed preview thumbnail URLs for a document's primary version."""
    if not doc:
        return {}

    prefetched = getattr(doc, '_prefetched_objects_cache', {}).get('versions')
    primary_version = (
        next((v for v in prefetched if v.is_primary), None)
        if prefetched is not None
        else doc.versions.filter(is_primary=True).first()
    )
    if not primary_version:
        return {}

    if doc.type == 'image':
        return {1: fileserver_client.generate_download_url(primary_version.original_storage_key, is_internal=False)}

    return {
        page.page_number: fileserver_client.generate_download_url(page.storage_key, is_internal=False)
        for page in primary_version.pages.all()
    }


def get_pages_map_for_sessions(sessions: Iterable[ViewSession]) -> PagesMap:
    """
    Unified helper to generate page preview URLs for a collection of ViewSession instances.
    Extracts pages for both direct document sessions and nested dataroom visits in a single pass.
    """
    if sessions is None:
        return {}

    pages_map: PagesMap = {}
    direct_doc_ids: Set[str] = set()
    ddoc_ids: Set[str] = set()

    for s in sessions:
        link = getattr(s, 'share_link', None)
        doc_id = getattr(link, 'document_id', None)
        if doc_id:
            direct_doc_ids.add(str(doc_id))

        visits = None if doc_id else getattr(s, 'dataroom_visits', None)
        if visits is not None:
            items = visits.all() if hasattr(visits, 'all') else visits
            for v in items:
                if getattr(v, 'dataroom_document_id', None):
                    ddoc_ids.add(str(v.dataroom_document_id))

    # 1. Direct document sessions
    if direct_doc_ids:
        docs = Document.objects.filter(
            id__in=direct_doc_ids
        ).prefetch_related('versions__pages')
        for doc in docs:
            urls = _get_document_page_urls(doc)
            if urls:
                pages_map[str(doc.id)] = urls

    # 2. Dataroom visit documents
    if ddoc_ids:
        ddocs = DataroomDocument.objects.filter(
            id__in=ddoc_ids
        ).select_related('document').prefetch_related('document__versions__pages')
        for ddoc in ddocs:
            urls = _get_document_page_urls(ddoc.document) if ddoc.document else None
            if urls:
                pages_map[str(ddoc.id)] = urls
                pages_map[str(ddoc.document_id)] = urls

    return pages_map

