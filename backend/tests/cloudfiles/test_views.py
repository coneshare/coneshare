import pytest
from unittest.mock import patch, MagicMock
from rest_framework import status

from cloudfiles.models import CloudConnection
from documents.models import Document, Folder


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
