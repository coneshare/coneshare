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
