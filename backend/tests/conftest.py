import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from core.models import Organization

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
def api_client(user):
    """Fixture to create an authenticated API client."""
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def public_client():
    """Fixture to create an unauthenticated API client."""
    return APIClient()
