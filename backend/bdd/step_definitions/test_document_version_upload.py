import pytest
from unittest.mock import patch, MagicMock
from django.core.files.uploadedfile import SimpleUploadedFile
from pytest_bdd import parsers, scenario, given, when, then

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
    dummy_file = SimpleUploadedFile(filename, b"new content", "application/pdf")

    # Mock the PDF conversion to avoid dependency on poppler-utils in CI
    with patch('documents.tasks.convert_from_bytes', return_value=[MagicMock()]):
        response = api_client.post(
            f'/api/v1/documents/{document.id}/versions/',
            {'file': dummy_file},
            format='multipart'
        )
    user_context['response'] = response
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
