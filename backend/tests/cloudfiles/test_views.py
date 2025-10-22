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
@patch('cloudfiles.views.get_cloud_service')
class TestDropboxAuthViews:
    def test_connect_redirects(self, mock_get_service, api_client):
        mock_service_instance = MagicMock()
        mock_service_instance.get_authorization_url.return_value = 'https://dropbox.com/oauth'
        mock_get_service.return_value = mock_service_instance

        response = api_client.get('/api/v1/cloud/connect/dropbox/')

        assert response.status_code == status.HTTP_302_FOUND
        assert response.url == 'https://dropbox.com/oauth'
        mock_get_service.assert_called_once_with('dropbox')

    def test_callback_success(self, mock_get_service, api_client, user):
        mock_service_instance = MagicMock()
        mock_service_instance.handle_callback.return_value = {
            'access_token': 'new_access_token',
            'refresh_token': 'new_refresh_token',
            'expires_at': None
        }
        mock_service_instance.get_user_info.return_value = {'email': 'user@dropbox.com'}
        mock_get_service.return_value = mock_service_instance

        response = api_client.get('/api/v1/cloud/callback/dropbox/')

        assert response.status_code == status.HTTP_200_OK
        assert CloudConnection.objects.filter(user=user, provider='dropbox').exists()
        connection = CloudConnection.objects.get(user=user, provider='dropbox')
        assert connection.access_token == 'new_access_token'
        assert connection.email == 'user@dropbox.com'
        mock_get_service.assert_called_once_with('dropbox')
        mock_service_instance.handle_callback.assert_called_once()
        mock_service_instance.get_user_info.assert_called_once()


@pytest.mark.django_db
@patch('cloudfiles.views.get_cloud_service')
class TestCloudFileListView:
    def test_list_files_success(self, mock_get_service, api_client, cloud_connection):
        mock_service_instance = MagicMock()
        mock_service_instance.list_files.return_value = [{'id': 'file1', 'name': 'test.pdf', 'type': 'file'}]
        mock_get_service.return_value = mock_service_instance

        url = f'/api/v1/cloud/connections/{cloud_connection.id}/list/'
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['name'] == 'test.pdf'
        mock_get_service.assert_called_once_with('dropbox', connection=cloud_connection)
        mock_service_instance.list_files.assert_called_once_with('/')

    def test_list_files_permission_denied(self, mock_get_service, api_client, user2):
        other_user_conn = CloudConnection.objects.create(user=user2, provider='dropbox')
        url = f'/api/v1/cloud/connections/{other_user_conn.id}/list/'
        response = api_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND
        mock_get_service.assert_not_called()


@pytest.mark.django_db
@patch('cloudfiles.services.import_from_cloud_task.delay')
class TestCloudImportView:
    def test_import_file_success(self, mock_task_delay, api_client, cloud_connection, user):
        url = f'/api/v1/cloud/connections/{cloud_connection.id}/import/'
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
        assert Folder.objects.filter(name='Dropbox Imports', created_by=user).exists()
        import_folder = Folder.objects.get(name='Dropbox Imports')
        assert doc.folder == import_folder

        mock_task_delay.assert_called_once_with(doc.id, cloud_connection.id, '/test.pdf')

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
