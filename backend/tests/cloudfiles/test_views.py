import pytest
from unittest.mock import patch, MagicMock
from rest_framework import status

from cloudfiles.models import CloudConnection
from cloudfiles.services import create_document_for_import
from core.models import AppConfiguration
from documents.models import Document, Folder, DocumentVersion
from documents.services import delete_document_and_files, process_imported_file


@pytest.fixture
def cloud_connection(user):
    """Fixture for a Dropbox cloud connection."""
    return CloudConnection.objects.create(
        user=user,
        provider='dropbox',
        email='test@dropbox.com',
        access_token='test_access_token',
    )


@pytest.fixture
def google_drive_connection(user):
    """Fixture for a Google Drive cloud connection."""
    return CloudConnection.objects.create(
        user=user,
        provider='google_drive',
        email='test@google.com',
        access_token='test_access_token_google',
    )


@pytest.fixture
def nextcloud_connection(user):
    """Fixture for a Nextcloud cloud connection."""
    return CloudConnection.objects.create(
        user=user,
        provider='nextcloud',
        email='test@nextcloud.com',
        access_token='test_access_token_nextcloud',
    )


@pytest.mark.django_db
class TestCloudProviderListView:
    def test_list_providers_unauthenticated(self, public_client):
        response = public_client.get('/api/v1/cloud/providers/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_providers_no_connection(self, api_client, settings):
        settings.ENABLED_CLOUD_PROVIDERS = ['dropbox', 'google_drive']
        response = api_client.get('/api/v1/cloud/providers/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 2
        provider_data = {p['name']: p for p in response.data}
        assert provider_data['dropbox']['is_connected'] is False
        assert provider_data['google_drive']['is_connected'] is False

    def test_list_providers_with_connection(self, api_client, settings, cloud_connection):
        settings.ENABLED_CLOUD_PROVIDERS = ['dropbox', 'google_drive']
        response = api_client.get('/api/v1/cloud/providers/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 2
        provider_data = {p['name']: p for p in response.data}
        assert provider_data['dropbox']['is_connected'] is True
        assert provider_data['google_drive']['is_connected'] is False


@pytest.mark.django_db
class TestCloudConnectionListView:
    def test_list_connections_unauthenticated(self, public_client):
        response = public_client.get('/api/v1/cloud/connections/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_connections_success(self, api_client, cloud_connection):
        response = api_client.get('/api/v1/cloud/connections/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['id'] == str(cloud_connection.id)
        assert response.data[0]['provider'] == 'dropbox'

    def test_list_connections_scoped_to_user(self, api_client, user2):
        # Create connection for user2
        CloudConnection.objects.create(user=user2, provider='dropbox', email='test2@dropbox.com')

        # api_client is for user, who has no connections
        response = api_client.get('/api/v1/cloud/connections/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 0


@pytest.mark.django_db
@patch('cloudfiles.views.cache')
@patch('cloudfiles.views.get_cloud_provider')
class TestDropboxConnectView:
    def test_connect_returns_auth_url(self, mock_get_provider, mock_cache, api_client, user):
        mock_provider_instance = MagicMock()
        mock_provider_instance.get_authorization_url.return_value = ('https://dropbox.com/oauth', 'test_state')
        mock_get_provider.return_value = mock_provider_instance

        response = api_client.get('/api/v1/cloud/connect/dropbox/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {'authorization_url': 'https://dropbox.com/oauth'}
        mock_get_provider.assert_called_once_with('dropbox')
        mock_provider_instance.get_authorization_url.assert_called_once()
        mock_cache.set.assert_called_once_with(f"dropbox_oauth_state_{user.id}", 'test_state', timeout=600)

    def test_connect_service_error(self, mock_get_provider, mock_cache, api_client):
        from cloudfiles.providers import CloudProviderError
        mock_get_provider.side_effect = CloudProviderError("Test error")

        response = api_client.get('/api/v1/cloud/connect/dropbox/')
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert response.data['detail'] == "Test error"


@pytest.mark.django_db
class TestDropboxCallbackView:
    @patch('cloudfiles.views.cache')
    @patch('cloudfiles.views.get_cloud_provider')
    def test_callback_success(self, mock_get_provider, mock_cache, api_client, user):
        mock_cache.get.return_value = 'test_state'
        mock_provider_instance = MagicMock()
        mock_provider_instance.handle_callback.return_value = {
            'access_token': 'new_access_token',
            'refresh_token': 'new_refresh_token',
            'expires_at': None
        }
        mock_provider_instance.get_user_info.return_value = {'email': 'user@dropbox.com'}
        mock_get_provider.return_value = mock_provider_instance

        data = {'code': 'test_code', 'state': 'test_state'}
        response = api_client.post('/api/v1/cloud/callback/dropbox/', data)

        assert response.status_code == status.HTTP_200_OK
        mock_cache.get.assert_called_once_with(f"dropbox_oauth_state_{user.id}")
        mock_cache.delete.assert_called_once_with(f"dropbox_oauth_state_{user.id}")

        assert CloudConnection.objects.filter(user=user, provider='dropbox').exists()
        connection = CloudConnection.objects.get(user=user, provider='dropbox')
        assert connection.access_token == 'new_access_token'
        assert connection.email == 'user@dropbox.com'

        mock_get_provider.assert_called_once_with('dropbox')
        mock_provider_instance.handle_callback.assert_called_once_with('test_code')
        mock_provider_instance.get_user_info.assert_called_once()

    @patch('cloudfiles.views.cache')
    def test_callback_invalid_state(self, mock_cache, api_client, user):
        mock_cache.get.return_value = 'different_state'
        data = {'code': 'test_code', 'state': 'test_state'}
        response = api_client.post('/api/v1/cloud/callback/dropbox/', data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Invalid state parameter' in response.data['detail']
        mock_cache.get.assert_called_once_with(f"dropbox_oauth_state_{user.id}")
        assert not mock_cache.delete.called
        assert not CloudConnection.objects.filter(user=user, provider='dropbox').exists()

    @patch('cloudfiles.views.cache')
    def test_callback_missing_state_in_cache(self, mock_cache, api_client, user):
        mock_cache.get.return_value = None
        data = {'code': 'test_code', 'state': 'test_state'}
        response = api_client.post('/api/v1/cloud/callback/dropbox/', data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Invalid state parameter' in response.data['detail']
        mock_cache.get.assert_called_once_with(f"dropbox_oauth_state_{user.id}")

    def test_callback_missing_payload(self, api_client):
        response = api_client.post('/api/v1/cloud/callback/dropbox/', {})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'code' in response.data
        assert 'state' in response.data


@pytest.mark.django_db
@patch('cloudfiles.views.cache')
@patch('cloudfiles.views.get_cloud_provider')
class TestGoogleDriveConnectView:
    def test_connect_returns_auth_url(self, mock_get_provider, mock_cache, api_client, user):
        mock_provider_instance = MagicMock()
        mock_provider_instance.get_authorization_url.return_value = ('https://accounts.google.com/oauth', 'test_state_google')
        mock_get_provider.return_value = mock_provider_instance

        response = api_client.get('/api/v1/cloud/connect/google_drive/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {'authorization_url': 'https://accounts.google.com/oauth'}
        mock_get_provider.assert_called_once_with('google_drive')
        mock_provider_instance.get_authorization_url.assert_called_once()
        mock_cache.set.assert_called_once_with(f"google_drive_oauth_state_{user.id}", 'test_state_google', timeout=600)

    def test_connect_service_error(self, mock_get_provider, mock_cache, api_client):
        from cloudfiles.providers import CloudProviderError
        mock_get_provider.side_effect = CloudProviderError("Google error")

        response = api_client.get('/api/v1/cloud/connect/google_drive/')
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert response.data['detail'] == "Google error"


@pytest.mark.django_db
class TestGoogleDriveCallbackView:
    @patch('cloudfiles.views.cache')
    @patch('cloudfiles.views.get_cloud_provider')
    def test_callback_success(self, mock_get_provider, mock_cache, api_client, user):
        mock_cache.get.return_value = 'test_state_google'
        mock_provider_instance = MagicMock()
        mock_provider_instance.handle_callback.return_value = {
            'access_token': 'google_access_token',
            'refresh_token': 'google_refresh_token',
            'expires_at': None
        }
        mock_provider_instance.get_user_info.return_value = {'email': 'user@google.com'}
        mock_get_provider.return_value = mock_provider_instance

        data = {'code': 'google_code', 'state': 'test_state_google'}
        response = api_client.post('/api/v1/cloud/callback/google_drive/', data)

        assert response.status_code == status.HTTP_200_OK
        mock_cache.get.assert_called_once_with(f"google_drive_oauth_state_{user.id}")
        mock_cache.delete.assert_called_once_with(f"google_drive_oauth_state_{user.id}")

        assert CloudConnection.objects.filter(user=user, provider='google_drive').exists()
        connection = CloudConnection.objects.get(user=user, provider='google_drive')
        assert connection.access_token == 'google_access_token'
        assert connection.email == 'user@google.com'

        mock_get_provider.assert_called_once_with('google_drive')
        mock_provider_instance.handle_callback.assert_called_once_with('google_code')
        mock_provider_instance.get_user_info.assert_called_once()

    @patch('cloudfiles.views.cache')
    def test_callback_invalid_state(self, mock_cache, api_client, user):
        mock_cache.get.return_value = 'different_state'
        data = {'code': 'google_code', 'state': 'test_state_google'}
        response = api_client.post('/api/v1/cloud/callback/google_drive/', data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Invalid state parameter' in response.data['detail']
        mock_cache.get.assert_called_once_with(f"google_drive_oauth_state_{user.id}")
        assert not mock_cache.delete.called
        assert not CloudConnection.objects.filter(user=user, provider='google_drive').exists()

    @patch('cloudfiles.views.cache')
    def test_callback_missing_state_in_cache(self, mock_cache, api_client, user):
        mock_cache.get.return_value = None
        data = {'code': 'google_code', 'state': 'test_state_google'}
        response = api_client.post('/api/v1/cloud/callback/google_drive/', data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Invalid state parameter' in response.data['detail']
        mock_cache.get.assert_called_once_with(f"google_drive_oauth_state_{user.id}")

    def test_callback_missing_payload(self, api_client):
        response = api_client.post('/api/v1/cloud/callback/google_drive/', {})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'code' in response.data
        assert 'state' in response.data


@pytest.mark.django_db
@patch('cloudfiles.views.cache')
@patch('cloudfiles.views.get_cloud_provider')
class TestNextcloudConnectView:
    def test_connect_returns_auth_url(self, mock_get_provider, mock_cache, api_client, user):
        mock_provider_instance = MagicMock()
        mock_provider_instance.get_authorization_url.return_value = ('https://cloud.example.com/oauth', 'test_state_nextcloud')
        mock_get_provider.return_value = mock_provider_instance

        response = api_client.get('/api/v1/cloud/connect/nextcloud/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {'authorization_url': 'https://cloud.example.com/oauth'}
        mock_get_provider.assert_called_once_with('nextcloud')
        mock_provider_instance.get_authorization_url.assert_called_once()
        mock_cache.set.assert_called_once_with(f"nextcloud_oauth_state_{user.id}", 'test_state_nextcloud', timeout=600)

    def test_connect_service_error(self, mock_get_provider, mock_cache, api_client):
        from cloudfiles.providers import CloudProviderError
        mock_get_provider.side_effect = CloudProviderError("Nextcloud error")

        response = api_client.get('/api/v1/cloud/connect/nextcloud/')
        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert response.data['detail'] == "Nextcloud error"


@pytest.mark.django_db
class TestNextcloudCallbackView:
    @patch('cloudfiles.views.cache')
    @patch('cloudfiles.views.get_cloud_provider')
    def test_callback_success(self, mock_get_provider, mock_cache, api_client, user):
        mock_cache.get.return_value = 'test_state_nextcloud'
        mock_provider_instance = MagicMock()
        mock_provider_instance.handle_callback.return_value = {
            'access_token': 'nextcloud_access_token',
            'refresh_token': 'nextcloud_refresh_token',
            'expires_at': None
        }
        mock_provider_instance.get_user_info.return_value = {'email': 'user@nextcloud.com'}
        mock_get_provider.return_value = mock_provider_instance

        data = {'code': 'nextcloud_code', 'state': 'test_state_nextcloud'}
        response = api_client.post('/api/v1/cloud/callback/nextcloud/', data)

        assert response.status_code == status.HTTP_200_OK
        mock_cache.get.assert_called_once_with(f"nextcloud_oauth_state_{user.id}")
        mock_cache.delete.assert_called_once_with(f"nextcloud_oauth_state_{user.id}")

        assert CloudConnection.objects.filter(user=user, provider='nextcloud').exists()
        connection = CloudConnection.objects.get(user=user, provider='nextcloud')
        assert connection.access_token == 'nextcloud_access_token'
        assert connection.email == 'user@nextcloud.com'

        mock_get_provider.assert_called_once_with('nextcloud')
        mock_provider_instance.handle_callback.assert_called_once_with('nextcloud_code')
        mock_provider_instance.get_user_info.assert_called_once()

    @patch('cloudfiles.views.cache')
    def test_callback_invalid_state(self, mock_cache, api_client, user):
        mock_cache.get.return_value = 'different_state'
        data = {'code': 'nextcloud_code', 'state': 'test_state_nextcloud'}
        response = api_client.post('/api/v1/cloud/callback/nextcloud/', data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Invalid state parameter' in response.data['detail']
        mock_cache.get.assert_called_once_with(f"nextcloud_oauth_state_{user.id}")
        assert not mock_cache.delete.called
        assert not CloudConnection.objects.filter(user=user, provider='nextcloud').exists()

    @patch('cloudfiles.views.cache')
    def test_callback_missing_state_in_cache(self, mock_cache, api_client, user):
        mock_cache.get.return_value = None
        data = {'code': 'nextcloud_code', 'state': 'test_state_nextcloud'}
        response = api_client.post('/api/v1/cloud/callback/nextcloud/', data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Invalid state parameter' in response.data['detail']
        mock_cache.get.assert_called_once_with(f"nextcloud_oauth_state_{user.id}")

    def test_callback_missing_payload(self, api_client):
        response = api_client.post('/api/v1/cloud/callback/nextcloud/', {})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'code' in response.data
        assert 'state' in response.data


@pytest.mark.django_db
@patch('cloudfiles.views.get_cloud_provider')
class TestCloudFileListView:
    def test_list_files_success(self, mock_get_provider, api_client, cloud_connection):
        mock_provider_instance = MagicMock()
        mock_provider_instance.list_files.return_value = [{'id': 'file1', 'name': 'test.pdf', 'type': 'file'}]
        mock_get_provider.return_value = mock_provider_instance

        url = f'/api/v1/cloud/connections/{cloud_connection.id}/list/'
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['name'] == 'test.pdf'
        mock_get_provider.assert_called_once_with('dropbox', connection=cloud_connection)
        mock_provider_instance.list_files.assert_called_once_with('/')

    def test_list_files_permission_denied(self, mock_get_provider, api_client, user2):
        other_user_conn = CloudConnection.objects.create(user=user2, provider='dropbox')
        url = f'/api/v1/cloud/connections/{other_user_conn.id}/list/'
        response = api_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND
        mock_get_provider.assert_not_called()


@pytest.mark.django_db
@patch('cloudfiles.services.import_from_cloud_task.delay')
class TestCloudImportView:
    @pytest.mark.parametrize(
        "connection_fixture_name, expected_folder_name",
        [
            ('cloud_connection', 'Dropbox Imports'),
            ('google_drive_connection', 'Google Drive Imports'),
            ('nextcloud_connection', 'Nextcloud Imports')
        ]
    )
    def test_import_file_success(self, mock_task_delay, api_client, user, connection_fixture_name, expected_folder_name, request):
        connection = request.getfixturevalue(connection_fixture_name)
        url = f'/api/v1/cloud/connections/{connection.id}/import/'
        data = {
            'file_id': '/test.pdf',
            'file_name': 'test.pdf',
            'file_size': 1024
        }
        response = api_client.post(url, data)

        assert response.status_code == status.HTTP_202_ACCEPTED
        assert Document.objects.filter(created_by=user, name='test.pdf').exists()

        doc = Document.objects.get(name='test.pdf')
        assert doc.status == 'uploading'

        # Check that the import folder was created
        assert Folder.objects.filter(name=expected_folder_name, created_by=user).exists()
        import_folder = Folder.objects.get(name=expected_folder_name)
        assert doc.folder == import_folder

        mock_task_delay.assert_called_once_with(doc.id, connection.id, '/test.pdf')

    def test_import_file_too_large(self, mock_task_delay, api_client, cloud_connection):
        AppConfiguration.objects.update_or_create(key='FILE_SIZE_QUOTA_MB', defaults={'value': '0'})

        url = f'/api/v1/cloud/connections/{cloud_connection.id}/import/'
        data = {
            'file_id': '/large.pdf',
            'file_name': 'large.pdf',
            'file_size': 101 * 1024 * 1024  # > 100MB
        }
        response = api_client.post(url, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'exceed 100MB' in response.data['detail']
        mock_task_delay.assert_not_called()

    def test_import_file_permission_denied(self, mock_task_delay, api_client, user2):
        other_user_conn = CloudConnection.objects.create(user=user2, provider='dropbox')
        url = f'/api/v1/cloud/connections/{other_user_conn.id}/import/'
        data = {
            'file_id': '/test.pdf',
            'file_name': 'test.pdf',
            'file_size': 1024
        }
        response = api_client.post(url, data)
        assert response.status_code == status.HTTP_404_NOT_FOUND
        mock_task_delay.assert_not_called()

    def test_import_file_respects_quota(self, mock_task_delay, api_client, cloud_connection, user):
        """Test that the cloud import endpoint rejects imports that would exceed the quota."""
        AppConfiguration.objects.update_or_create(key='FILE_SIZE_QUOTA_MB', defaults={'value': '1'})
        user.total_document_size = 0
        user.save()

        url = f'/api/v1/cloud/connections/{cloud_connection.id}/import/'

        # This should fail (2MB > 1MB)
        data_fail = {
            'file_id': '/large.pdf',
            'file_name': 'large.pdf',
            'file_size': 2 * 1024 * 1024
        }
        response_fail = api_client.post(url, data_fail)

        assert response_fail.status_code == status.HTTP_400_BAD_REQUEST
        assert "exceed your storage quota" in response_fail.data['detail']
        mock_task_delay.assert_not_called()

        # This should succeed (0.5MB < 1MB)
        data_ok = {
            'file_id': '/small.pdf',
            'file_name': 'small.pdf',
            'file_size': 512 * 1024
        }
        response_ok = api_client.post(url, data_ok)
        assert response_ok.status_code == status.HTTP_202_ACCEPTED
        mock_task_delay.assert_called_once()


@pytest.mark.django_db
@patch('cloudfiles.views.get_cloud_provider')
class TestCloudConnectionDeleteView:
    def test_delete_connection_success(self, mock_get_provider, api_client, cloud_connection):
        mock_provider_instance = MagicMock()
        mock_get_provider.return_value = mock_provider_instance

        url = f'/api/v1/cloud/connections/{cloud_connection.id}/'
        response = api_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not CloudConnection.objects.filter(id=cloud_connection.id).exists()
        mock_get_provider.assert_called_once()
        args, kwargs = mock_get_provider.call_args
        assert args[0] == 'dropbox'
        assert isinstance(kwargs['connection'], CloudConnection)
        mock_provider_instance.revoke_token.assert_called_once()

    def test_delete_connection_not_found(self, mock_get_provider, api_client):
        url = '/api/v1/cloud/connections/01J4Z7YJ8ZJ4Z7YJ8ZJ4Z7YJ8Z/'
        response = api_client.delete(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND
        mock_get_provider.assert_not_called()

    def test_delete_connection_permission_denied(self, mock_get_provider, api_client, user2):
        other_connection = CloudConnection.objects.create(
            user=user2,
            provider='dropbox',
            email='other@dropbox.com',
            access_token='other_token'
        )
        url = f'/api/v1/cloud/connections/{other_connection.id}/'
        response = api_client.delete(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert CloudConnection.objects.filter(id=other_connection.id).exists()
        mock_get_provider.assert_not_called()

    def test_delete_connection_best_effort_revocation(self, mock_get_provider, api_client, cloud_connection):
        mock_provider_instance = MagicMock()
        mock_provider_instance.revoke_token.side_effect = Exception("Revocation endpoint down")
        mock_get_provider.return_value = mock_provider_instance

        url = f'/api/v1/cloud/connections/{cloud_connection.id}/'
        response = api_client.delete(url)

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not CloudConnection.objects.filter(id=cloud_connection.id).exists()
        mock_get_provider.assert_called_once()
        args, kwargs = mock_get_provider.call_args
        assert args[0] == 'dropbox'
        assert isinstance(kwargs['connection'], CloudConnection)
        mock_provider_instance.revoke_token.assert_called_once()

    def test_delete_connection_requires_auth(self, mock_get_provider, cloud_connection):
        from rest_framework.test import APIClient
        anon_client = APIClient()
        url = f'/api/v1/cloud/connections/{cloud_connection.id}/'
        response = anon_client.delete(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert CloudConnection.objects.filter(id=cloud_connection.id).exists()
        mock_get_provider.assert_not_called()


@pytest.mark.django_db
@patch('cloudfiles.views.import_from_cloud_task.delay')
class TestCloudRefreshView:
    def test_refresh_with_reconnected_cloud_connection(self, mock_task_delay, api_client, user):
        """
        Test that when a cloud connection is deleted (disconnected) and a new connection
        is created (reconnected), refreshing an old document imported under the deleted connection_id
        successfully falls back to the user's active connection for that provider.
        """
        # 1. Create original cloud connection and import document
        old_connection = CloudConnection.objects.create(
            user=user,
            provider='google_drive',
            email='user@gmail.com',
            access_token='old_token',
        )
        old_conn_id = str(old_connection.id)

        document = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name='Test Drive Doc.pdf',
            status='ready',
            file_size=1024,
        )

        DocumentVersion.objects.create(
            document=document,
            version_number=1,
            file_size=1024,
            is_primary=True,
            metadata={
                "cloud_import": {
                    "provider": "google_drive",
                    "provider_display": "Google Drive",
                    "connection_id": old_conn_id,
                    "file_id": "google_drive_file_123"
                }
            }
        )

        # 2. Simulate disconnect by deleting old_connection
        old_connection.delete()

        # 3. Simulate reconnect by creating a new CloudConnection for the same user and provider
        new_connection = CloudConnection.objects.create(
            user=user,
            provider='google_drive',
            email='user@gmail.com',
            access_token='new_token',
        )
        new_conn_id = str(new_connection.id)
        assert new_conn_id != old_conn_id

        # 4. Trigger refresh endpoint
        url = f'/api/v1/cloud/documents/{document.id}/refresh/'
        response = api_client.post(url)

        # Assertion: Should return 202 ACCEPTED using the fallback active connection
        assert response.status_code == status.HTTP_202_ACCEPTED
        mock_task_delay.assert_called_once()
        assert mock_task_delay.call_args[0][1] == new_connection.id


@pytest.mark.django_db
def test_refresh_soft_deleted_document_returns_404(api_client, user):
    """
    RED Test: Verify that cloud refresh requests for soft-deleted documents return 404.
    """
    connection = CloudConnection.objects.create(
        user=user,
        provider='google_drive',
        email='user@gmail.com',
        access_token='token_123',
    )

    doc = Document.objects.create(
        name="TrashedCloudDoc.pdf",
        organization=user.organization,
        created_by=user,
        status="ready",
        file_size=1024,
    )
    DocumentVersion.objects.create(
        document=doc,
        version_number=1,
        file_size=1024,
        is_primary=True,
        metadata={
            "cloud_import": {
                "provider": "google_drive",
                "connection_id": connection.id,
                "file_id": "file_123"
            }
        }
    )

    # Force authenticate
    api_client.force_authenticate(user=user)

    # Soft delete doc
    api_client.delete(f'/api/v1/documents/{doc.id}/')

    # Try refresh
    url = f'/api/v1/cloud/documents/{doc.id}/refresh/'
    res = api_client.post(url)
    assert res.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
@patch('documents.services.fileserver_client.delete_file')
@patch('cloudfiles.services.import_from_cloud_task.delay')
def test_cloud_import_premature_deletion_quota_accounting(mock_task, mock_fs_delete, api_client, user):
    """
    RED Test: Initiating a cloud import and deleting the document before download
    must not result in a negative total_document_size for the user.
    """
    connection = CloudConnection.objects.create(
        user=user,
        provider='google_drive',
        email='import_user@gmail.com',
        access_token='token_123',
    )
    user.total_document_size = 0
    user.save()

    api_client.force_authenticate(user=user)
    import_url = f'/api/v1/cloud/connections/{connection.id}/import/'
    file_size = 102656

    # 1. Initiate cloud import
    res = api_client.post(import_url, {
        'file_id': 'cloud_file_123',
        'file_name': 'sample.pdf',
        'file_size': file_size
    })
    assert res.status_code == status.HTTP_202_ACCEPTED
    doc_id = res.data['id']

    # User's quota must reflect the imported document
    user.refresh_from_db()
    assert user.total_document_size == file_size

    # 2. Prematurely delete the document (before download finishes)
    doc = Document.objects.get(id=doc_id)
    delete_document_and_files(doc)

    user.refresh_from_db()
    assert user.total_document_size == 0


@pytest.mark.django_db
@patch('documents.services.fileserver_client.delete_file')
@patch('cloudfiles.services.import_from_cloud_task.delay')
def test_cloud_import_process_imported_file_near_quota_limit(mock_task, mock_fs_delete, api_client, user):
    """
    Test that process_imported_file does not double-count declared document size
    when verifying user quota upon download completion.
    """
    # Set user quota to 10MB, with 9MB already used
    user.custom_file_size_quota_mb = 10
    used_bytes = 9 * 1024 * 1024
    user.total_document_size = used_bytes
    user.save()

    # Import a 600KB file (0.6MB). 9MB + 0.6MB = 9.6MB <= 10MB (Valid!)
    import_size = 600 * 1024
    connection = CloudConnection.objects.create(
        user=user,
        provider='google_drive',
        email='import_limit@gmail.com',
        access_token='token_123',
    )

    doc = create_document_for_import(
        requesting_user=user,
        file_name='near_limit.pdf',
        file_size=import_size,
        connection=connection,
        file_id_or_path='cloud_file_near_limit',
    )

    # Quota is now 9.6MB
    user.refresh_from_db()
    assert user.total_document_size == used_bytes + import_size

    import io
    # Simulate download completing with the exact actual size
    file_data = {
        'name': 'near_limit.pdf',
        'content': io.BytesIO(b'dummy content'),
        'size': import_size,
        'etag_or_rev': 'rev_123',
    }

    with patch('requests.put') as mock_put, patch('documents.services.fileserver_client.generate_upload_url', return_value='http://test/upload'):
        mock_put.return_value.raise_for_status = MagicMock()
        # This should succeed without raising QuotaExceededError
        process_imported_file(doc, file_data)

    user.refresh_from_db()
    assert user.total_document_size == used_bytes + import_size


@pytest.mark.django_db
def test_cloud_import_negative_file_size_rejected(api_client, user):
    """
    Test that negative file_size in cloud import is rejected with 400.
    """
    connection = CloudConnection.objects.create(
        user=user,
        provider='google_drive',
        email='neg_user@gmail.com',
        access_token='token_neg',
    )
    api_client.force_authenticate(user=user)
    import_url = f'/api/v1/cloud/connections/{connection.id}/import/'

    res = api_client.post(import_url, {
        'file_id': 'cloud_file_neg',
        'file_name': 'sample.pdf',
        'file_size': -500
    })
    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert 'file_size' in res.data


@pytest.mark.django_db
def test_cloud_import_version_negative_file_size_rejected(api_client, user):
    """
    Test that negative file_size in cloud import version is rejected with 400.
    """
    connection = CloudConnection.objects.create(
        user=user,
        provider='google_drive',
        email='neg_ver_user@gmail.com',
        access_token='token_neg_ver',
    )
    doc = Document.objects.create(
        organization=user.organization,
        created_by=user,
        name='existing.pdf',
        status='ready',
        file_size=1000,
    )
    DocumentVersion.objects.create(
        document=doc,
        version_number=1,
        file_size=1000,
        is_primary=True,
    )
    api_client.force_authenticate(user=user)
    import_version_url = f'/api/v1/cloud/documents/{doc.id}/import_version/'

    res = api_client.post(import_version_url, {
        'connection_id': str(connection.id),
        'file_id': 'cloud_file_neg_ver',
        'file_name': 'existing.pdf',
        'file_size': -500
    })
    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert 'file_size' in res.data


@pytest.mark.django_db
@patch('documents.services.fileserver_client.delete_file')
@patch('cloudfiles.services.import_from_cloud_task.delay')
def test_cloud_import_quota_exceeded_on_process_does_not_dangle_storage_key(mock_task, mock_fs_delete, api_client, user):
    """
    Test that when actual file size exceeds user quota during process_imported_file,
    the version row does not retain a storage_key pointing to the deleted storage object.
    """
    import io
    from documents.services import QuotaExceededError

    user.custom_file_size_quota_mb = 10
    user.total_document_size = 9 * 1024 * 1024
    user.save()

    connection = CloudConnection.objects.create(
        user=user,
        provider='google_drive',
        email='quota_fail@gmail.com',
        access_token='token_123',
    )

    doc = create_document_for_import(
        requesting_user=user,
        file_name='quota_fail.pdf',
        file_size=500 * 1024,
        connection=connection,
        file_id_or_path='cloud_file_quota_fail',
    )

    # Actual download size is 2MB (9MB + 2MB = 11MB > 10MB limit)
    actual_size = 2 * 1024 * 1024
    file_data = {
        'name': 'quota_fail.pdf',
        'content': io.BytesIO(b'large content'),
        'size': actual_size,
        'etag_or_rev': 'rev_fail',
    }

    with patch('requests.put') as mock_put, patch('documents.services.fileserver_client.generate_upload_url', return_value='http://test/upload'):
        mock_put.return_value.raise_for_status = MagicMock()
        with pytest.raises(QuotaExceededError):
            process_imported_file(doc, file_data)

    mock_fs_delete.assert_called_once()

    # The version should not have original_storage_key or storage_key persisted
    v1 = doc.versions.get(version_number=1)
    assert not v1.storage_key
    assert not v1.original_storage_key


