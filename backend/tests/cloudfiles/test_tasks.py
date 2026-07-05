import pytest
from unittest.mock import patch, MagicMock
from cloudfiles.tasks import import_from_cloud_task
from cloudfiles.models import CloudConnection
from documents.models import Document, DocumentVersion
from cloudfiles.providers import CloudProviderError

@pytest.fixture
def cloud_connection(user):
    return CloudConnection.objects.create(
        user=user,
        provider='dropbox',
        email='test@dropbox.com',
        access_token='test_access_token',
    )

@pytest.mark.django_db
@patch('cloudfiles.tasks.get_cloud_provider')
@patch('cloudfiles.tasks.process_imported_file')
def test_import_from_cloud_task_success(mock_process, mock_get_provider, cloud_connection, user):
    document = Document.objects.create(
        name="test.pdf",
        organization=user.organization,
        created_by=user,
        status="uploading"
    )
    version = DocumentVersion.objects.create(
        document=document,
        version_number=1,
        is_primary=True,
    )

    mock_provider = MagicMock()
    mock_provider.download_file.return_value = {
        'name': 'test.pdf',
        'size': 100,
        'content': None,
        'etag_or_rev': 'rev123'
    }
    mock_get_provider.return_value = mock_provider

    import_from_cloud_task(document.id, cloud_connection.id, '/test.pdf', version_id=version.id)

    mock_process.assert_called_once_with(document, mock_provider.download_file.return_value, version_id=version.id)


@pytest.mark.django_db
@patch('cloudfiles.tasks.get_cloud_provider')
def test_import_from_cloud_task_failure_revert(mock_get_provider, cloud_connection, user):
    document = Document.objects.create(
        name="test.pdf",
        organization=user.organization,
        created_by=user,
        status="uploading",
        file_size=50,
        content_type="application/pdf",
        type="pdf"
    )
    # Previous primary version
    v1 = DocumentVersion.objects.create(
        document=document,
        version_number=1,
        is_primary=False,
        file_size=50,
        content_type="application/pdf",
        type="pdf"
    )
    # Failed new version
    v2 = DocumentVersion.objects.create(
        document=document,
        version_number=2,
        is_primary=True,
        file_size=100,
        content_type="application/pdf",
        type="pdf"
    )

    mock_provider = MagicMock()
    mock_provider.download_file.side_effect = CloudProviderError("Connection error")
    mock_get_provider.return_value = mock_provider

    import_from_cloud_task(document.id, cloud_connection.id, '/test.pdf', version_id=v2.id)

    # Document should be reverted back to ready status
    document.refresh_from_db()
    assert document.status == 'ready'
    assert "Last update failed: Connection error" in document.status_message
    assert document.file_size == 50

    # Previous version should be restored to primary
    v1.refresh_from_db()
    assert v1.is_primary is True

    # Failed version should be deleted
    assert not DocumentVersion.objects.filter(id=v2.id).exists()


@pytest.mark.django_db
@patch('cloudfiles.tasks.get_cloud_provider')
def test_import_from_cloud_task_failure_first_version(mock_get_provider, cloud_connection, user):
    document = Document.objects.create(
        name="test.pdf",
        organization=user.organization,
        created_by=user,
        status="uploading",
    )
    v1 = DocumentVersion.objects.create(
        document=document,
        version_number=1,
        is_primary=True,
    )

    mock_provider = MagicMock()
    mock_provider.download_file.side_effect = CloudProviderError("Connection error")
    mock_get_provider.return_value = mock_provider

    import_from_cloud_task(document.id, cloud_connection.id, '/test.pdf', version_id=v1.id)

    document.refresh_from_db()
    assert document.status == 'error'
    assert "Import failed: Connection error" in document.status_message
    assert DocumentVersion.objects.filter(id=v1.id).exists()
