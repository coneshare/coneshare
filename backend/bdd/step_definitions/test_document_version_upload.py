import pytest
from unittest.mock import patch, MagicMock
from django.core.files.uploadedfile import SimpleUploadedFile
from pytest_bdd import parsers, scenario, given, when, then
from rest_framework import status

from documents.models import Document, DocumentVersion

# Make common steps available
pytest_plugins = "bdd.step_definitions.common_steps"


@pytest.mark.django_db
@scenario(
    '../features/document_version_upload.feature',
    'User uploads a new version of an existing document'
)
def test_upload_new_document_version():
    """BDD test for uploading a new document version."""
    pass


@given(parsers.parse('I have a document named "{filename}"'), target_fixture="document")
def document(user_context, filename):
    """Create a document with one version."""
    doc = Document.objects.create(
        organization=user_context['user'].organization,
        created_by=user_context['user'],
        name=filename,
        status='ready'
    )
    DocumentVersion.objects.create(
        document=doc,
        version_number=1,
        is_primary=True,
    )
    user_context['document'] = doc
    return doc


@when(parsers.parse('I upload a new version of the document named "{filename}"'))
def upload_new_version(user_context, document, filename):
    """Upload a new version of the document."""
    api_client = user_context['api_client']
    file_content = b"new content"

    # We patch the client methods at their source and requests/convert in the tasks module.
    with patch('documents.fileserver.fileserver_client.generate_upload_url') as mock_upload_url, \
         patch('documents.fileserver.fileserver_client.generate_download_url') as mock_download_url, \
         patch('documents.tasks.requests.get') as mock_task_get, \
         patch('documents.tasks.requests.put') as mock_task_put, \
         patch('documents.tasks.convert_from_bytes') as mock_convert:

        # Mocks for the Celery task's file download
        mock_download_url.return_value = "http://fileserver/files/download/token"
        mock_get_response = MagicMock()
        mock_get_response.raise_for_status.return_value = None
        mock_get_response.content = file_content
        mock_task_get.return_value = mock_get_response

        # Mocks for the conversion and subsequent page uploads
        mock_image = MagicMock()
        mock_image.save.side_effect = lambda buf, format: buf.write(b'fake-image-bytes')
        mock_convert.return_value = [mock_image]
        mock_put_response = MagicMock()
        mock_put_response.raise_for_status.return_value = None
        mock_task_put.return_value = mock_put_response
        mock_upload_url.side_effect = [
            "http://fileserver/files/upload/version-token",
            "http://fileserver/files/upload/page-token",
        ]

        # Step 1: Request upload URL
        request_url = f'/api/v1/uploads/document/{document.id}/versions/request/'
        request_response = api_client.post(request_url, {'file_name': filename, 'file_size': len(file_content)})
        assert request_response.status_code == status.HTTP_200_OK
        upload_data = request_response.json()

        # Step 2: Finalize upload
        finalize_url = f'/api/v1/uploads/document/{document.id}/versions/finalize/'
        finalize_data = {
            'storage_key': upload_data['storage_key'],
            'file_size': len(file_content),
            'content_type': 'application/pdf',
        }
        finalize_response = api_client.post(finalize_url, finalize_data)
        assert finalize_response.status_code == status.HTTP_202_ACCEPTED, finalize_response.data

    user_context['response'] = finalize_response
    document.refresh_from_db()


@then(parsers.parse("the document should have {count:d} versions"))
def check_version_count(user_context, count):
    """Check the number of versions for the document."""
    doc = user_context['document']
    assert doc.versions.count() == count


@then(parsers.parse("the document's latest version should be version number {version_number:d}"))
def check_latest_version_number(user_context, version_number):
    """Check the version number of the latest version."""
    doc = user_context['document']
    latest_version = doc.versions.order_by('-version_number').first()
    assert latest_version is not None
    assert latest_version.version_number == version_number
    assert latest_version.is_primary is True


@then(parsers.parse('the document status should be "{status}"'))
def document_status_is(user_context, status):
    """Check the document's status."""
    doc = user_context['document']
    assert doc.status == status


