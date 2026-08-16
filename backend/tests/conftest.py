import os
import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from compile_po import BASE_LOCALE, make_mo
from core.models import Organization
from documents.models import Document, DocumentVersion
from sharelinks.models import ShareLink
from documents.services import create_document_from_upload

User = get_user_model()

DEFAULT_TEST_PASSWORD = "StrongPassword123!"


@pytest.fixture(autouse=True, scope="session")
def ensure_mo_catalogs_compiled():
    """Ensure binary .mo catalogs exist and are compiled before running backend tests."""
    for lang in ['en', 'zh_Hans', 'ru']:
        po_path = os.path.join(BASE_LOCALE, lang, 'LC_MESSAGES', 'django.po')
        mo_path = os.path.join(BASE_LOCALE, lang, 'LC_MESSAGES', 'django.mo')
        if os.path.exists(po_path):
            make_mo(po_path, mo_path)



@pytest.fixture(autouse=True)
def disable_drf_rate_limiting(settings):
    """Disable DRF throttling during pytest runs to prevent 429 Too Many Requests in large test suites."""
    rf_settings = settings.REST_FRAMEWORK.copy()
    rf_settings['DEFAULT_THROTTLE_CLASSES'] = []
    settings.REST_FRAMEWORK = rf_settings


@pytest.fixture(autouse=True)
def relax_password_validators(settings):
    """Use relaxed password validators during pytest runs to allow simple passwords in test assertions."""
    settings.AUTH_PASSWORD_VALIDATORS = [
        {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 3}}
    ]


@pytest.fixture
def default_password():
    """Provides standard default password constant for test assertions."""
    return DEFAULT_TEST_PASSWORD


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
def file_request(user, organization):
    """Fixture to create a file request."""
    from filerequests.models import FileRequest
    from documents.models import Folder
    root_folder = Folder.objects.get_root_for_org(organization)
    return FileRequest.objects.create(
        name="Test File Request",
        folder=root_folder,
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
