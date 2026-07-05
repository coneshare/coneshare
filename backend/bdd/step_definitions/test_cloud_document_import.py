import pytest
from unittest.mock import patch, MagicMock
from io import BytesIO
from pytest_bdd import parsers, scenario, given, when, then
from rest_framework import status

from documents.models import Document, DocumentVersion
from cloudfiles.models import CloudConnection
from cloudfiles.providers.base import BaseCloudProvider

pytest_plugins = "bdd.step_definitions.common_steps"


@pytest.mark.django_db
@scenario(
    '../features/cloud_document_import.feature',
    'User imports a document from cloud storage'
)
def test_import_cloud_document():
    pass


@pytest.mark.django_db
@scenario(
    '../features/cloud_document_import.feature',
    'User refreshes a document from cloud storage'
)
def test_refresh_cloud_document():
    pass


@pytest.mark.django_db
@scenario(
    '../features/cloud_document_import.feature',
    'User imports a new version from cloud storage'
)
def test_import_new_version_cloud_document():
    pass


@pytest.mark.django_db
@scenario(
    '../features/cloud_document_import.feature',
    'User uploads a new version of a cloud-imported document from local computer'
)
def test_upload_local_version_of_cloud_document():
    pass


@given(parsers.parse('I have connected a cloud provider "{provider}"'), target_fixture="connection")
def connect_provider(user_context, provider):
    user = user_context['user']
    # Delete if exists to avoid unique constraint violations
    CloudConnection.objects.filter(user=user, provider=provider).delete()
    connection = CloudConnection.objects.create(
        user=user,
        provider=provider,
        email="test@example.com",
        access_token="fake_access_token",
        refresh_token="fake_refresh_token"
    )
    user_context['connection'] = connection
    return connection


@when(parsers.parse('I import a cloud file "{filename}" of size {size:d} bytes'))
def import_cloud_file_step(user_context, connection, filename, size):
    api_client = user_context['api_client']
    
    mock_provider = MagicMock(spec=BaseCloudProvider)
    mock_provider.download_file.return_value = {
        'name': filename,
        'size': size,
        'content': BytesIO(b"fake binary content"),
        'etag_or_rev': 'fake-etag-123'
    }
    
    with patch('cloudfiles.tasks.get_cloud_provider') as mock_get_provider, \
         patch('documents.services.fileserver_client.generate_upload_url') as mock_upload_url, \
         patch('documents.services.requests.put') as mock_put:
         
        mock_get_provider.return_value = mock_provider
        mock_upload_url.return_value = "http://fileserver/upload/token"
        
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_put.return_value = mock_response
        
        response = api_client.post(
            f'/api/v1/cloud/connections/{connection.id}/import/',
            {
                'file_id': 'cloud-file-id-123',
                'file_name': filename,
                'file_size': size
            }
        )
        assert response.status_code == status.HTTP_202_ACCEPTED
        user_context['document_id'] = response.data['id']
        user_context['response_data'] = response.data


@then(parsers.parse('a new document should be created named "{filename}"'))
def check_document_created(user_context, filename):
    doc_id = user_context['document_id']
    doc = Document.objects.get(id=doc_id)
    assert doc.name == filename
    user_context['document'] = doc


@then(parsers.parse('the document\'s latest version should have cloud import metadata for "{provider}"'))
def check_latest_version_cloud_metadata(user_context, provider):
    doc = user_context['document']
    latest_version = doc.versions.order_by('-version_number').first()
    assert latest_version is not None
    assert latest_version.metadata is not None
    assert 'cloud_import' in latest_version.metadata
    assert latest_version.metadata['cloud_import']['provider'] == provider
    assert latest_version.metadata['cloud_import']['file_id'] in ('cloud-file-id-123', 'cloud-file-id-456')


@given(parsers.parse('I have a document named "{filename}" imported from cloud provider "{provider}"'), target_fixture="document")
def have_imported_document(user_context, filename, provider):
    user = user_context['user']
    # Delete if exists to avoid unique constraint violations
    CloudConnection.objects.filter(user=user, provider=provider).delete()
    connection = CloudConnection.objects.create(
        user=user,
        provider=provider,
        email="test@example.com",
        access_token="fake_access_token",
        refresh_token="fake_refresh_token"
    )
    user_context['connection'] = connection
    
    doc = Document.objects.create(
        organization=user.organization,
        created_by=user,
        name=filename,
        status='ready'
    )
    DocumentVersion.objects.create(
        document=doc,
        version_number=1,
        is_primary=True,
        file_size=1024,
        metadata={
            'cloud_import': {
                'provider': provider,
                'provider_display': provider.capitalize(),
                'connection_id': connection.id,
                'file_id': 'cloud-file-id-123',
                'etag_or_rev': 'fake-etag-123'
            }
        }
    )
    user_context['document'] = doc
    return doc


