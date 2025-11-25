import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from core.models import Organization
from documents.models import Document, DocumentVersion
from sharelinks.models import ShareLink
from documents.services import create_document_from_upload

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
def admin_user(organization):
    """Fixture to create an admin user."""
    return User.objects.create_user(
        username="admin@example.com",
        email="admin@example.com",
        password="password",
        role='admin',
        organization=organization
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
    share_link.password = "password123"
    share_link.save()
    return share_link


@pytest.fixture
def share_link_requires_email(share_link):
    """Fixture to create a share link that requires email."""
    share_link.requires_email = True
    share_link.save()
    return share_link


@pytest.fixture
def share_link_requires_email_verification(share_link):
    """Fixture to create a share link that requires email and verification."""
    share_link.requires_email = True
    share_link.requires_email_verification = True
    share_link.save()
    return share_link


@pytest.fixture
def share_link_with_password_and_email(share_link_with_password):
    """Fixture for a link requiring both password and email (no verification)."""
    share_link_with_password.requires_email = True
    share_link_with_password.save()
    return share_link_with_password


@pytest.fixture
def share_link_with_watermark(share_link):
    """Fixture for a share link with watermarking enabled."""
    share_link.enable_watermark = True
    share_link.watermark_text = "Confidential - {{ip-address}}"
    share_link.save()
    return share_link


@pytest.fixture
def dataroom(user, organization):
    """Fixture to create a dataroom."""
    from datarooms.models import Dataroom
    return Dataroom.objects.create(
        name="Test Dataroom",
        organization=organization,
        created_by=user,
    )


@pytest.fixture
def api_client(user):
    """Fixture to create an authenticated API client."""
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def admin_api_client(admin_user):
    """Fixture to create an authenticated API client for an admin."""
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def public_client():
    """Fixture to create an unauthenticated API client."""
    return APIClient()


@pytest.fixture
def image_document_with_content(user):
    """
    Creates a real image document by calling the upload service, so it has
    content in storage for URL generation.
    """
    # 1x1 transparent gif
    image_content = (
        b'GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00'
        b'!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01'
        b'\x00\x00\x02\x02D\x01\x00;'
    )
    document = create_document_from_upload(
        requesting_user=user,
        folder=None,
        storage_key=f"{user.organization.id}/test_image.gif",
        unique_name="test_image.gif",
        file_size=len(image_content),
        content_type="image/gif"
    )
    return document
