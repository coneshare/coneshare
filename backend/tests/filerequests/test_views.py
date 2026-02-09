import pytest
from unittest.mock import patch
from rest_framework import status
from django.utils import timezone
from datetime import timedelta

from documents.models import Document, Folder
from filerequests.models import FileRequest

pytestmark = pytest.mark.django_db


class TestFileRequestViewSet:
    def test_create_file_request_success(self, api_client, user, organization):
        """Test a user can create a file request for their own folder."""
        root_folder = Folder.objects.get_root_for_org(organization)
        data = {
            "name": "Q1 Reports Upload",
            "folder": str(root_folder.id),
        }
        response = api_client.post('/api/v1/file-requests/', data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == "Q1 Reports Upload"
        assert response.data['folder_name'] == "__root__"
        assert FileRequest.objects.count() == 1

    def test_create_file_request_for_other_user_folder_fails(self, api_client, user2, organization):
        """Test a user cannot create a file request for a folder they don't own."""
        other_user_folder = Folder.objects.create(name="User2 Folder", created_by=user2, organization=organization)
        data = {
            "name": "Illegal Upload",
            "folder": str(other_user_folder.id),
        }
        response = api_client.post('/api/v1/file-requests/', data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "You can only create file requests for your own folders" in str(response.data)

    def test_list_file_requests_is_scoped_to_user(self, api_client, user, user2, organization):
        """Test that listing file requests only returns items created by the authenticated user."""
        root_folder = Folder.objects.get_root_for_org(organization)
        FileRequest.objects.create(name="My Request", folder=root_folder, created_by=user)
        FileRequest.objects.create(name="Other Request", folder=root_folder, created_by=user2)

        response = api_client.get('/api/v1/file-requests/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['name'] == "My Request"

    def test_update_file_request(self, api_client, file_request):
        """Test that a user can update their own file request."""
        new_name = "Updated Name"
        expires_at = timezone.now() + timedelta(days=7)
        data = {
            "name": new_name,
            "expires_at": expires_at.isoformat(),
        }
        response = api_client.patch(f'/api/v1/file-requests/{file_request.id}/', data)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == new_name
        
        file_request.refresh_from_db()
        assert file_request.name == new_name
        assert file_request.expires_at is not None

    def test_delete_file_request(self, api_client, file_request):
        """Test that a user can delete their own file request."""
        response = api_client.delete(f'/api/v1/file-requests/{file_request.id}/')
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not FileRequest.objects.filter(id=file_request.id).exists()


class TestPublicFileRequestViews:
    def test_get_public_details_success(self, public_client, file_request):
        """Test retrieving public details of an active file request."""
        file_request.name = "Public Name"
        file_request.save()
        url = f'/api/v1/public/file-requests/{file_request.slug}/'
        response = public_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == "Public Name"

    def test_get_public_details_inactive(self, public_client, file_request):
        """Test an inactive file request returns 404."""
        file_request.is_active = False
        file_request.save()
        url = f'/api/v1/public/file-requests/{file_request.slug}/'
        response = public_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_public_details_expired(self, public_client, file_request):
        """Test an expired file request returns 410."""
        file_request.expires_at = timezone.now() - timedelta(days=1)
        file_request.save()
        url = f'/api/v1/public/file-requests/{file_request.slug}/'
        response = public_client.get(url)
        assert response.status_code == status.HTTP_410_GONE

    @patch('filerequests.views.fileserver_client.generate_upload_url')
    def test_request_upload_url_success(self, mock_generate_url, public_client, file_request):
        """Test successfully requesting an upload URL."""
        mock_generate_url.return_value = "http://fileserver/upload/token"
        url = f'/api/v1/public/file-requests/{file_request.slug}/request-upload/'
        data = {'file_name': 'test.pdf', 'file_size': 12345}
        response = public_client.post(url, data)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['upload_url'] == "http://fileserver/upload/token"
        assert 'storage_key' in response.data
        assert 'unique_name' in response.data
        mock_generate_url.assert_called_once()

    @patch('filerequests.views.fileserver_client.generate_upload_url')
    def test_request_upload_url_with_string_file_size(self, mock_generate_url, public_client, file_request):
        """Test that file_size as a string is handled correctly."""
        mock_generate_url.return_value = "http://fileserver/upload/token"
        url = f'/api/v1/public/file-requests/{file_request.slug}/request-upload/'
        data = {'file_name': 'test.pdf', 'file_size': '12345'}  # file_size as string
        response = public_client.post(url, data)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['upload_url'] == "http://fileserver/upload/token"
        
    def test_request_upload_url_exceeds_size_limit(self, public_client, file_request):
        """Test request fails if file size exceeds the link's limit."""
        file_request.max_file_size = 1000
        file_request.save()

        url = f'/api/v1/public/file-requests/{file_request.slug}/request-upload/'
        data = {'file_name': 'large-file.pdf', 'file_size': 1001}
        response = public_client.post(url, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "exceeds the maximum allowed" in response.data['detail']

    @patch('filerequests.views.check_user_quota_on_upload')
    def test_request_upload_url_exceeds_user_quota(self, mock_check_quota, public_client, file_request):
        """Test request fails if owner's quota is exceeded."""
        from documents.services import QuotaExceededError
        mock_check_quota.side_effect = QuotaExceededError("Quota exceeded")
        url = f'/api/v1/public/file-requests/{file_request.slug}/request-upload/'
        data = {'file_name': 'test.pdf', 'file_size': 12345}
        response = public_client.post(url, data)
        
        # It should return a generic error.
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "storage limit" in response.data['detail']

    @patch('documents.services.generate_pdf_pages_task.delay')
    def test_finalize_upload_success_and_creates_document(self, mock_task_delay, public_client, file_request):
        """Test finalizing an upload creates a Document with correct ownership and info."""
        url = f'/api/v1/public/file-requests/{file_request.slug}/finalize-upload/'
        data = {
            'storage_key': 'some-key',
            'unique_name': 'final-doc.pdf',
            'file_size': 54321,
            'content_type': 'application/pdf',
            'uploader_name': 'John Doe',
            'uploader_email': 'john.doe@example.com',
        }
        
        assert Document.objects.count() == 0
        response = public_client.post(url, data)
        assert response.status_code == status.HTTP_202_ACCEPTED
        assert Document.objects.count() == 1
        
        doc = Document.objects.first()
        assert doc.name == 'final-doc.pdf'
        assert doc.created_by == file_request.created_by
        assert doc.folder == file_request.folder
        assert doc.upload_info == {'name': 'John Doe', 'email': 'john.doe@example.com'}

        # The service should have triggered a processing task
        mock_task_delay.assert_called_once()
