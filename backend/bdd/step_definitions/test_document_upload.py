import pytest
from unittest.mock import patch, MagicMock
from django.core.files.uploadedfile import SimpleUploadedFile
from pytest_bdd import parsers, scenario, then, when
from rest_framework import status

pytest_plugins = "bdd.step_definitions.common_steps"


@pytest.mark.django_db
@scenario('../features/document_upload.feature', 'User uploads their first document')
def test_user_uploads_first_document():
    pass


@when(parsers.parse('I upload a new document named "{filename}"'))
def upload_new_document(user_context, filename):
    api_client = user_context["api_client"]
    file_content = b"workflow content"

    # The test must follow the 2-step async upload flow.
    # We mock all external network calls and the conversion library.
    with patch('documents.views.fileserver_client.generate_upload_url') as mock_view_upload, \
         patch('documents.tasks.fileserver_client.generate_download_url') as mock_task_download, \
         patch('documents.tasks.requests.get') as mock_task_get, \
         patch('documents.tasks.fileserver_client.generate_upload_url') as mock_task_upload, \
         patch('documents.tasks.requests.put') as mock_task_put, \
         patch('documents.tasks.convert_from_bytes') as mock_convert:

        # Mock for the /request view
        mock_view_upload.return_value = "http://fileserver/files/upload/some-token"

        # Mocks for the Celery task's file download
        mock_task_download.return_value = "http://fileserver/files/download/token"
        mock_get_response = MagicMock()
        mock_get_response.raise_for_status.return_value = None
        mock_get_response.content = file_content
        mock_task_get.return_value = mock_get_response

        # Mocks for the conversion and subsequent page uploads
        mock_image = MagicMock()
        mock_image.save.side_effect = lambda buf, format: buf.write(b'fake-image-bytes')
        mock_convert.return_value = [mock_image]
        mock_task_upload.return_value = "http://fileserver/files/upload/page-token"
        mock_put_response = MagicMock()
        mock_put_response.raise_for_status.return_value = None
        mock_task_put.return_value = mock_put_response

        # Step 1: Request upload URL for a root-level upload
        request_url = '/api/v1/uploads/document/request/'
        request_data = {'file_name': filename}
        request_response = api_client.post(request_url, request_data)
        assert request_response.status_code == status.HTTP_200_OK, request_response.data
        upload_data = request_response.json()

        # Step 2: Finalize upload
        finalize_url = '/api/v1/uploads/document/finalize/'
        finalize_data = {
            'storage_key': upload_data['storage_key'],
            'unique_name': upload_data['unique_name'],
            'file_size': len(file_content),
            'content_type': 'application/pdf',
        }
        finalize_response = api_client.post(finalize_url, finalize_data)

    assert finalize_response.status_code == status.HTTP_202_ACCEPTED, finalize_response.data
    user_context["upload_response"] = finalize_response


@then(parsers.parse("the document list should contain {count:d} document"))
def document_list_contains_count(user_context, count):
    api_client = user_context["api_client"]
    response = api_client.get('/api/v1/documents/')
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == count
    user_context["final_document_list"] = response.data


@then(parsers.parse('the document should be named "{filename}"'))
def document_has_name(user_context, filename):
    document_list = user_context["final_document_list"]
    assert document_list[0]['name'] == filename


@then(parsers.parse('the document status should be "{status}"'))
def document_status_is(user_context, status):
    """
    Checks the status of the document by fetching its final state from the DB.
    This works because the Celery task ran synchronously during the test.
    """
    from documents.models import Document

    upload_response_data = user_context["upload_response"].json()
    document_id = upload_response_data["id"]

    # Fetch the final state of the document from the database
    document = Document.objects.get(id=document_id)
    assert document.status == status
