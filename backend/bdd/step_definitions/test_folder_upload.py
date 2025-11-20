import os
from unittest.mock import patch

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
    file_content = b"file content"
    folder_path, _ = os.path.split(path)

    # The current upload flow requires folders to exist. We ensure they do first.
    if folder_path:
        ensure_path_data = {'paths': [folder_path]}
        ensure_response = api_client.post('/api/v1/folders/ensure-paths/', ensure_path_data)
        assert ensure_response.status_code == status.HTTP_201_CREATED

    # Now, follow the 2-step upload process
    with patch('documents.fileserver.fileserver_client.generate_upload_url') as mock_upload_url:
        mock_upload_url.return_value = "http://fileserver/files/upload/some-token"

        # Step 1: Request upload URL
        request_url = '/api/v1/uploads/document/request/'
        request_data = {'file_name': filename, 'path': path}
        request_response = api_client.post(request_url, request_data)
        assert request_response.status_code == status.HTTP_200_OK, request_response.data
        upload_data = request_response.json()

        # Step 2: Finalize upload
        finalize_url = '/api/v1/uploads/document/finalize/'
        finalize_data = {
            'storage_key': upload_data['storage_key'],
            'unique_name': upload_data['unique_name'],
            'file_size': len(file_content),
            'content_type': 'application/octet-stream',
            'path': path,
        }
        finalize_response = api_client.post(finalize_url, finalize_data)

    assert finalize_response.status_code == status.HTTP_202_ACCEPTED, finalize_response.data

@then(parsers.parse('the folder "{folder_name}" should exist at the root'))
def folder_exists_at_root(folder_name):
    root_folder = Folder.objects.get(name='__root__', parent=None)
    assert Folder.objects.filter(name=folder_name, parent=root_folder).exists()


@then(parsers.parse('the folder "{child_name}" should exist inside "{parent_name}"'))
def folder_exists_inside_parent(child_name, parent_name):
    root_folder = Folder.objects.get(name='__root__', parent=None)
    parent_folder = Folder.objects.get(name=parent_name, parent=root_folder)
    assert Folder.objects.filter(name=child_name, parent=parent_folder).exists()


@then(parsers.parse('the document "{doc_name}" should exist in the folder "{folder_name}"'))
def document_exists_in_folder(doc_name, folder_name):
    # This assumes folder names are unique at their level for the test
    folder = Folder.objects.get(name=folder_name)
    assert Document.objects.filter(name=doc_name, folder=folder).exists()
