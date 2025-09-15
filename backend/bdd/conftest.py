import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from core.models import Organization

User = get_user_model()


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
    user, _ = User.objects.get_or_create(
        username='bdduser@example.com',
        defaults={
            'email': 'bdduser@example.com',
            'password': 'password123',
            'organization': organization,
            'role': 'admin'
        }
    )
    if not user.has_usable_password():
        user.set_password('password123')
        user.save()
    return user


@pytest.fixture
def api_client(user):
    """Provides an authenticated API client for the primary user."""
    client = APIClient()
    client.force_authenticate(user=user)
    return client
