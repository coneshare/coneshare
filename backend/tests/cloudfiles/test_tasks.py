from datetime import timedelta, timezone as dt_timezone
from io import BytesIO
from unittest.mock import patch, MagicMock

import pytest
from django.utils import timezone
from google.auth.exceptions import RefreshError
from google.oauth2.credentials import Credentials

from cloudfiles.models import CloudConnection
from cloudfiles.providers import CloudProviderError
from cloudfiles.providers.google_drive import GoogleDriveProvider
from cloudfiles.tasks import import_from_cloud_task
from core.models import AppConfiguration
from documents.models import Document, DocumentVersion

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
def test_import_from_cloud_task_failure_restores_correct_previous_primary_version_and_resyncs_quota(mock_get_provider, cloud_connection, user):
    document = Document.objects.create(
        name="test.pdf",
        organization=user.organization,
        created_by=user,
        status="uploading",
        file_size=50,
        content_type="application/pdf",
        type="pdf"
    )
    # v1 was the active primary version before the refresh attempt
    v1 = DocumentVersion.objects.create(
        document=document,
        version_number=1,
        is_primary=False,
        file_size=50,
        content_type="application/pdf",
        type="pdf"
    )
    # v2 was a non-primary version with a different size
    v2 = DocumentVersion.objects.create(
        document=document,
        version_number=2,
        is_primary=False,
        file_size=500,
        content_type="application/pdf",
        type="pdf"
    )
    # v3 is the new version created for refresh that fails
    v3 = DocumentVersion.objects.create(
        document=document,
        version_number=3,
        is_primary=True,
        file_size=100,
        content_type="application/pdf",
        type="pdf",
        metadata={
            "cloud_import": {
                "previous_primary_version_id": v1.id,
            },
            "previous_primary_version_id": v1.id,
        }
    )
    user.total_document_size = 50
    user.save(update_fields=['total_document_size'])

    mock_provider = MagicMock()
    mock_provider.download_file.side_effect = CloudProviderError("Network timeout")
    mock_get_provider.return_value = mock_provider

    import_from_cloud_task(document.id, cloud_connection.id, '/test.pdf', version_id=v3.id)

    document.refresh_from_db()
    v1.refresh_from_db()
    v2.refresh_from_db()
    user.refresh_from_db()

    # Crucial assertion: v1 must be restored to primary, NOT v2
    assert v1.is_primary is True
    assert v2.is_primary is False
    assert document.file_size == 50
    assert user.total_document_size == 50


@pytest.mark.django_db
@patch('cloudfiles.tasks.get_cloud_provider')
def test_import_from_cloud_task_failure_skips_restoring_predecessor_when_failed_version_no_longer_primary(mock_get_provider, cloud_connection, user):
    document = Document.objects.create(
        name="test.pdf",
        organization=user.organization,
        created_by=user,
        status="ready",
        file_size=300,
        content_type="application/pdf",
        type="pdf"
    )
    # v1 was original primary
    v1 = DocumentVersion.objects.create(
        document=document,
        version_number=1,
        is_primary=False,
        file_size=100,
        content_type="application/pdf",
        type="pdf"
    )
    # v2 was started as a cloud import (had v1 as predecessor), but was later superseded
    v2 = DocumentVersion.objects.create(
        document=document,
        version_number=2,
        is_primary=False,  # no longer primary!
        file_size=200,
        content_type="application/pdf",
        type="pdf",
        metadata={
            "cloud_import": {"previous_primary_version_id": v1.id},
            "previous_primary_version_id": v1.id,
        }
    )
    # v3 was imported or promoted successfully and is the current active primary version
    v3 = DocumentVersion.objects.create(
        document=document,
        version_number=3,
        is_primary=True,
        file_size=300,
        content_type="application/pdf",
        type="pdf"
    )
    user.total_document_size = 300
    user.save(update_fields=['total_document_size'])

    mock_provider = MagicMock()
    mock_provider.download_file.side_effect = CloudProviderError("Import failed")
    mock_get_provider.return_value = mock_provider

    # v2's background import fails after v3 already became primary
    import_from_cloud_task(document.id, cloud_connection.id, '/test.pdf', version_id=v2.id)

    document.refresh_from_db()
    v1.refresh_from_db()
    v3.refresh_from_db()
    user.refresh_from_db()

    # v2 must be deleted
    assert not DocumentVersion.objects.filter(id=v2.id).exists()
    # v3 must remain the sole primary version
    assert v3.is_primary is True
    assert v1.is_primary is False
    assert DocumentVersion.objects.filter(document=document, is_primary=True).count() == 1
    # Document attributes and quota should stay intact for v3
    assert document.file_size == 300
    assert document.status == "ready"
    assert user.total_document_size == 300


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


