import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from core.models import Organization, UserGroup

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
        role="admin",
    )


@pytest.fixture
def admin_client(admin_user):
    """Fixture for an API client authenticated as the admin user."""
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def user2(db, organization):
    """Fixture to create a second user in the same organization."""
    return User.objects.create_user(
        username='user2@example.com',
        email='user2@example.com',
        password='password123',
        organization=organization,
        role='member'
    )


@pytest.fixture
def other_org_user(db):
    """Fixture to create a user in a different organization."""
    other_org = Organization.objects.create(name="Other Org")
    return User.objects.create_user(
        username='other@example.com',
        email='other@example.com',
        password='password123',
        organization=other_org,
        role='member'
    )


@pytest.mark.django_db
def test_list_organizations(admin_client, organization):
    """Ensure we can list organizations."""
    url = reverse('organization-list')
    response = admin_client.get(url, format='json')
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]['name'] == organization.name


@pytest.mark.django_db
def test_list_users(admin_client, admin_user, organization):
    """Ensure we can list users."""
    User.objects.create_user(
        username='user2@example.com',
        email='user2@example.com',
        organization=organization
    )
    url = reverse('user-list')
    response = admin_client.get(url, format='json')
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 2
    emails = {user['email'] for user in response.data}
    assert admin_user.email in emails
    assert 'user2@example.com' in emails


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


@pytest.mark.django_db
class TestUserViewSetPermissions:
    def test_user_can_retrieve_self(self, api_client, user):
        """A regular user can retrieve their own profile."""
        response = api_client.get(f'/api/v1/users/{user.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(user.id)

    def test_user_cannot_retrieve_other_user(self, api_client, user2):
        """A regular user cannot retrieve another user's profile."""
        response = api_client.get(f'/api/v1/users/{user2.id}/')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_user_can_update_self(self, api_client, user):
        """A regular user can update their own profile."""
        data = {'name': 'New Name'}
        response = api_client.patch(f'/api/v1/users/{user.id}/', data)
        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.name == 'New Name'

    def test_user_cannot_update_other_user(self, api_client, user2):
        """A regular user cannot update another user's profile."""
        data = {'name': 'New Name'}
        response = api_client.patch(f'/api/v1/users/{user2.id}/', data)
        assert response.status_code == status.HTTP_404_NOT_FOUND
        user2.refresh_from_db()
        assert user2.name != 'New Name'

    def test_admin_can_retrieve_other_user_in_org(self, api_client, admin_user, user):
        """An admin can retrieve another user's profile in the same org."""
        api_client.force_authenticate(user=admin_user)
        response = api_client.get(f'/api/v1/users/{user.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(user.id)

    def test_admin_cannot_retrieve_user_in_other_org(self, api_client, admin_user, other_org_user):
        """An admin cannot retrieve a user's profile from another org."""
        api_client.force_authenticate(user=admin_user)
        response = api_client.get(f'/api/v1/users/{other_org_user.id}/')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_admin_can_update_other_user_in_org(self, api_client, admin_user, user):
        """An admin can update another user's profile in the same org."""
        api_client.force_authenticate(user=admin_user)
        data = {'name': 'Updated by Admin'}
        response = api_client.patch(f'/api/v1/users/{user.id}/', data)
        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.name == 'Updated by Admin'

    def test_admin_cannot_update_user_in_other_org(self, api_client, admin_user, other_org_user):
        """An admin cannot update a user's profile from another org."""
        api_client.force_authenticate(user=admin_user)
        data = {'name': 'Updated by Admin'}
        response = api_client.patch(f'/api/v1/users/{other_org_user.id}/', data)
        assert response.status_code == status.HTTP_404_NOT_FOUND
        other_org_user.refresh_from_db()
        assert other_org_user.name != 'Updated by Admin'


@pytest.mark.django_db
class TestUserViewSetQueryset:
    def test_user_list_only_shows_self(self, api_client, user, user2):
        """A regular user listing users only sees themself."""
        response = api_client.get('/api/v1/users/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['id'] == str(user.id)

    def test_admin_list_shows_all_org_users(self, api_client, admin_user, user, user2, other_org_user):
        """An admin listing users sees all users in their org, but not others."""
        api_client.force_authenticate(user=admin_user)
        response = api_client.get('/api/v1/users/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 3
        ids = {item['id'] for item in response.data}
        assert str(admin_user.id) in ids
        assert str(user.id) in ids
        assert str(user2.id) in ids
        assert str(other_org_user.id) not in ids
