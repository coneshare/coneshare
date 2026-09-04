import pytest
from rest_framework import status

from core.models import AppConfiguration, Organization, User
from documents.models import Folder
from filerequests.models import FileRequest
from filerequests.models import SecurityThreatEvent


@pytest.mark.django_db
class TestAdminUserViewSetProtection:
    """
    Tests to ensure the last active admin of an organization cannot be removed.
    """

    def test_update_cannot_remove_last_admin(self, admin_api_client, admin_user):
        """Tests that the last active admin of an organization cannot be demoted or deactivated."""
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

    def test_admin_cannot_demote_self_even_if_not_last(self, admin_api_client, admin_user):
        """An admin cannot demote or deactivate their own account, even if other admins exist."""
        organization = admin_user.organization
        # Create a second admin
        User.objects.create_user(
            username='otheradmin@example.com', email='otheradmin@example.com', organization=organization, role='admin'
        )

        # The logged-in admin (admin_user) tries to demote themselves.
        url = f'/api/v1/admin/users/{admin_user.id}/'
        response = admin_api_client.patch(url, {'role': 'user'})

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Admins cannot demote or deactivate their own account' in response.json()['detail']

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


@pytest.mark.django_db
class TestAdminSettingsTypedValues:
    def test_list_settings_includes_value_type(self, admin_api_client):
        response = admin_api_client.get('/api/v1/admin/settings/')
        assert response.status_code == status.HTTP_200_OK
        settings_by_key = {item['key']: item for item in response.json()}
        assert settings_by_key['ENABLE_PUBLIC_SIGNUP']['value_type'] == 'bool'
        assert isinstance(settings_by_key['ENABLE_PUBLIC_SIGNUP']['value'], bool)
        assert settings_by_key['MAX_FILES_PER_UPLOAD']['value_type'] == 'int'
        assert isinstance(settings_by_key['MAX_FILES_PER_UPLOAD']['value'], int)

    def test_update_bool_setting_accepts_boolean_and_persists_canonical_value(self, admin_api_client):
        response = admin_api_client.patch(
            '/api/v1/admin/settings/ENABLE_PUBLIC_SIGNUP/',
            {'value': True},
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()['value'] is True
        assert response.json()['value_type'] == 'bool'
        db_value = AppConfiguration.objects.get(key='ENABLE_PUBLIC_SIGNUP').value
        assert db_value == 'true'

    def test_update_int_setting_rejects_invalid_type(self, admin_api_client):
        response = admin_api_client.patch(
            '/api/v1/admin/settings/MAX_FILES_PER_UPLOAD/',
            {'value': 'not-an-int'},
            format='json',
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'value' in response.json()


@pytest.mark.django_db
class TestAdminSecurityThreatEventsViewSet:
    def test_list_security_threat_events_scoped_to_org(self, admin_api_client, admin_user, file_request):
        own_event = SecurityThreatEvent.objects.create(
            organization=admin_user.organization,
            owner_user=admin_user,
            file_request=file_request,
            event_type=SecurityThreatEvent.EventType.MALWARE_DETECTED,
            severity=SecurityThreatEvent.Severity.HIGH,
            status=SecurityThreatEvent.Status.NEW,
            file_name='malware.exe',
            uploader_email='bad@example.com',
            scanner_message='FOUND',
        )

        other_org = Organization.objects.create(name='Other Org Threats')
        other_org_admin = User.objects.create_user(
            username='other-org-admin@example.com',
            email='other-org-admin@example.com',
            password='password',
            role='admin',
            organization=other_org,
        )
        other_org_root = Folder.objects.get_root_for_org(other_org)
        other_org_file_request = FileRequest.objects.create(
            name='Other Org Request',
            folder=other_org_root,
            created_by=other_org_admin,
        )
        SecurityThreatEvent.objects.create(
            organization=other_org,
            owner_user=other_org_admin,
            file_request=other_org_file_request,
            event_type=SecurityThreatEvent.EventType.SCAN_FAILED,
            severity=SecurityThreatEvent.Severity.MEDIUM,
            status=SecurityThreatEvent.Status.NEW,
            file_name='unknown.pdf',
            uploader_email='other@example.com',
            scanner_message='timeout',
        )

        response = admin_api_client.get('/api/v1/admin/security-threat-events/')
        assert response.status_code == status.HTTP_200_OK
        results = response.json()['results']
        assert len(results) == 1
        assert results[0]['id'] == str(own_event.id)
        assert results[0]['file_request_slug'] == file_request.slug

    def test_filter_security_threat_events(self, admin_api_client, admin_user, file_request):
        SecurityThreatEvent.objects.create(
            organization=admin_user.organization,
            owner_user=admin_user,
            file_request=file_request,
            event_type=SecurityThreatEvent.EventType.MALWARE_DETECTED,
            severity=SecurityThreatEvent.Severity.HIGH,
            status=SecurityThreatEvent.Status.NEW,
        )
        SecurityThreatEvent.objects.create(
            organization=admin_user.organization,
            owner_user=admin_user,
            file_request=file_request,
            event_type=SecurityThreatEvent.EventType.SCAN_FAILED,
            severity=SecurityThreatEvent.Severity.MEDIUM,
            status=SecurityThreatEvent.Status.RESOLVED,
        )

        response = admin_api_client.get('/api/v1/admin/security-threat-events/?severity=high&status=new')
        assert response.status_code == status.HTTP_200_OK
        results = response.json()['results']
        assert len(results) == 1
        assert results[0]['severity'] == 'high'
        assert results[0]['status'] == 'new'

    def test_non_admin_cannot_list_security_threat_events(self, api_client):
        response = api_client.get('/api/v1/admin/security-threat-events/')
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestAdminOrganizationView:
    def test_get_organization_branding(self, admin_api_client, admin_user):
        url = '/api/v1/admin/organization/'
        response = admin_api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == admin_user.organization.name
        assert 'brand_name' in response.data
        assert 'brand_logo_url' in response.data
        assert 'terms_url' in response.data
        assert 'privacy_policy_url' in response.data

    def test_patch_organization_branding(self, admin_api_client, admin_user):
        url = '/api/v1/admin/organization/'
        data = {
            'brand_name': 'My Custom Brand',
            'brand_website_url': 'https://mycustombrand.com',
            'terms_url': 'https://mycustombrand.com/terms',
            'privacy_policy_url': 'https://mycustombrand.com/privacy',
        }
        response = admin_api_client.patch(url, data, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['brand_name'] == 'My Custom Brand'
        assert response.data['brand_website_url'] == 'https://mycustombrand.com'
        assert response.data['terms_url'] == 'https://mycustombrand.com/terms'
        assert response.data['privacy_policy_url'] == 'https://mycustombrand.com/privacy'
        
        admin_user.organization.refresh_from_db()
        assert admin_user.organization.brand_name == 'My Custom Brand'
        assert admin_user.organization.brand_website_url == 'https://mycustombrand.com'
        assert admin_user.organization.branding_extras.get('terms_url') == 'https://mycustombrand.com/terms'
        assert admin_user.organization.branding_extras.get('privacy_policy_url') == 'https://mycustombrand.com/privacy'

    def test_patch_organization_branding_with_svg_logo(self, admin_api_client, admin_user):
        from django.core.files.uploadedfile import SimpleUploadedFile
        url = '/api/v1/admin/organization/'
        svg_content = b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>'
        svg_file = SimpleUploadedFile("logo.svg", svg_content, content_type="image/svg+xml")

        data = {
            'brand_name': 'My Custom Brand',
            'brand_logo': svg_file,
        }
        response = admin_api_client.patch(url, data, format='multipart')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['brand_name'] == 'My Custom Brand'
        assert 'logo.svg' in response.data['brand_logo_url']

        admin_user.organization.refresh_from_db()
        assert admin_user.organization.brand_name == 'My Custom Brand'
        assert admin_user.organization.brand_logo.name.endswith('logo.svg')

    def test_patch_organization_branding_clear_fields_and_partial_update(self, admin_api_client, admin_user):
        url = '/api/v1/admin/organization/'
        
        # 1. Set values first
        data = {
            'terms_url': 'https://mycustombrand.com/terms',
            'privacy_policy_url': 'https://mycustombrand.com/privacy',
        }
        response = admin_api_client.patch(url, data, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['terms_url'] == 'https://mycustombrand.com/terms'
        assert response.data['privacy_policy_url'] == 'https://mycustombrand.com/privacy'

        # 2. Perform partial update (omit privacy_policy_url, clear terms_url)
        data_partial = {
            'terms_url': '',
        }
        response = admin_api_client.patch(url, data_partial, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['terms_url'] == ''
        assert response.data['privacy_policy_url'] == 'https://mycustombrand.com/privacy'

        admin_user.organization.refresh_from_db()
        assert admin_user.organization.branding_extras.get('terms_url') == ''
        assert admin_user.organization.branding_extras.get('privacy_policy_url') == 'https://mycustombrand.com/privacy'

    def test_non_admin_cannot_access_branding(self, api_client):
        url = '/api/v1/admin/organization/'
        response = api_client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_recalculate_user_quota_success(self, admin_api_client, admin_user):
        from documents.models import Document
        # Create a member user with corrupted total_document_size
        member = User.objects.create_user(
            username='member_quota@example.com',
            email='member_quota@example.com',
            organization=admin_user.organization,
            role='member',
            total_document_size=9999999,  # Corrupted / drifted value
        )

        # Create two active documents and one deleted document for this member
        Document.objects.create(
            organization=admin_user.organization,
            created_by=member,
            name='doc1.pdf',
            file_size=1024,
            status='ready'
        )
        Document.objects.create(
            organization=admin_user.organization,
            created_by=member,
            name='doc2.pdf',
            file_size=2048,
            status='ready'
        )
        from django.utils import timezone
        Document.objects.create(
            organization=admin_user.organization,
            created_by=member,
            name='doc_deleted.pdf',
            file_size=5000,
            status='ready',
            deleted_at=timezone.now(),
        )

        url = f'/api/v1/admin/users/{member.id}/recalculate-quota/'
        response = admin_api_client.post(url)
        assert response.status_code == status.HTTP_200_OK

        member.refresh_from_db()
        assert member.total_document_size == 1024 + 2048
        assert response.data['total_document_size'] == 3072

    def test_recalculate_user_quota_excludes_dataroom_vault_documents(self, admin_api_client, admin_user):
        from documents.models import Document, Folder
        from datarooms.models import Dataroom
        from datarooms.services import get_or_create_dataroom_storage_folder

        member = User.objects.create_user(
            username='member_vault_quota@example.com',
            email='member_vault_quota@example.com',
            organization=admin_user.organization,
            role='member',
            total_document_size=50 * 1024 * 1024 + 1024,  # Bloated with historical vault upload
        )

        # 1. Personal document (1024 bytes)
        Document.objects.create(
            organization=admin_user.organization,
            created_by=member,
            name='personal_notes.pdf',
            file_size=1024,
            status='ready'
        )

        # 2. Modern Dataroom vault document (50 MB)
        dataroom = Dataroom.objects.create(
            name="Confidential Deal",
            organization=admin_user.organization,
            created_by=member,
            storage_quota_mb=500,
            storage_version=2
        )
        vault_folder = get_or_create_dataroom_storage_folder(dataroom, member)
        Document.objects.create(
            organization=admin_user.organization,
            folder=vault_folder,
            created_by=member,
            name='deal_deck.pdf',
            file_size=50 * 1024 * 1024,
            status='ready'
        )

        # Admin triggers quota recalculation from user panel
        url = f'/api/v1/admin/users/{member.id}/recalculate-quota/'
        response = admin_api_client.post(url)
        assert response.status_code == status.HTTP_200_OK

        member.refresh_from_db()
        # Only personal document (1024 bytes) must be counted
        assert member.total_document_size == 1024
        assert response.data['total_document_size'] == 1024

    def test_recalculate_user_quota_non_admin_forbidden(self, api_client, user):
        url = f'/api/v1/admin/users/{user.id}/recalculate-quota/'
        response = api_client.post(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_recalculate_user_quota_other_org_not_found(self, admin_api_client, admin_user):
        other_org = Organization.objects.create(name="Other Org")
        other_user = User.objects.create_user(
            username='other_org_user@example.com',
            email='other_org_user@example.com',
            organization=other_org,
            role='member',
        )
        url = f'/api/v1/admin/users/{other_user.id}/recalculate-quota/'
        response = admin_api_client.post(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