@pytest.mark.django_db
@scenario(
    '../features/document_version_upload.feature',
    'User promotes an older document version to be primary'
)
def test_promote_older_document_version():
    """BDD test for promoting an older document version."""
    pass


@pytest.mark.django_db
@scenario(
    '../features/document_version_upload.feature',
    'User previews a specific document version'
)
def test_preview_specific_document_version():
    """BDD test for previewing a specific document version."""
    pass


@given(parsers.parse('I have a document named "{filename}" with {version_count:d} versions'), target_fixture="document")
def document_with_multiple_versions(user_context, filename, version_count):
    """Create a document with multiple versions."""
    doc = Document.objects.create(
        organization=user_context['user'].organization,
        created_by=user_context['user'],
        name=filename,
        status='ready'
    )
    
    versions = []
    for i in range(1, version_count + 1):
        is_primary = (i == version_count)
        version = DocumentVersion.objects.create(
            document=doc,
            version_number=i,
            is_primary=is_primary,
            file_size=i * 100,
            content_type='application/pdf',
            original_storage_key=f'storage-key-v{i}',
            storage_key=f'storage-key-v{i}',
            type='pdf',
            render_status='ready'
        )
        versions.append(version)
        
    doc.file_size = versions[-1].file_size
    doc.content_type = versions[-1].content_type
    doc.type = versions[-1].type
    doc.storage_key = versions[-1].storage_key
    doc.original_storage_key = versions[-1].original_storage_key
    doc.save()
    
    user_context['document'] = doc
    user_context['versions'] = versions
    return doc


@when(parsers.parse('I promote version {version_number:d} of the document to be primary'))
def promote_version(user_context, document, version_number):
    """Promote a specific version to be primary."""
    api_client = user_context['api_client']
    version = document.versions.get(version_number=version_number)
    
    promote_url = f'/api/v1/documents/{document.id}/promote_version/'
    response = api_client.post(promote_url, {'version_id': str(version.id)})
    assert response.status_code == status.HTTP_200_OK
    
    document.refresh_from_db()
    user_context['promoted_version'] = version


@then(parsers.parse('version {version_number:d} should be the primary version'))
def check_version_is_primary(user_context, document, version_number):
    """Check that the version is primary."""
    version = document.versions.get(version_number=version_number)
    assert version.is_primary is True


@then(parsers.parse("the document size should match version {version_number:d}'s size"))
def check_document_size_matches_version(user_context, document, version_number):
    """Check that the document file size matches the promoted version."""
    version = document.versions.get(version_number=version_number)
    assert document.file_size == version.file_size


@then(parsers.parse('version {version_number:d} should not be the primary version'))
def check_version_is_not_primary(user_context, document, version_number):
    """Check that the version is not primary."""
    version = document.versions.get(version_number=version_number)
    assert version.is_primary is False


@when(parsers.parse('I request preview data for version {version_number:d}'))
def request_preview_for_version(user_context, document, version_number):
    """Request preview data for a specific version."""
    api_client = user_context['api_client']
    version = document.versions.get(version_number=version_number)
    
    with patch('documents.views.fileserver_client.generate_download_url') as mock_download_url, \
         patch('documents.views.fileserver_client.generate_preview_url') as mock_preview_url:
        mock_download_url.return_value = "http://fileserver/files/download/token"
        mock_preview_url.return_value = "http://fileserver/files/preview/token"
        
        preview_url = f'/api/v1/documents/{document.id}/preview-data/?version_id={version.id}'
        response = api_client.get(preview_url)
        assert response.status_code == status.HTTP_200_OK
        user_context['preview_response'] = response.json()
        user_context['preview_version'] = version


@then(parsers.parse('the preview response should contain version {version_number:d} details'))
def check_preview_response_details(user_context, version_number):
    """Check that preview response details match the requested version."""
    preview_data = user_context['preview_response']
    version = user_context['preview_version']
    assert preview_data['render_error'] == version.render_error
