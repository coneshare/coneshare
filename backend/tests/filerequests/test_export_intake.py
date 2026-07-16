import pytest
from unittest.mock import patch, MagicMock
from rest_framework import status

from cloudfiles.models import CloudConnection
from documents.models import Document, DocumentVersion, Folder
from filerequests.models import FileRequest, UploadedFile, SecurityThreatEvent, UploadExportJob
from filerequests.tasks import export_upload_to_cloud_task

pytestmark = pytest.mark.django_db


@pytest.fixture
def cloud_connection(user):
    return CloudConnection.objects.create(
        user=user,
        provider='dropbox',
        email='test@dropbox.com',
        access_token='test_access_token',
    )


@pytest.fixture
def file_request(user, organization):
    root_folder = Folder.objects.get_root_for_org(organization)
    return FileRequest.objects.create(
        folder=root_folder,
        created_by=user,
        name="Test File Request"
    )


@pytest.fixture
def uploaded_file(file_request, user, organization):
    doc = Document.objects.create(
        organization=organization,
        created_by=user,
        name="test_upload.pdf",
        status="ready"
    )
    DocumentVersion.objects.create(
        document=doc,
        version_number=1,
        is_primary=True,
        original_storage_key="test/key"
    )
    return UploadedFile.objects.create(
        file_request=file_request,
        document=doc,
        uploader_name="External Sender",
        uploader_email="sender@external.com"
    )


