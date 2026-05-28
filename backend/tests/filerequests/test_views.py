import pytest
from unittest.mock import patch
from rest_framework import status
from django.utils import timezone
from datetime import timedelta

from core.models import Organization
from documents.models import Document, Folder
from filerequests.models import FileRequest, SecurityThreatEvent, UploadedFile

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

    def test_create_file_request_with_custom_fields(self, api_client, user, organization):
        root_folder = Folder.objects.get_root_for_org(organization)
        data = {
            "name": "Case Intake",
            "folder": str(root_folder.id),
            "custom_fields": [
                {
                    "id": "case_number",
                    "label": "Case Number",
                    "type": "text",
                    "required": True,
                    "placeholder": "CASE-2026-001",
                },
                {
                    "id": "document_type",
                    "label": "Document Type",
                    "type": "select",
                    "required": True,
                    "options": ["Invoice", "Contract"],
                },
            ],
        }

        response = api_client.post('/api/v1/file-requests/', data, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['custom_fields'][0]['id'] == 'case_number'
        assert response.data['custom_fields'][1]['options'] == ["Invoice", "Contract"]

    def test_create_file_request_rejects_invalid_custom_field_schema(self, api_client, user, organization):
        root_folder = Folder.objects.get_root_for_org(organization)
        data = {
            "name": "Bad Intake",
            "folder": str(root_folder.id),
            "custom_fields": [
                {
                    "id": "document_type",
                    "label": "Document Type",
                    "type": "select",
                    "required": True,
                    "options": [],
                },
            ],
        }

        response = api_client.post('/api/v1/file-requests/', data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "requires at least one option" in str(response.data)

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

    def test_list_file_requests_is_scoped_to_user_and_ordered(self, api_client, user, user2, organization):
        """
        Test that listing file requests only returns items created by the
        authenticated user and that they are ordered by creation date descending.
        """
        root_folder = Folder.objects.get_root_for_org(organization)
        # These are created sequentially, so request2 is newer
        FileRequest.objects.create(name="My First Request", folder=root_folder, created_by=user)
        FileRequest.objects.create(name="My Second Request", folder=root_folder, created_by=user)
        FileRequest.objects.create(name="Other User Request", folder=root_folder, created_by=user2)

        response = api_client.get('/api/v1/file-requests/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 2
        results = response.data['results']
        assert len(results) == 2
        assert results[0]['name'] == "My Second Request"
        assert results[1]['name'] == "My First Request"

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

    def test_create_file_request_for_other_organization_folder_fails(self, api_client, user):
        """A user cannot create a file request for a folder in another organization."""
        other_org = Organization.objects.create(name="Other Org")
        other_org_root_folder = Folder.objects.get_root_for_org(other_org)

        data = {
            "name": "Cross-Org Upload",
            "folder": str(other_org_root_folder.id),
        }
        response = api_client.post('/api/v1/file-requests/', data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "You can only select folders within your own organization" in str(response.data)


class TestPublicFileRequestViews:
    def test_get_public_details_success(self, public_client, file_request):
        """Test retrieving public details of an active file request."""
        file_request.name = "Public Name"
        file_request.save()
        url = f'/api/v1/public/file-requests/{file_request.slug}/'
        response = public_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == "Public Name"

    def test_get_public_details_includes_custom_fields(self, public_client, file_request):
        file_request.custom_fields = [
            {
                "id": "case_number",
                "label": "Case Number",
                "type": "text",
                "required": True,
            }
        ]
        file_request.save(update_fields=['custom_fields'])

        url = f'/api/v1/public/file-requests/{file_request.slug}/'
        response = public_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['custom_fields'][0]['id'] == 'case_number'

    def test_get_public_details_inactive(self, public_client, file_request):
        """Test an inactive file request returns 404."""
        file_request.is_active = False
        file_request.save()
        url = f'/api/v1/public/file-requests/{file_request.slug}/'
        response = public_client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_public_details_expired(self, public_client, file_request):
        """Test an expired file request returns 400."""
        file_request.expires_at = timezone.now() - timedelta(days=1)
        file_request.save()
        url = f'/api/v1/public/file-requests/{file_request.slug}/'
        response = public_client.get(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

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

    def test_request_upload_url_disallowed_file_type(self, public_client, file_request):
        """Test request fails if file extension is not allowed by file request policy."""
        file_request.allowed_file_types = ['pdf', '.docx']
        file_request.save(update_fields=['allowed_file_types'])

        url = f'/api/v1/public/file-requests/{file_request.slug}/request-upload/'
        data = {'file_name': 'archive.zip', 'file_size': 123}
        response = public_client.post(url, data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "File type not allowed" in response.data['detail']
        assert ".pdf" in response.data['detail']
        assert ".docx" in response.data['detail']

    @patch('filerequests.views.fileserver_client.generate_upload_url')
    def test_request_upload_url_allowed_file_type_normalized(self, mock_generate_url, public_client, file_request):
        """Test extension checks are case-insensitive and normalize missing leading dot."""
        file_request.allowed_file_types = ['pdf', '.docx']
        file_request.save(update_fields=['allowed_file_types'])
        mock_generate_url.return_value = "http://fileserver/upload/token"

        url = f'/api/v1/public/file-requests/{file_request.slug}/request-upload/'
        data = {'file_name': 'Quarterly.PDF', 'file_size': 12345}
        response = public_client.post(url, data)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['upload_url'] == "http://fileserver/upload/token"

    @patch('filerequests.views.fileserver_client.generate_upload_url')
    def test_request_upload_url_allows_multi_part_extension(self, mock_generate_url, public_client, file_request):
        """Test file names are matched against full allowed extension suffixes (e.g., .tar.gz)."""
        file_request.allowed_file_types = ['.tar.gz']
        file_request.save(update_fields=['allowed_file_types'])
        mock_generate_url.return_value = "http://fileserver/upload/token"

        url = f'/api/v1/public/file-requests/{file_request.slug}/request-upload/'
        data = {'file_name': 'backup.TAR.GZ', 'file_size': 4096}
        response = public_client.post(url, data)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['upload_url'] == "http://fileserver/upload/token"

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
    @patch('filerequests.views.dispatch_automation_event_task.delay')
    @patch('filerequests.views.transaction.on_commit', side_effect=lambda fn: fn())
    @patch('filerequests.views.scan_storage_key_or_raise')
    def test_finalize_upload_success_and_creates_document(
        self,
        _mock_scan,
        _mock_on_commit,
        mock_dispatch_automation,
        mock_task_delay,
        public_client,
        file_request,
    ):
        """Test finalizing an upload creates a Document and an UploadedFile record."""
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
        assert UploadedFile.objects.count() == 0
        response = public_client.post(url, data)
        assert response.status_code == status.HTTP_202_ACCEPTED
        assert Document.objects.count() == 1
        assert UploadedFile.objects.count() == 1
        
        doc = Document.objects.first()
        assert doc.name == 'final-doc.pdf'
        assert doc.created_by == file_request.created_by
        assert doc.folder == file_request.folder
        
        uploaded_file = UploadedFile.objects.first()
        assert uploaded_file.document == doc
        assert uploaded_file.file_request == file_request
        assert uploaded_file.uploader_name == 'John Doe'
        assert uploaded_file.uploader_email == 'john.doe@example.com'

        # The service should have triggered a processing task
        mock_task_delay.assert_called_once()
        mock_dispatch_automation.assert_called_once()
        event_type, payload = mock_dispatch_automation.call_args.args
        assert event_type == 'file_request_uploaded'
        assert payload['organization_id'] == str(file_request.created_by.organization_id)
        assert payload['file_request_id'] == str(file_request.id)
        assert payload['document_id'] == str(doc.id)
        assert payload['uploaded_by_email'] == 'john.doe@example.com'
        assert payload['event_datetime'] is not None
        assert payload['visitor_ip'] is not None
        assert payload['visitor_country'] is None
        assert payload['visitor_city'] is None
        assert payload['visitor_latitude'] is None
        assert payload['visitor_longitude'] is None

    @patch('documents.services.generate_pdf_pages_task.delay')
    @patch('filerequests.views.dispatch_automation_event_task.delay')
    @patch('filerequests.views.transaction.on_commit', side_effect=lambda fn: fn())
    @patch('filerequests.views.scan_storage_key_or_raise')
    def test_finalize_upload_persists_custom_field_values(
        self,
        _mock_scan,
        _mock_on_commit,
        _mock_dispatch_automation,
        _mock_task_delay,
        api_client,
        public_client,
        file_request,
    ):
        file_request.custom_fields = [
            {"id": "case_number", "label": "Case Number", "type": "text", "required": True},
            {"id": "document_type", "label": "Document Type", "type": "select", "required": True, "options": ["Contract", "Invoice"]},
            {"id": "due_date", "label": "Due Date", "type": "date", "required": False},
        ]
        file_request.save(update_fields=['custom_fields'])

        url = f'/api/v1/public/file-requests/{file_request.slug}/finalize-upload/'
        data = {
            'storage_key': 'some-key',
            'unique_name': 'final-doc.pdf',
            'file_size': 54321,
            'content_type': 'application/pdf',
            'uploader_name': 'John Doe',
            'uploader_email': 'john.doe@example.com',
            'custom_field_values': {
                'case_number': ' CASE-2026-001 ',
                'document_type': 'Contract',
                'due_date': '2026-05-28',
            },
        }

        response = public_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_202_ACCEPTED
        uploaded_file = UploadedFile.objects.get()
        expected_values = {
            'case_number': 'CASE-2026-001',
            'document_type': 'Contract',
            'due_date': '2026-05-28',
        }
        expected_snapshot = {
            'case_number': {'label': 'Case Number', 'type': 'text', 'value': 'CASE-2026-001'},
            'document_type': {'label': 'Document Type', 'type': 'select', 'value': 'Contract'},
            'due_date': {'label': 'Due Date', 'type': 'date', 'value': '2026-05-28'},
        }
        assert uploaded_file.submitted_fields == expected_snapshot
        assert uploaded_file.document.metadata['file_request_fields'] == uploaded_file.submitted_fields

        detail_response = api_client.get(f'/api/v1/file-requests/{file_request.id}/')
        assert detail_response.status_code == status.HTTP_200_OK
        assert detail_response.data['uploaded_files'][0]['submitted_fields'] == uploaded_file.submitted_fields
        _event_type, payload = _mock_dispatch_automation.call_args.args
        assert payload['custom_field_values'] == expected_values

    def test_finalize_upload_rejects_missing_required_custom_field(self, public_client, file_request):
        file_request.custom_fields = [
            {"id": "case_number", "label": "Case Number", "type": "text", "required": True},
        ]
        file_request.save(update_fields=['custom_fields'])

        url = f'/api/v1/public/file-requests/{file_request.slug}/finalize-upload/'
        data = {
            'storage_key': 'some-key',
            'unique_name': 'final-doc.pdf',
            'file_size': 54321,
            'content_type': 'application/pdf',
            'uploader_name': 'John Doe',
            'uploader_email': 'john.doe@example.com',
            'custom_field_values': {},
        }

        response = public_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data['custom_field_values']['case_number'] == 'Case Number is required.'
        assert Document.objects.count() == 0
        assert UploadedFile.objects.count() == 0

    def test_finalize_upload_rejects_required_checkbox_when_false(self, public_client, file_request):
        file_request.custom_fields = [
            {"id": "confirm_accuracy", "label": "Confirm Accuracy", "type": "checkbox", "required": True},
        ]
        file_request.save(update_fields=['custom_fields'])

        url = f'/api/v1/public/file-requests/{file_request.slug}/finalize-upload/'
        data = {
            'storage_key': 'some-key',
            'unique_name': 'final-doc.pdf',
            'file_size': 54321,
            'content_type': 'application/pdf',
            'uploader_name': 'John Doe',
            'uploader_email': 'john.doe@example.com',
            'custom_field_values': {'confirm_accuracy': False},
        }

        response = public_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data['custom_field_values']['confirm_accuracy'] == 'Confirm Accuracy must be checked.'
        assert Document.objects.count() == 0
        assert UploadedFile.objects.count() == 0

    def test_finalize_upload_rejects_boolean_for_number_field(self, public_client, file_request):
        file_request.custom_fields = [
            {"id": "invoice_total", "label": "Invoice Total", "type": "number", "required": True},
        ]
        file_request.save(update_fields=['custom_fields'])

        url = f'/api/v1/public/file-requests/{file_request.slug}/finalize-upload/'
        data = {
            'storage_key': 'some-key',
            'unique_name': 'final-doc.pdf',
            'file_size': 54321,
            'content_type': 'application/pdf',
            'uploader_name': 'John Doe',
            'uploader_email': 'john.doe@example.com',
            'custom_field_values': {'invoice_total': True},
        }

        response = public_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data['custom_field_values']['invoice_total'] == 'Invoice Total must be a valid number.'
        assert Document.objects.count() == 0
        assert UploadedFile.objects.count() == 0

    @patch('documents.services.generate_pdf_pages_task.delay')
    @patch('filerequests.views.dispatch_automation_event_task.delay')
    @patch('filerequests.views.transaction.on_commit', side_effect=lambda fn: fn())
    @patch('filerequests.views.scan_storage_key_or_raise')
    def test_finalize_upload_allows_optional_checkbox_when_false(
        self,
        _mock_scan,
        _mock_on_commit,
        _mock_dispatch_automation,
        _mock_task_delay,
        public_client,
        file_request,
    ):
        file_request.custom_fields = [
            {"id": "subscribe_updates", "label": "Subscribe Updates", "type": "checkbox", "required": False},
        ]
        file_request.save(update_fields=['custom_fields'])

        url = f'/api/v1/public/file-requests/{file_request.slug}/finalize-upload/'
        data = {
            'storage_key': 'some-key',
            'unique_name': 'final-doc.pdf',
            'file_size': 54321,
            'content_type': 'application/pdf',
            'uploader_name': 'John Doe',
            'uploader_email': 'john.doe@example.com',
            'custom_field_values': {'subscribe_updates': False},
        }

        response = public_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_202_ACCEPTED
        uploaded_file = UploadedFile.objects.get()
        assert uploaded_file.submitted_fields['subscribe_updates'] == {
            'label': 'Subscribe Updates',
            'type': 'checkbox',
            'value': False,
        }

    def test_finalize_upload_disallowed_file_type(self, public_client, file_request):
        """Test finalize is blocked when file extension violates allowed_file_types."""
        file_request.allowed_file_types = ['.pdf']
        file_request.save(update_fields=['allowed_file_types'])
        url = f'/api/v1/public/file-requests/{file_request.slug}/finalize-upload/'
        data = {
            'storage_key': 'some-key',
            'unique_name': 'payload.exe',
            'file_size': 54321,
            'content_type': 'application/octet-stream',
            'uploader_name': 'John Doe',
            'uploader_email': 'john.doe@example.com',
        }

        response = public_client.post(url, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "File type not allowed" in response.data['detail']
        assert Document.objects.count() == 0
        assert UploadedFile.objects.count() == 0

    @patch('documents.services.generate_pdf_pages_task.delay')
    @patch('filerequests.views.dispatch_automation_event_task.delay')
    @patch('filerequests.views.transaction.on_commit', side_effect=lambda fn: fn())
    @patch('filerequests.views.scan_storage_key_or_raise')
    def test_finalize_upload_allows_multi_part_extension(
        self,
        _mock_scan,
        _mock_on_commit,
        mock_dispatch_automation,
        mock_task_delay,
        public_client,
        file_request,
    ):
        """Test finalize accepts full suffix matches like .tar.gz."""
        file_request.allowed_file_types = ['tar.gz']
        file_request.save(update_fields=['allowed_file_types'])
        url = f'/api/v1/public/file-requests/{file_request.slug}/finalize-upload/'
        data = {
            'storage_key': 'some-key',
            'unique_name': 'archive.tar.gz',
            'file_size': 54321,
            'content_type': 'application/gzip',
            'uploader_name': 'John Doe',
            'uploader_email': 'john.doe@example.com',
        }

        response = public_client.post(url, data)
        assert response.status_code == status.HTTP_202_ACCEPTED
        assert Document.objects.count() == 1
        assert UploadedFile.objects.count() == 1
        mock_task_delay.assert_not_called()
        mock_dispatch_automation.assert_called_once()

    @patch('filerequests.views.scan_storage_key_or_raise')
    @patch('documents.services.generate_pdf_pages_task.delay')
    @patch('filerequests.views.dispatch_automation_event_task.delay')
    @patch('filerequests.views.fileserver_client.delete_file')
    def test_finalize_upload_rejects_malicious_file(
        self,
        mock_delete_file,
        mock_dispatch_automation,
        _mock_task_delay,
        mock_scan,
        public_client,
        file_request,
    ):
        """Test finalize rejects files flagged by malware scanner."""
        from documents.malware_scan import MalwareDetectedError
        mock_scan.side_effect = MalwareDetectedError(
            "Upload blocked: security scan detected a potentially malicious file."
        )

        url = f'/api/v1/public/file-requests/{file_request.slug}/finalize-upload/'
        data = {
            'storage_key': 'malicious-key',
            'unique_name': 'final-doc.pdf',
            'file_size': 54321,
            'content_type': 'application/pdf',
            'uploader_name': 'John Doe',
            'uploader_email': 'john.doe@example.com',
        }

        response = public_client.post(url, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "security scan detected" in response.data['detail']
        assert Document.objects.count() == 0
        assert UploadedFile.objects.count() == 0
        assert SecurityThreatEvent.objects.count() == 1
        threat = SecurityThreatEvent.objects.first()
        assert threat.event_type == SecurityThreatEvent.EventType.MALWARE_DETECTED
        assert threat.severity == SecurityThreatEvent.Severity.HIGH
        assert threat.storage_cleanup_status == SecurityThreatEvent.StorageCleanupStatus.DELETED
        assert threat.storage_cleanup_at is not None
        assert threat.storage_cleanup_error == ''
        mock_delete_file.assert_called_once_with('malicious-key')
        mock_dispatch_automation.assert_called_once()
        event_type, payload = mock_dispatch_automation.call_args.args
        assert event_type == 'file_request_malware_detected'
        assert payload['file_request_id'] == str(file_request.id)
        assert payload['uploaded_file_name'] == 'final-doc.pdf'
        assert payload['threat_event_id'] == str(threat.id)

    @patch('filerequests.views.scan_storage_key_or_raise')
    @patch('documents.services.generate_pdf_pages_task.delay')
    @patch('filerequests.views.dispatch_automation_event_task.delay')
    @patch('filerequests.views.fileserver_client.delete_file')
    def test_finalize_upload_malicious_file_cleanup_failure_is_recorded(
        self,
        mock_delete_file,
        mock_dispatch_automation,
        _mock_task_delay,
        mock_scan,
        public_client,
        file_request,
    ):
        from documents.malware_scan import MalwareDetectedError
        mock_scan.side_effect = MalwareDetectedError(
            "Upload blocked: security scan detected a potentially malicious file."
        )
        mock_delete_file.side_effect = Exception('delete failed')

        url = f'/api/v1/public/file-requests/{file_request.slug}/finalize-upload/'
        data = {
            'storage_key': 'malicious-key-2',
            'unique_name': 'final-doc.pdf',
            'file_size': 54321,
            'content_type': 'application/pdf',
            'uploader_name': 'John Doe',
            'uploader_email': 'john.doe@example.com',
        }

        response = public_client.post(url, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert SecurityThreatEvent.objects.count() == 1
        threat = SecurityThreatEvent.objects.first()
        assert threat.storage_cleanup_status == SecurityThreatEvent.StorageCleanupStatus.FAILED
        assert 'delete failed' in threat.storage_cleanup_error
        mock_dispatch_automation.assert_called_once()

    @patch('filerequests.views.scan_storage_key_or_raise')
    @patch('filerequests.views.dispatch_automation_event_task.delay')
    @patch('filerequests.views.fileserver_client.delete_file')
    def test_finalize_upload_scanner_unavailable_dispatches_security_event(
        self,
        mock_delete_file,
        mock_dispatch_automation,
        mock_scan,
        public_client,
        file_request,
    ):
        from documents.malware_scan import MalwareScannerUnavailableError
        mock_scan.side_effect = MalwareScannerUnavailableError(
            "Upload could not be verified by security scanner. Please try again later."
        )

        url = f'/api/v1/public/file-requests/{file_request.slug}/finalize-upload/'
        data = {
            'storage_key': 'scanner-down-key',
            'unique_name': 'final-doc.pdf',
            'file_size': 54321,
            'content_type': 'application/pdf',
            'uploader_name': 'John Doe',
            'uploader_email': 'john.doe@example.com',
        }

        response = public_client.post(url, data)
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert "security scanner" in response.data['detail']
        assert Document.objects.count() == 0
        assert UploadedFile.objects.count() == 0
        assert SecurityThreatEvent.objects.count() == 1
        threat = SecurityThreatEvent.objects.first()
        assert threat.event_type == SecurityThreatEvent.EventType.SCAN_FAILED
        assert threat.severity == SecurityThreatEvent.Severity.MEDIUM
        assert threat.storage_cleanup_status == SecurityThreatEvent.StorageCleanupStatus.DELETED
        assert threat.storage_cleanup_at is not None
        assert threat.storage_cleanup_error == ''
        mock_delete_file.assert_called_once_with('scanner-down-key')
        mock_dispatch_automation.assert_called_once()
        event_type, payload = mock_dispatch_automation.call_args.args
        assert event_type == 'file_request_scan_failed'
        assert payload['file_request_id'] == str(file_request.id)
        assert payload['threat_event_id'] == str(threat.id)

    @patch('filerequests.views.scan_storage_key_or_raise')
    @patch('filerequests.views.dispatch_automation_event_task.delay')
    @patch('filerequests.views.fileserver_client.delete_file')
    def test_finalize_upload_scanner_unavailable_cleanup_failure_is_recorded(
        self,
        mock_delete_file,
        mock_dispatch_automation,
        mock_scan,
        public_client,
        file_request,
    ):
        from documents.malware_scan import MalwareScannerUnavailableError
        mock_scan.side_effect = MalwareScannerUnavailableError(
            "Upload could not be verified by security scanner. Please try again later."
        )
        mock_delete_file.side_effect = Exception('delete failed')

        url = f'/api/v1/public/file-requests/{file_request.slug}/finalize-upload/'
        data = {
            'storage_key': 'scanner-down-key-2',
            'unique_name': 'final-doc.pdf',
            'file_size': 54321,
            'content_type': 'application/pdf',
            'uploader_name': 'John Doe',
            'uploader_email': 'john.doe@example.com',
        }

        response = public_client.post(url, data)
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert SecurityThreatEvent.objects.count() == 1
        threat = SecurityThreatEvent.objects.first()
        assert threat.storage_cleanup_status == SecurityThreatEvent.StorageCleanupStatus.FAILED
        assert 'delete failed' in threat.storage_cleanup_error
        mock_dispatch_automation.assert_called_once()
