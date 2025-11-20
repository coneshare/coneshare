import pytest

from sharelinks.models import ShareLink, ShareLinkTemplate, ViewSession, Viewer
from documents.models import Document

pytestmark = pytest.mark.django_db


def test_share_link_template_creation(organization):
    """Test that a ShareLinkTemplate instance can be created."""
    template = ShareLinkTemplate.objects.create(
        name="Default Template",
        organization=organization
    )
    assert isinstance(template, ShareLinkTemplate)
    assert str(template) == "Default Template"


def test_share_link_creation(user):
    """Test that a ShareLink instance can be created."""
    document = Document.objects.create(
        name="Doc for Link",
        organization=user.organization,
        created_by=user,
    )
    share_link = ShareLink.objects.create(
        name="test",
        document=document,
        created_by=user,
        slug="test-slug-123"
    )
    assert isinstance(share_link, ShareLink)
    assert str(share_link) == "test"
    assert share_link.document == document
    assert share_link.created_by == user


@pytest.mark.django_db
def test_viewer_creation(organization):
    """Test that a Viewer instance can be created."""
    viewer = Viewer.objects.create(
        organization=organization,
        email="viewer@example.com"
    )
    assert isinstance(viewer, Viewer)
    assert str(viewer) == "viewer@example.com"


@pytest.mark.django_db
def test_view_session_creation(user):
    """Test that a ViewSession instance can be created."""
    document = Document.objects.create(
        name="Doc for View",
        organization=user.organization,
        created_by=user,
    )
    share_link = ShareLink.objects.create(document=document, slug="another-slug")
    view_session = ViewSession.objects.create(share_link=share_link, duration_seconds=0, completion_rate=0)
    assert isinstance(view_session, ViewSession)
