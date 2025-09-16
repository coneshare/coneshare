import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from pytest_bdd import given, parsers, scenario, then, when
from rest_framework import status


@pytest.mark.django_db
@scenario('../features/document_upload.feature', 'User uploads their first document')
def test_user_uploads_first_document():
    pass


@given("I am an authenticated user", target_fixture="user_context")
def user_context(user, api_client):
    """The user and api_client fixtures handle authentication."""
    return {"user": user, "api_client": api_client}


@given("my document list is empty")
def document_list_is_empty(user_context):
    api_client = user_context["api_client"]
    response = api_client.get('/api/v1/documents/')
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 0


@when(parsers.parse('I upload a new document named "{filename}"'))
def upload_new_document(user_context, filename):
    api_client = user_context["api_client"]
    dummy_file = SimpleUploadedFile(
        filename,
        b"workflow content",
        content_type="application/pdf"
    )
    response = api_client.post(
        '/api/v1/uploads/document/',
        {'file': dummy_file},
        format='multipart'
    )
    assert response.status_code == status.HTTP_201_CREATED


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
