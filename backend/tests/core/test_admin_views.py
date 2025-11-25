import pytest
from rest_framework import status

from core.models import User


@pytest.mark.django_db
class TestAdminUserViewSetProtection:
    """
    Tests to ensure the last active admin of an organization cannot be removed.
    """

    def test_update_cannot_remove_last_admin(self, api_client, admin_user):
        """An admin cannot demote or deactivate another user if that user is the last active admin."""
        organization = admin_user.organization
        
        # At this point, admin_user is the only active admin.
        # Try to demote self.
        url = f'/api/v1/admin/users/{admin_user.id}/'
        response_demote = api_client.patch(url, {'role': 'user'})
        assert response_demote.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Cannot demote or deactivate the last active admin' in response_demote.json()['detail']

        # Try to deactivate self.
        response_deactivate = api_client.patch(url, {'is_active': False})
        assert response_deactivate.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Cannot demote or deactivate the last active admin' in response_deactivate.json()['detail']

    def test_admin_cannot_demote_another_user_who_is_last_admin(self, api_client, admin_user):
        """An admin cannot demote another user if that would remove the last admin."""
        organization = admin_user.organization
        other_admin = User.objects.create_user(
            username='otheradmin@example.com', organization=organization, role='admin'
        )

        # The logged in user (admin_user) deactivates themself, leaving other_admin as the last one.
        admin_user.is_active = False
        admin_user.save()
        
        # A new admin must perform the action now.
        actor_admin = User.objects.create_user(
            username='actor@example.com', organization=organization, role='admin'
        )
        api_client.force_authenticate(user=actor_admin)
        
        # This actor_admin tries to demote other_admin. This should fail.
        # This will fail with the current code.
        url = f'/api/v1/admin/users/{other_admin.id}/'
        response = api_client.patch(url, {'role': 'user'})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Cannot demote or deactivate the last active admin' in response.json()['detail']

    def test_delete_cannot_remove_last_admin(self, api_client, admin_user):
        """An admin cannot delete another user if that user is the last active admin."""
        organization = admin_user.organization
        last_admin = User.objects.create_user(
            username='lastadmin@example.com', organization=organization, role='admin'
        )
        # Deactivate the logged-in user so `last_admin` is the only active one.
        admin_user.is_active = False
        admin_user.save()

        # Log back in as a new, temporary admin to perform the action.
        acting_admin = User.objects.create_user(
            username='actor@example.com', organization=organization, role='admin'
        )
        api_client.force_authenticate(user=acting_admin)

        # Bug reproduction: Try to delete the last admin. This should fail.
        url = f'/api/v1/admin/users/{last_admin.id}/'
        response = api_client.delete(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Cannot delete the last active admin' in response.json()['detail']

    def test_delete_self_is_prevented_when_last_admin(self, api_client, admin_user):
        """An admin cannot delete themselves if they are the last admin."""
        # Ensure admin_user is the only active admin
        User.objects.filter(
            organization=admin_user.organization, role='admin', is_active=True
        ).exclude(pk=admin_user.pk).delete()

        url = f'/api/v1/admin/users/{admin_user.id}/'
        response = api_client.delete(url)
        # The original check was for `instance == request.user`.
        # The new check should be for last admin.
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Cannot delete the last active admin' in response.json()['detail']
