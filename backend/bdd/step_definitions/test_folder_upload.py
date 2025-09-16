import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from pytest_bdd import parsers, scenario, then, when
from rest_framework import status

from documents.models import Document, Folder

pytest_plugins = "bdd.step_definitions.common_steps"


@pytest.mark.django_db
@scenario('../features/folder_upload.feature', 'User uploads files that create a nested folder structure')
def test_folder_upload_and_structure():
    pass


@when(parsers.parse('I upload a file named "{filename}" with the path "{path}"'))
def upload_file_with_path(user_context, filename, path):
    api_client = user_context["api_client"]
    dummy_file = SimpleUploadedFile(
        filename,
        b"file content",
        content_type="application/octet-stream"
    )
    response = api_client.post(
        '/api/v1/uploads/document/',
        {'file': dummy_file, 'path': path},
        format='multipart'
    )
    assert response.status_code == status.HTTP_202_ACCEPTED, response.data


@then(parsers.parse('the folder "{folder_name}" should exist at the root'))
def folder_exists_at_root(folder_name):
    assert Folder.objects.filter(name=folder_name, parent=None).exists()


@then(parsers.parse('the folder "{child_name}" should exist inside "{parent_name}"'))
def folder_exists_inside_parent(child_name, parent_name):
    parent_folder = Folder.objects.get(name=parent_name, parent=None)
    assert Folder.objects.filter(name=child_name, parent=parent_folder).exists()


@then(parsers.parse('the document "{doc_name}" should exist in the folder "{folder_name}"'))
def document_exists_in_folder(doc_name, folder_name):
    # This assumes folder names are unique at their level for the test
    folder = Folder.objects.get(name=folder_name)
    assert Document.objects.filter(name=doc_name, folder=folder).exists()