@when("I trigger a cloud refresh on the document")
def trigger_cloud_refresh(user_context, document):
    api_client = user_context['api_client']
    connection = user_context['connection']
    
    mock_provider = MagicMock(spec=BaseCloudProvider)
    mock_provider.download_file.return_value = {
        'name': document.name,
        'size': 1024,
        'content': BytesIO(b"refreshed fake binary content"),
        'etag_or_rev': 'fake-etag-456'
    }
    
    with patch('cloudfiles.tasks.get_cloud_provider') as mock_get_provider, \
         patch('documents.services.fileserver_client.generate_upload_url') as mock_upload_url, \
         patch('documents.services.requests.put') as mock_put:
         
        mock_get_provider.return_value = mock_provider
        mock_upload_url.return_value = "http://fileserver/upload/token"
        
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_put.return_value = mock_response
        
        response = api_client.post(f'/api/v1/cloud/documents/{document.id}/refresh/')
        assert response.status_code == status.HTTP_202_ACCEPTED
        user_context['response_data'] = response.data


@when(parsers.parse('I import a new version from cloud provider "{provider}" with file "{filename}" of size {size:d} bytes'))
def import_new_version_from_cloud(user_context, document, provider, filename, size):
    api_client = user_context['api_client']
    connection = user_context['connection']
    
    mock_provider = MagicMock(spec=BaseCloudProvider)
    mock_provider.download_file.return_value = {
        'name': filename,
        'size': size,
        'content': BytesIO(b"new version fake binary content"),
        'etag_or_rev': 'fake-etag-789'
    }
    
    with patch('cloudfiles.tasks.get_cloud_provider') as mock_get_provider, \
         patch('documents.services.fileserver_client.generate_upload_url') as mock_upload_url, \
         patch('documents.services.requests.put') as mock_put:
         
        mock_get_provider.return_value = mock_provider
        mock_upload_url.return_value = "http://fileserver/upload/token"
        
        mock_response = MagicMock()
        mock_response.raise_for_status.return_value = None
        mock_put.return_value = mock_response
        
        response = api_client.post(
            f'/api/v1/cloud/documents/{document.id}/import_version/',
            {
                'connection_id': connection.id,
                'file_id': 'cloud-file-id-456',
                'file_name': filename,
                'file_size': size
            }
        )
        assert response.status_code == status.HTTP_202_ACCEPTED, response.data
        user_context['response_data'] = response.data


@then(parsers.parse("the document should have {count:d} versions"))
def check_version_count(user_context, count):
    doc_id = user_context['document'].id
    doc = Document.objects.get(id=doc_id)
    assert doc.versions.count() == count


@then(parsers.parse("the document's latest version should be version number {version_number:d}"))
def check_latest_version_number(user_context, version_number):
    doc_id = user_context['document'].id
    doc = Document.objects.get(id=doc_id)
    latest_version = doc.versions.order_by('-version_number').first()
    assert latest_version is not None
    assert latest_version.version_number == version_number
    assert latest_version.is_primary is True


@when(parsers.parse('I upload a new version of the document named "{filename}" from local computer'))
def upload_local_version(user_context, document, filename):
    api_client = user_context['api_client']
    file_content = b"local new content"

    with patch('documents.fileserver.fileserver_client.generate_upload_url') as mock_upload_url, \
         patch('documents.fileserver.fileserver_client.generate_download_url') as mock_download_url, \
         patch('documents.tasks.requests.get') as mock_task_get, \
         patch('documents.tasks.requests.put') as mock_task_put, \
         patch('documents.tasks.convert_from_bytes') as mock_convert:

        mock_download_url.return_value = "http://fileserver/files/download/token"
        mock_get_response = MagicMock()
        mock_get_response.raise_for_status.return_value = None
        mock_get_response.content = file_content
        mock_task_get.return_value = mock_get_response

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
        assert finalize_response.status_code == status.HTTP_202_ACCEPTED

    user_context['response_data'] = finalize_response.data


@then("the document's latest version should not have cloud import metadata")
def check_latest_version_no_cloud_metadata(user_context):
    doc_id = user_context['document'].id
    doc = Document.objects.get(id=doc_id)
    latest_version = doc.versions.order_by('-version_number').first()
    assert latest_version is not None
    if latest_version.metadata:
        assert 'cloud_import' not in latest_version.metadata


@then(parsers.parse('version {version_number:d} should still have cloud import metadata for "{provider}"'))
def check_version_1_has_metadata(user_context, version_number, provider):
    doc_id = user_context['document'].id
    doc = Document.objects.get(id=doc_id)
    version = doc.versions.get(version_number=version_number)
    assert version.metadata is not None
    assert 'cloud_import' in version.metadata
    assert version.metadata['cloud_import']['provider'] == provider