@pytest.mark.django_db
@patch('cloudfiles.tasks.get_cloud_provider')
@patch('documents.services.fileserver_client')
@patch('documents.services.requests.put')
def test_import_from_cloud_task_quota_revert(mock_put, mock_fileserver, mock_get_provider, cloud_connection, user):
    document = Document.objects.create(
        name="test.pdf",
        organization=user.organization,
        created_by=user,
        status="uploading",
        file_size=50,
        content_type="application/pdf",
        type="pdf"
    )
    v1 = DocumentVersion.objects.create(
        document=document,
        version_number=1,
        is_primary=False,
        file_size=50,
        content_type="application/pdf",
        type="pdf"
    )
    v2 = DocumentVersion.objects.create(
        document=document,
        version_number=2,
        is_primary=True,
        file_size=100,
        content_type="application/pdf",
        type="pdf"
    )

    AppConfiguration.objects.update_or_create(key='FILE_SIZE_QUOTA_MB', defaults={'value': '100'})

    user.total_document_size = 98 * 1024 * 1024  # 98MB
    user.save()

    mock_provider = MagicMock()
    mock_provider.download_file.return_value = {
        'name': 'test.pdf',
        'size': 5 * 1024 * 1024, # 5MB (under the 100MB limit, but exceeds user's remaining quota)
        'content': MagicMock(),
        'etag_or_rev': 'rev123'
    }
    mock_get_provider.return_value = mock_provider

    mock_fileserver.generate_upload_url.return_value = "http://mock.upload"
    mock_put.return_value.status_code = 200

    import_from_cloud_task(document.id, cloud_connection.id, '/test.pdf', version_id=v2.id)

    document.refresh_from_db()
    assert document.status == 'ready'
    assert "exceed your storage quota" in document.status_message

    v1.refresh_from_db()
    assert v1.is_primary is True
    assert not DocumentVersion.objects.filter(id=v2.id).exists()


@pytest.mark.django_db
@patch('cloudfiles.tasks.get_cloud_provider')
def test_import_from_cloud_task_error_truncation(mock_get_provider, cloud_connection, user):
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
    huge_error = "A" * 500
    mock_provider.download_file.side_effect = CloudProviderError(huge_error)
    mock_get_provider.return_value = mock_provider

    import_from_cloud_task(document.id, cloud_connection.id, '/test.pdf', version_id=v1.id)

    document.refresh_from_db()
    assert document.status == 'error'
    assert len(document.status_message) <= 255
    assert document.status_message.endswith("...")


