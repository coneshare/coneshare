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
    dummy_file = SimpleUploadedFile(
        filename,
        b"workflow content",
        content_type="application/pdf"
    )
    # Mock the PDF conversion to avoid dependency on poppler-utils in CI
    with patch('documents.tasks.convert_from_bytes', return_value=[MagicMock()]):
        response = api_client.post(
            '/api/v1/uploads/document/',
            {'file': dummy_file},
            format='multipart'
        )
    # The async view now returns 202 ACCEPTED
    assert response.status_code == status.HTTP_202_ACCEPTED
    user_context["upload_response"] = response


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
