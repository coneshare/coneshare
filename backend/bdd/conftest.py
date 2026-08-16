import os
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from compile_po import BASE_LOCALE, make_mo
from core.models import Organization

User = get_user_model()

DEFAULT_TEST_PASSWORD = "StrongPassword123!"


@pytest.fixture(autouse=True, scope="session")
def ensure_mo_catalogs_compiled():
    """Ensure binary .mo catalogs exist and are compiled before running BDD tests."""
    for lang in ['en', 'zh_Hans', 'ru']:
        po_path = os.path.join(BASE_LOCALE, lang, 'LC_MESSAGES', 'django.po')
        mo_path = os.path.join(BASE_LOCALE, lang, 'LC_MESSAGES', 'django.mo')
        if os.path.exists(po_path):
            make_mo(po_path, mo_path)



@pytest.fixture(autouse=True)
def relax_password_validators(settings):
    """Use relaxed password validators during pytest runs to allow simple passwords in test assertions."""
    settings.AUTH_PASSWORD_VALIDATORS = [
        {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 3}}
    ]


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    """
    This fixture is used to set up a "live" database with the post_migrate signal
    that creates the default organization. BDD tests run against this.
    """
    with django_db_blocker.unblock():
        # The default organization is created by a post_migrate signal.
        # This setup ensures it exists for the BDD tests.
        pass


@pytest.fixture
def organization(django_db_setup):
    """Provides the default organization."""
    return Organization.objects.first()


@pytest.fixture
def user(organization):
    """Provides a primary test user."""
    # Using get_or_create to avoid creating duplicate users on re-runs
    user, created = User.objects.get_or_create(
        username='bdduser@example.com',
        defaults={
            'email': 'bdduser@example.com',
            'organization': organization,
            'role': 'admin'
        }
    )
    if created:
        user.set_password('password123')
        user.save()
    return user


@pytest.fixture
def api_client(user):
    """Provides an authenticated API client for the primary user."""
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def public_client():
    """Provides an unauthenticated API client for BDD tests."""
    return APIClient()
