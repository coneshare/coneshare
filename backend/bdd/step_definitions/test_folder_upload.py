import os
from pathlib import Path
from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from pytest_bdd import given, parsers, scenario, then, when
from rest_framework import status

from documents.models import Document, Folder

pytest_plugins = "bdd.step_definitions.common_steps"


@pytest.mark.django_db
@scenario('../features/folder_upload.feature', 'User uploads files that create a nested folder structure')
def test_folder_upload_and_structure():
    pass


@pytest.mark.django_db
@scenario('../features/folder_upload.feature', 'User uploads a folder that already exists at the root')
def test_folder_upload_with_existing_folder():
    pass


@given(parsers.parse('the folder "{folder_name}" exists at the root'))
def given_folder_exists_at_root(user_context, folder_name):
    user = user_context['user']
    root_folder = Folder.objects.get_root_for_org(user.organization)
    Folder.objects.create(
        name=folder_name,
        parent=root_folder,
        organization=user.organization,
        created_by=user
    )


@when(parsers.parse('I upload the following files in a batch:\n{file_table}'))
def upload_files_in_batch(user_context, file_table):
    api_client = user_context["api_client"]
    file_content = b"file content"

    # Step 1: Parse the table and extract all unique folder paths
    lines = file_table.strip().split('\n')
    header_line = lines[0]
    rows = lines[1:]

    headers = [h.strip() for h in header_line.split('|') if h.strip()]
    filename_idx = headers.index('filename')
    path_idx = headers.index('path')

    files_to_upload = []
    folder_paths = set()

    for row_str in rows:
        cols = [c.strip() for c in row_str.split('|') if c.strip()]
        if not cols:
            continue
        
        filename = cols[filename_idx]
        path = cols[path_idx]
        
        files_to_upload.append({'filename': filename, 'path': path})
        folder_path, _ = os.path.split(path)
        if folder_path:
            folder_paths.add(folder_path)

    # Step 2: Ensure all folder paths exist in a single batch call
    if folder_paths:
        ensure_path_data = {'paths': list(folder_paths)}
        ensure_response = api_client.post('/api/v1/folders/ensure-paths/', ensure_path_data)
        assert ensure_response.status_code == status.HTTP_201_CREATED
        path_mappings = ensure_response.json().get('path_mappings', {})
    else:
        path_mappings = {}

    # Step 3: Concurrently upload all files, respecting any path remappings
    with patch('documents.fileserver.fileserver_client.generate_upload_url') as mock_upload_url:
        mock_upload_url.return_value = "http://fileserver/files/upload/some-token"

        for file_info in files_to_upload:
            filename = file_info['filename']
            original_path = file_info['path']
            
            upload_path = original_path

            # Reconstruct path based on mappings returned from the single batch call
            p = Path(original_path)
            if p.parts:
                original_top_level = p.parts[0]
                renamed_top_level = path_mappings.get(original_top_level)
                if renamed_top_level and renamed_top_level != original_top_level:
                    new_path_parts = [renamed_top_level] + list(p.parts[1:])
                    upload_path = str(Path(*new_path_parts))

            # Request upload URL
            request_url = '/api/v1/uploads/document/request/'
            request_data = {'file_name': filename, 'path': upload_path}
            request_response = api_client.post(request_url, request_data)
            assert request_response.status_code == status.HTTP_200_OK, request_response.data
            upload_data = request_response.json()

            # Finalize upload
            finalize_url = '/api/v1/uploads/document/finalize/'
            finalize_data = {
                'storage_key': upload_data['storage_key'],
                'unique_name': upload_data['unique_name'],
                'file_size': len(file_content),
                'content_type': 'application/octet-stream',
                'path': upload_path,
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
