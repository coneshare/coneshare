import pytest
from rest_framework import status

from core.models import User


@pytest.mark.django_db
class TestAdminUserViewSetProtection:
    """
    Tests to ensure the last active admin of an organization cannot be removed.
    """

    def test_update_cannot_remove_last_admin(self, admin_api_client, admin_user):
        """An admin cannot demote or deactivate another user if that user is the last active admin."""
        organization = admin_user.organization
        
        # At this point, admin_user is the only active admin.
        # Try to demote self.
        url = f'/api/v1/admin/users/{admin_user.id}/'
        response_demote = admin_api_client.patch(url, {'role': 'user'})
        assert response_demote.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Cannot demote or deactivate the last active admin' in response_demote.json()['detail']

        # Try to deactivate self.
        response_deactivate = admin_api_client.patch(url, {'is_active': False})
        assert response_deactivate.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Cannot demote or deactivate the last active admin' in response_deactivate.json()['detail']

    def test_admin_can_demote_another_admin_if_not_last(self, admin_api_client, admin_user):
        """An admin can demote another admin as long as they are not the last one."""
        organization = admin_user.organization
        # Create a second admin to be the target of the demotion.
        other_admin = User.objects.create_user(
            username='otheradmin@example.com', email='otheradmin@example.com', organization=organization, role='admin'
        )

        # The logged-in admin (admin_user) tries to demote other_admin.
        # This should succeed because admin_user will remain as an active admin.
        url = f'/api/v1/admin/users/{other_admin.id}/'
        response = admin_api_client.patch(url, {'role': 'user'})

        assert response.status_code == status.HTTP_200_OK
        
        other_admin.refresh_from_db()
        assert other_admin.role == 'user'

        # Verify that the actor is still the last remaining admin.
        active_admins = User.objects.filter(
            organization=organization, role='admin', is_active=True
        )
        assert active_admins.count() == 1
        assert active_admins.first() == admin_user

    def test_admin_can_delete_another_admin_if_not_last(self, admin_api_client, admin_user):
        """An admin can delete another admin as long as at least one active admin remains."""
        organization = admin_user.organization
        # Create a second admin to be the target of deletion.
        target_admin = User.objects.create_user(
            username='target@example.com', email='target@example.com', organization=organization, role='admin'
        )

        # At this point, there are two active admins: admin_user (the actor, authenticated
        # via admin_api_client) and target_admin. The deletion should be allowed.
        url = f'/api/v1/admin/users/{target_admin.id}/'
        response = admin_api_client.delete(url)

        # Assert that the deletion was successful.
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not User.objects.filter(id=target_admin.id).exists()
        
        # The original actor should still exist and be the last admin.
        assert User.objects.filter(id=admin_user.id).exists()
        assert User.objects.filter(
            organization=organization, role='admin', is_active=True
        ).count() == 1

    def test_delete_self_is_prevented_when_last_admin(self, admin_api_client, admin_user):
        """An admin cannot delete themselves if they are the last admin."""
        # Ensure admin_user is the only active admin
        User.objects.filter(
            organization=admin_user.organization, role='admin', is_active=True
        ).exclude(pk=admin_user.pk).delete()

        url = f'/api/v1/admin/users/{admin_user.id}/'
        response = admin_api_client.delete(url)
        # The original check was for `instance == request.user`.
        # The new check should be for last admin.
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Cannot delete the last active admin' in response.json()['detail']