@pytest.mark.django_db
@patch('cloudfiles.tasks.get_cloud_provider')
def test_import_from_cloud_task_respects_dynamic_max_size(mock_get_provider, cloud_connection, user):
    AppConfiguration.objects.update_or_create(key='CLOUD_IMPORT_MAX_SIZE_MB', defaults={'value': '50'})
    try:
        document = Document.objects.create(
            name="large.pdf",
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
        mock_provider.download_file.return_value = {
            'name': 'large.pdf',
            'size': 60 * 1024 * 1024,  # 60MB (under static 100MB, but over dynamic 50MB)
            'content': BytesIO(b"test data"),
            'etag_or_rev': 'rev123'
        }
        mock_get_provider.return_value = mock_provider

        import_from_cloud_task(document.id, cloud_connection.id, '/large.pdf', version_id=v1.id)

        document.refresh_from_db()
        assert document.status == 'error'
        assert "exceeds the 50MB limit" in document.status_message
    finally:
        AppConfiguration.objects.filter(key='CLOUD_IMPORT_MAX_SIZE_MB').delete()
        from django.core.cache import cache
        cache.clear()


@pytest.mark.django_db
@patch('cloudfiles.providers.nextcloud.httpx.Client')
def test_nextcloud_download_file_fallback_size_when_content_length_missing(mock_client_cls, cloud_connection):
    from cloudfiles.providers.nextcloud import NextcloudProvider
    cloud_connection.provider = 'nextcloud'
    cloud_connection.save()

    with patch('cloudfiles.providers.nextcloud.get_dynamic_setting') as mock_setting:
        mock_setting.side_effect = lambda k: {
            'NEXT_CLOUD_HOST': 'https://nextcloud.example.com',
            'NEXT_CLOUD_CLIENT_ID': 'id',
            'NEXT_CLOUD_CLIENT_SECRET': 'secret',
        }.get(k, '')

        provider = NextcloudProvider(connection=cloud_connection)

        # Mock stream response with NO content-length header
        mock_response = MagicMock()
        mock_response.headers = {}  # missing Content-Length
        mock_response.iter_bytes.return_value = [b"1234567890" * 100]  # 1000 bytes
        mock_response.__enter__.return_value = mock_response

        mock_client = MagicMock()
        mock_client.stream.return_value = mock_response
        mock_client_cls.return_value.__enter__.return_value = mock_client

        result = provider.download_file('/remote.php/dav/files/user/test.pdf')

        # Size must be 1000 bytes, not 0
        assert result['size'] == 1000


@pytest.mark.django_db
@patch('cloudfiles.providers.google_drive.build')
def test_google_drive_list_files_handles_refresh_error(mock_build, cloud_connection):
    cloud_connection.provider = 'google_drive'
    cloud_connection.access_token = 'token'
    cloud_connection.save()

    with patch('cloudfiles.providers.google_drive.get_dynamic_setting') as mock_setting:
        mock_setting.side_effect = lambda k: {
            'GOOGLE_DRIVE_CLIENT_ID': 'id',
            'GOOGLE_DRIVE_CLIENT_SECRET': 'secret',
        }.get(k, '')

        provider = GoogleDriveProvider(connection=cloud_connection)

        mock_service = MagicMock()
        mock_service.files.return_value.list.return_value.execute.side_effect = RefreshError(
            "('invalid_grant: Token has been expired or revoked.', {'error': 'invalid_grant'})"
        )
        mock_build.return_value = mock_service

        with pytest.raises(CloudProviderError) as exc_info:
            provider.list_files('/')

        assert "Token has been expired or revoked" in str(exc_info.value) or "Google Drive" in str(exc_info.value)


@pytest.mark.django_db
@patch('cloudfiles.providers.google_drive.build')
def test_google_drive_proactively_refreshes_expired_token(mock_build, cloud_connection):
    cloud_connection.provider = 'google_drive'
    cloud_connection.access_token = 'old_access_token'
    cloud_connection.refresh_token = 'valid_refresh_token'
    # Expired 10 minutes ago
    cloud_connection.expires_at = timezone.now() - timedelta(minutes=10)
    cloud_connection.save()

    with patch('cloudfiles.providers.google_drive.get_dynamic_setting') as mock_setting:
        mock_setting.side_effect = lambda k: {
            'GOOGLE_DRIVE_CLIENT_ID': 'id',
            'GOOGLE_DRIVE_CLIENT_SECRET': 'secret',
        }.get(k, '')

        future_naive_expiry = (timezone.now() + timedelta(hours=1)).replace(tzinfo=None)

        with patch.object(Credentials, 'refresh', autospec=True) as mock_refresh:
            def fake_refresh(creds_self, request):
                creds_self.token = 'refreshed_access_token'
                creds_self.expiry = future_naive_expiry
            mock_refresh.side_effect = fake_refresh

            provider = GoogleDriveProvider(connection=cloud_connection)
            provider._get_client()

            assert mock_refresh.called, "creds.refresh should have been called proactively"
            cloud_connection.refresh_from_db()
            assert cloud_connection.access_token == 'refreshed_access_token'
            assert timezone.is_aware(cloud_connection.expires_at)
            assert cloud_connection.expires_at == timezone.make_aware(future_naive_expiry, dt_timezone.utc)


@pytest.mark.django_db
@patch('cloudfiles.providers.google_drive.build')
def test_google_drive_upload_file_handles_refresh_error(mock_build, cloud_connection):
    cloud_connection.provider = 'google_drive'
    cloud_connection.access_token = 'token'
    cloud_connection.save()

    with patch('cloudfiles.providers.google_drive.get_dynamic_setting') as mock_setting:
        mock_setting.side_effect = lambda k: {
            'GOOGLE_DRIVE_CLIENT_ID': 'id',
            'GOOGLE_DRIVE_CLIENT_SECRET': 'secret',
        }.get(k, '')

        provider = GoogleDriveProvider(connection=cloud_connection)

        mock_service = MagicMock()
        mock_service.files.return_value.create.return_value.execute.side_effect = RefreshError(
            "('invalid_grant: Bad Request', {'error': 'invalid_grant'})"
        )
        mock_build.return_value = mock_service

        with pytest.raises(CloudProviderError) as exc_info:
            provider.upload_file(BytesIO(b'content'), 'test.txt', 'root')

        assert "authorization token may have expired or been revoked" in str(exc_info.value)




