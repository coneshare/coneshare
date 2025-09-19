import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from core.models import UserGroup

User = get_user_model()


@pytest.fixture
def admin_user(db, organization):
    """Fixture for a user with staff and superuser privileges."""
    return User.objects.create_user(
        username="admin@example.com",
        email="admin@example.com",
        password="password123",
        organization=organization,
        is_staff=True,
        is_superuser=True,
    )


@pytest.fixture
def admin_client(admin_user):
    """Fixture for an API client authenticated as the admin user."""
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.mark.django_db
def test_list_organizations(admin_client, organization):
    """Ensure we can list organizations."""
    url = reverse('organization-list')
    response = admin_client.get(url, format='json')
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]['name'] == organization.name


@pytest.mark.django_db
def test_list_users(admin_client, admin_user):
    """Ensure we can list users."""
    url = reverse('user-list')
    response = admin_client.get(url, format='json')
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]['email'] == admin_user.email


# @pytest.mark.django_db
# def test_create_user(admin_client):
#     """Ensure we can create a new user."""
#     url = reverse('user-list')
#     data = {
#         'email': 'newuser@example.com',
#         'password': 'password456'
#     }
#     response = admin_client.post(url, data, format='json')
#     assert response.status_code == status.HTTP_201_CREATED
#     assert User.objects.count() == 2
#     assert 'password' not in response.data


@pytest.mark.django_db
def test_list_groups(admin_client, organization):
    """Ensure we can list user groups."""
    UserGroup.objects.create(name="Developers", organization=organization)
    url = reverse('usergroup-list')
    response = admin_client.get(url, format='json')
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]['name'] == 'Developers'


@pytest.mark.django_db
def test_create_group(admin_client, organization):
    """Ensure we can create a new user group."""
    url = reverse('usergroup-list')
    data = {'name': 'Admins', 'organization': organization.pk}
    response = admin_client.post(url, data, format='json')
    assert response.status_code == status.HTTP_201_CREATED
    assert UserGroup.objects.count() == 1
    assert response.data['name'] == 'Admins'
