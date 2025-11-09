import pytest

from sharelinks.models import ShareLink, ShareLinkPreset
from documents.models import Document

pytestmark = pytest.mark.django_db


def test_share_link_preset_creation(organization):
    """Test that a ShareLinkPreset instance can be created."""
    preset = ShareLinkPreset.objects.create(
        name="Default Preset",
        organization=organization
    )
    assert isinstance(preset, ShareLinkPreset)
    assert str(preset) == "Default Preset"


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
