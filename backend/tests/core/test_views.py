from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import Organization, UserGroup

User = get_user_model()


class CoreAPITests(APITestCase):
    """
    Tests for the core API endpoints (Organizations, Users, Groups).
    """

    def setUp(self):
        """
        Set up common objects and authenticate a user for the tests.
        """
        self.organization = Organization.objects.create(name="Test Corp")
        self.user = User.objects.create_user(
            username="testuser@example.com",
            email="testuser@example.com",
            password="password123",
            organization=self.organization,
            is_staff=True, # Staff users can log in to the browsable API
            is_superuser=True, # Superusers have all permissions
        )
        self.client.force_authenticate(user=self.user)

    def test_list_organizations(self):
        """
        Ensure we can list organizations.
        """
        url = reverse('organization-list')
        response = self.client.get(url, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], self.organization.name)

    def test_create_organization(self):
        """
        Ensure we can create a new organization.
        """
        url = reverse('organization-list')
        data = {'name': 'New Org'}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Organization.objects.count(), 2)
        self.assertEqual(Organization.objects.get(id=response.data['id']).name, 'New Org')

    def test_update_organization(self):
        """
        Ensure we can update an existing organization's name.
        """
        url = reverse('organization-detail', kwargs={'pk': self.organization.pk})
        data = {'name': 'Updated Corp Name'}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.organization.refresh_from_db()
        self.assertEqual(self.organization.name, 'Updated Corp Name')

    def test_list_users(self):
        """
        Ensure we can list users.
        """
        url = reverse('user-list')
        response = self.client.get(url, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['email'], self.user.email)

    def test_create_user(self):
        """
        Ensure we can create a new user.
        """
        url = reverse('user-list')
        data = {
            'email': 'newuser@example.com',
            'username': 'newuser@example.com',
            'password': 'password456',
            'organization': self.organization.pk
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.objects.count(), 2)
        # Ensure password is not returned
        self.assertNotIn('password', response.data)

    def test_list_groups(self):
        """
        Ensure we can list user groups.
        """
        UserGroup.objects.create(name="Developers", organization=self.organization)
        url = reverse('usergroup-list')
        response = self.client.get(url, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Developers')

    def test_create_group(self):
        """
        Ensure we can create a new user group.
        """
        url = reverse('usergroup-list')
        data = {'name': 'Admins', 'organization': self.organization.pk}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(UserGroup.objects.count(), 1)
        self.assertEqual(response.data['name'], 'Admins')