class TestCloudFolderListEndpoint:
    @patch('cloudfiles.views.get_cloud_provider')
    def test_get_folders_only(self, mock_get_provider, api_client, cloud_connection):
        mock_provider = MagicMock()
        mock_provider.list_files.return_value = [
            {'id': '1', 'name': 'Folder A', 'type': 'folder'},
            {'id': '2', 'name': 'file1.txt', 'type': 'file'},
            {'id': '3', 'name': 'Folder B', 'type': 'folder'},
        ]
        mock_get_provider.return_value = mock_provider

        response = api_client.get(f'/api/v1/cloud/connections/{cloud_connection.id}/folders/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 2
        assert response.data[0]['name'] == 'Folder A'
        assert response.data[1]['name'] == 'Folder B'


class TestFileRequestExportAPI:
    @patch('filerequests.views.export_upload_to_cloud_task.delay')
    def test_export_uploads_success(self, mock_task_delay, api_client, file_request, uploaded_file, cloud_connection):
        data = {
            "connection_id": str(cloud_connection.id),
            "uploaded_file_ids": [str(uploaded_file.id)],
            "destination_folder_id": "dropbox_folder_id"
        }
        response = api_client.post(f'/api/v1/file-requests/{file_request.id}/exports/', data, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert len(response.data) == 1
        assert response.data[0]['status'] == 'queued'
        assert response.data[0]['destination_folder_id'] == "dropbox_folder_id"
        assert UploadExportJob.objects.count() == 1
        mock_task_delay.assert_called_once()

    def test_export_uploads_unauthorized(self, api_client, user2, file_request, uploaded_file, cloud_connection):
        api_client.force_authenticate(user=user2)
        data = {
            "connection_id": str(cloud_connection.id),
            "uploaded_file_ids": [str(uploaded_file.id)],
            "destination_folder_id": "dropbox_folder_id"
        }
        # user2 does not own the file request
        response = api_client.post(f'/api/v1/file-requests/{file_request.id}/exports/', data, format='json')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_export_uploads_invalid_connection(self, api_client, file_request, uploaded_file):
        data = {
            "connection_id": "01KXA3D7J74QVARP2CQ0CH1KEH",  # Valid ULID format but doesn't exist
            "uploaded_file_ids": [str(uploaded_file.id)],
            "destination_folder_id": "folder"
        }
        response = api_client.post(f'/api/v1/file-requests/{file_request.id}/exports/', data, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'connection_id' in response.data

    def test_list_exports_history(self, api_client, file_request, uploaded_file, cloud_connection):
        UploadExportJob.objects.create(
            uploaded_file=uploaded_file,
            connection=cloud_connection,
            destination_folder_id="dest",
            status=UploadExportJob.Status.EXPORTED
        )
        response = api_client.get(f'/api/v1/file-requests/{file_request.id}/exports/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['status'] == 'exported'

    def test_export_uploads_blocked_when_document_not_ready(self, api_client, file_request, uploaded_file, cloud_connection):
        uploaded_file.document.status = 'uploading'
        uploaded_file.document.save()

        data = {
            "connection_id": str(cloud_connection.id),
            "uploaded_file_ids": [str(uploaded_file.id)],
            "destination_folder_id": "dropbox_folder_id"
        }
        response = api_client.post(f'/api/v1/file-requests/{file_request.id}/exports/', data, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "still being processed or scanned" in response.data['detail']

    @patch('filerequests.views.export_upload_to_cloud_task.delay')
    def test_export_uploads_supports_duplicate_ids_in_payload(self, mock_task_delay, api_client, file_request, uploaded_file, cloud_connection):
        data = {
            "connection_id": str(cloud_connection.id),
            "uploaded_file_ids": [str(uploaded_file.id), str(uploaded_file.id)], # Duplicate ID
            "destination_folder_id": "dropbox_folder_id"
        }
        response = api_client.post(f'/api/v1/file-requests/{file_request.id}/exports/', data, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert len(response.data) == 1
        assert mock_task_delay.call_count == 1


class TestExportCeleryTask:
    @patch('filerequests.tasks.get_cloud_provider')
    @patch('filerequests.tasks.fileserver_client')
    @patch('filerequests.tasks.requests.get')
    def test_export_task_success(self, mock_get, mock_fileserver, mock_get_provider, uploaded_file, cloud_connection):
        job = UploadExportJob.objects.create(
            uploaded_file=uploaded_file,
            connection=cloud_connection,
            destination_folder_id="dropbox_dest",
            status=UploadExportJob.Status.QUEUED
        )

        mock_fileserver.generate_download_url.return_value = "http://internal-fileserver/download/key"
        
        # Mock requests.get response
        mock_response = MagicMock()
        mock_response.iter_content.return_value = [b"chunk1", b"chunk2"]
        mock_get.return_value.__enter__.return_value = mock_response

        # Mock cloud provider upload_file
        mock_provider = MagicMock()
        mock_provider.upload_file.return_value = "remote_file_123"
        mock_get_provider.return_value = mock_provider

        export_upload_to_cloud_task(job.id)

        job.refresh_from_db()
        assert job.status == UploadExportJob.Status.EXPORTED
        assert job.provider_file_id == "remote_file_123"
        assert job.error_message == ""
        mock_provider.upload_file.assert_called_once()

    @patch('filerequests.tasks.get_cloud_provider')
    def test_export_task_blocked_by_scanning_status(self, mock_get_provider, uploaded_file, cloud_connection):
        # Set doc status to uploading (not ready)
        doc = uploaded_file.document
        doc.status = 'uploading'
        doc.save()

        job = UploadExportJob.objects.create(
            uploaded_file=uploaded_file,
            connection=cloud_connection,
            destination_folder_id="dropbox_dest",
            status=UploadExportJob.Status.QUEUED
        )

        export_upload_to_cloud_task(job.id)

        job.refresh_from_db()
        assert job.status == UploadExportJob.Status.BLOCKED_SCAN
        assert "Security check not satisfied" in job.error_message

    @patch('filerequests.tasks.get_cloud_provider')
    def test_export_task_blocked_by_threat_event(self, mock_get_provider, uploaded_file, cloud_connection):
        # Unresolved threat event
        SecurityThreatEvent.objects.create(
            organization=uploaded_file.file_request.folder.organization,
            owner_user=uploaded_file.file_request.created_by,
            file_request=uploaded_file.file_request,
            event_type=SecurityThreatEvent.EventType.MALWARE_DETECTED,
            severity=SecurityThreatEvent.Severity.HIGH,
            status=SecurityThreatEvent.Status.NEW,
            file_name=uploaded_file.document.name
        )

        job = UploadExportJob.objects.create(
            uploaded_file=uploaded_file,
            connection=cloud_connection,
            destination_folder_id="dropbox_dest",
            status=UploadExportJob.Status.QUEUED
        )

        export_upload_to_cloud_task(job.id)

        job.refresh_from_db()
        assert job.status == UploadExportJob.Status.BLOCKED_SCAN
        assert "unresolved security threat event" in job.error_message
