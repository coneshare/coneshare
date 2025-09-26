import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from rest_framework.test import APIClient

from core.models import Organization
from documents.models import Document, DocumentVersion, ShareLink

User = get_user_model()


@pytest.fixture
def organization(db):
    """Fixture to create a default organization."""
    return Organization.objects.all()[0]


@pytest.fixture
def user(organization):
    """Fixture to create a standard user."""
    return User.objects.create_user(
        username="test@example.com",
        email="test@example.com",
        password="password",
        organization=organization
    )


@pytest.fixture
def user2(organization):
    """Fixture to create a second user in the same organization."""
    return User.objects.create_user(
        username="test2@example.com",
        email="test2@example.com",
        password="password",
        organization=organization,
    )


@pytest.fixture
def document(user, organization):
    """Fixture to create a document with a primary version."""
    doc = Document.objects.create(
        name="Test Document.pdf",
        organization=organization,
        created_by=user,
        status='ready',
    )
    DocumentVersion.objects.create(
        document=doc,
        version_number=1,
        is_primary=True,
    )
    return doc


@pytest.fixture
def share_link(document, user):
    """Fixture to create a basic share link."""
    return ShareLink.objects.create(
        document=document,
        created_by=user,
        name="Test Share Link",
    )


@pytest.fixture
def share_link_with_password(share_link):
    """Fixture to create a share link that has a password."""
    share_link.password_hash = make_password("password123")
    share_link.save()
    return share_link


@pytest.fixture
def api_client(user):
    """Fixture to create an authenticated API client."""
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def public_client():
    """Fixture to create an unauthenticated API client."""
    return APIClient()
