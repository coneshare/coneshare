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
    # We mock the external parts: file server URL generation and the PUT to that URL.
    with patch('documents.views.fileserver_client.generate_upload_url') as mock_fs_upload_url, \
         patch('documents.tasks.convert_from_bytes', return_value=[MagicMock()]):

        mock_fs_upload_url.return_value = "http://fileserver/files/upload/some-token"

        # Step 1: Request upload URL for a root-level upload
        request_url = '/api/v1/uploads/document/request/'
        request_data = {'file_name': filename}
        request_response = api_client.post(request_url, request_data)
        assert request_response.status_code == status.HTTP_200_OK, request_response.data
        upload_data = request_response.json()

        # We can skip mocking the actual PUT to the upload_url, as it's an external call.

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
