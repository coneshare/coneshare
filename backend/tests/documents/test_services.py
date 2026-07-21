from unittest.mock import patch, MagicMock
import pytest
from django.core.exceptions import ValidationError
from django.test import override_settings

from documents.models import Document, DocumentVersion, DocumentPage
from documents.services import (
    create_document_from_upload,
    delete_document_and_files,
    copy_document,
    enqueue_server_preview_render,
    QuotaExceededError,
    preview_mode_for_version,
    is_server_renderable_version,
    promote_document_version,
    check_user_quota_on_upload,
)
from core.services import get_dynamic_setting



@pytest.mark.django_db
class TestCreateDocumentFromUpload:
    @patch('documents.services.generate_pdf_pages_task.delay')
    def test_service_creates_records_and_dispatches_task(self, mock_task_delay, user):
        # Call the service function
        document = create_document_from_upload(
            requesting_user=user,
            folder=None,
            storage_key=f"{user.organization.id}/mock_path.pdf",
            unique_name="test.pdf",
            file_size=123,
            content_type="application/pdf"
        )

        # 1. Assert one Document object was created with correct fields
        assert Document.objects.count() == 1
        created_document = Document.objects.first()
        assert created_document == document
        assert created_document.status == 'ready'
        assert created_document.name == 'test.pdf'
        assert created_document.created_by == user

        # 2. Assert one DocumentVersion object was created correctly
        assert DocumentVersion.objects.count() == 1
        version = DocumentVersion.objects.first()
        assert version.document == created_document
        assert version.version_number == 1
        assert version.original_storage_key == f"{user.organization.id}/mock_path.pdf"
        assert version.file_size == 123
        assert version.render_status == DocumentVersion.RENDER_NOT_GENERATED
        assert version.has_pages is False

        # 3. Assert that preview rendering is deferred until first preview access.
        mock_task_delay.assert_not_called()


@pytest.mark.django_db
class TestEnqueueServerPreviewRender:
    @patch('documents.services.generate_pdf_pages_task.delay')
    def test_enqueue_updates_in_memory_render_state(self, mock_task_delay, user):
        document = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="queued.pdf",
            status='ready',
            type='pdf',
            content_type='application/pdf',
            download_only=False,
        )
        version = DocumentVersion.objects.create(
            document=document,
            version_number=1,
            original_storage_key="queued.pdf",
            storage_key="queued.pdf",
            type='pdf',
            is_primary=True,
            render_status=DocumentVersion.RENDER_NOT_GENERATED,
            render_error="stale error",
        )

        with override_settings(PDF_PREVIEW_ENGINE='server_pages'):
            render_status = enqueue_server_preview_render(version)
     
            assert render_status == DocumentVersion.RENDER_QUEUED
            assert version.render_status == DocumentVersion.RENDER_QUEUED
            assert version.render_error == ''
            mock_task_delay.assert_called_once_with(version.id)

    def test_enqueue_refreshes_render_error_when_concurrent_update_wins(self, user):
        document = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="failed.pdf",
            status='ready',
            type='pdf',
            content_type='application/pdf',
            download_only=False,
        )
        version = DocumentVersion.objects.create(
            document=document,
            version_number=1,
            original_storage_key="failed.pdf",
            storage_key="failed.pdf",
            type='pdf',
            is_primary=True,
            render_status=DocumentVersion.RENDER_NOT_GENERATED,
            render_error='',
        )

        DocumentVersion.objects.filter(pk=version.pk).update(
            render_status=DocumentVersion.RENDER_FAILED,
            render_error="Conversion failed.",
        )

        with override_settings(PDF_PREVIEW_ENGINE='server_pages'):
            render_status = enqueue_server_preview_render(version)
     
            assert render_status == DocumentVersion.RENDER_FAILED
            assert version.render_status == DocumentVersion.RENDER_FAILED
            assert version.render_error == "Conversion failed."



@pytest.mark.django_db
class TestDeleteDocument:
    @patch('documents.services.fileserver_client.delete_file')
    def test_service_deletes_db_records_and_storage_files(self, mock_fs_delete, user):
        # Setup
        doc = Document.objects.create(organization=user.organization, created_by=user)
        version = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="original.pdf"
        )
        page1 = DocumentPage.objects.create(
            document_version=version, page_number=1, storage_key="page_1.png"
        )
        page2 = DocumentPage.objects.create(
            document_version=version, page_number=2, storage_key="page_2.png"
        )
        
        doc_id = doc.id
        version_id = version.id
        page1_id = page1.id

        # Action
        delete_document_and_files(doc)

        # Assertions
        # 1. DB records are deleted
        assert not Document.objects.filter(id=doc_id).exists()
        assert not DocumentVersion.objects.filter(id=version_id).exists()
        assert not DocumentPage.objects.filter(id=page1_id).exists()

        # 2. Storage deletion was called for all files
        assert mock_fs_delete.call_count == 3
        mock_fs_delete.assert_any_call("original.pdf")
        mock_fs_delete.assert_any_call("page_1.png")
        mock_fs_delete.assert_any_call("page_2.png")


@pytest.mark.django_db
@patch('documents.services.fileserver_client.copy_file')
@patch('documents.services._route_document_for_processing')
class TestCopyDocumentService:

    def test_copy_document_success(self, mock_route_for_processing, mock_copy_file, user, document):
        """Test that copy_document service successfully creates a copy."""
        # Arrange
        original_doc = document
        original_doc.file_size = 1000
        original_doc.save()
        user.total_document_size = 1000
        user.save()

        # Act
        new_doc = copy_document(original_doc, user)

        # Assert
        assert Document.objects.count() == 2
        assert DocumentVersion.objects.count() == 2

        assert new_doc.id != original_doc.id
        assert new_doc.name == "Test Document (2).pdf"
        assert new_doc.created_by == user
        assert new_doc.file_size == original_doc.file_size

        # Check fileserver was called
        mock_copy_file.assert_called_once()

        # Check user quota was updated
        user.refresh_from_db()
        assert user.total_document_size == 2000

        # Check processing was triggered
        mock_route_for_processing.assert_called_once()

    @patch('core.services.get_dynamic_setting', return_value=1)
    def test_copy_document_respects_quota(self, mock_get_setting, mock_route_for_processing, mock_copy_file, user, document):
        """Test that copy_document fails if user quota is exceeded."""
        # Arrange
        original_doc = document
        original_doc.file_size = 2 * 1024 * 1024  # 2MB
        original_doc.save()

        user.total_document_size = 0
        user.save()

        with override_settings(FILE_SIZE_QUOTA_MB=1):
            with pytest.raises(QuotaExceededError):
                copy_document(original_doc, user)

        assert Document.objects.count() == 1  # No copy was created
        mock_copy_file.assert_not_called()
        user.refresh_from_db()
        assert user.total_document_size == 0  # User size wasn't updated

    def test_copy_document_removes_uploader_info(self, mock_route_for_processing, mock_copy_file, user, document):
        """Test that uploader_info is removed from metadata on copy, but other metadata is kept."""
        # Arrange
        original_doc = document
        original_doc.file_size = 1000
        original_doc.metadata = {'uploader_info': {'name': 'test', 'email': 'test@test.com'}, 'other_key': 'value'}
        original_doc.save()

        # Act
        new_doc = copy_document(original_doc, user)

        # Assert
        assert 'uploader_info' in original_doc.metadata
        assert 'uploader_info' not in new_doc.metadata
        assert 'other_key' in new_doc.metadata
        assert new_doc.metadata['other_key'] == 'value'


@pytest.mark.django_db
class TestPreviewModeServices:
    def test_is_server_renderable_version_client_pdf(self, user):
        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            type='pdf',
            download_only=False,
        )
        version = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            type='pdf',
            is_primary=True,
        )
        
        with override_settings(PDF_PREVIEW_ENGINE='pdfjs'):
            assert not is_server_renderable_version(version)

    def test_preview_mode_for_version_client_pdf(self, user):
        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            type='pdf',
            download_only=False,
        )
        version = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            type='pdf',
            is_primary=True,
        )
        
        with override_settings(PDF_PREVIEW_ENGINE='pdfjs'):
            assert preview_mode_for_version(version) == 'client_pdf'
            
    def test_preview_mode_for_version_office_disabled(self, user):
        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            type='document',
            download_only=False,
        )
        version = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            type='document',
            is_primary=True,
        )
        
        with override_settings(PDF_PREVIEW_ENGINE='server_pages', ENABLE_OFFICE_PREVIEW=False):
            assert preview_mode_for_version(version) == 'download_only'

    @patch('documents.services.get_dynamic_setting')
    def test_preview_mode_for_large_video_respects_video_limit(self, mock_get_setting, user):
        def side_effect(key, default=None):
            if key == 'MAX_PREVIEW_FILE_SIZE_MB':
                return 100
            if key == 'MAX_VIDEO_PREVIEW_SIZE_MB':
                return 500
            return default
        mock_get_setting.side_effect = side_effect

        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            type='video',
            download_only=False,
        )
        version = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            type='video',
            is_primary=True,
            file_size=300 * 1024 * 1024, # 300MB
        )
        
        with override_settings(ENABLE_VIDEO_PREVIEW=True):
            assert preview_mode_for_version(version) == 'video'

        version2 = DocumentVersion.objects.create(
            document=doc,
            version_number=2,
            type='video',
            is_primary=True,
            file_size=600 * 1024 * 1024, # 600MB
        )
        with override_settings(ENABLE_VIDEO_PREVIEW=True):
            assert preview_mode_for_version(version2) == 'download_only'

    @patch('documents.models.get_dynamic_setting')
    def test_dynamic_is_download_only_video_respects_limit(self, mock_get_setting, user):
        def side_effect(key, default=None):
            if key == 'MAX_PREVIEW_FILE_SIZE_MB':
                return 100
            if key == 'MAX_VIDEO_PREVIEW_SIZE_MB':
                return 500
            return default
        mock_get_setting.side_effect = side_effect

        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            type='video',
            file_size=600 * 1024 * 1024, # 600MB
            download_only=False,
        )

        with override_settings(ENABLE_VIDEO_PREVIEW=True):
            # Over the 500MB limit, so download_only should be True dynamically
            assert doc.is_download_only is True

        # Increase limit to 1000MB
        def side_effect_large(key, default=None):
            if key == 'MAX_PREVIEW_FILE_SIZE_MB':
                return 100
            if key == 'MAX_VIDEO_PREVIEW_SIZE_MB':
                return 1000
            return default
        mock_get_setting.side_effect = side_effect_large

        with override_settings(ENABLE_VIDEO_PREVIEW=True):
            # Within the new 1000MB limit, so download_only should be False dynamically
            assert doc.is_download_only is False


@pytest.mark.django_db
class TestPromoteDocumentVersion:
    def test_promote_version_success(self, user):
        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="test_promote.pdf",
            type="pdf",
            content_type="application/pdf",
            file_size=100,
            status="ready",
        )
        v1 = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            is_primary=True,
            file_size=100,
            content_type="application/pdf",
            original_storage_key="test_v1.pdf",
            storage_key="test_v1.pdf",
            type="pdf",
            render_status=DocumentVersion.RENDER_READY,
        )
        v2 = DocumentVersion.objects.create(
            document=doc,
            version_number=2,
            is_primary=False,
            file_size=200,
            content_type="application/pdf",
            original_storage_key="test_v2.pdf",
            storage_key="test_v2.pdf",
            type="pdf",
            render_status=DocumentVersion.RENDER_FAILED,
            render_error="Some rendering error",
        )

        user.total_document_size = 100
        user.save()

        # Act
        promote_document_version(doc, v2, user)

        # Assert version state
        v1.refresh_from_db()
        v2.refresh_from_db()
        assert not v1.is_primary
        assert v2.is_primary

        # Assert document metadata sync
        doc.refresh_from_db()
        assert doc.file_size == 200
        assert doc.storage_key == "test_v2.pdf"
        assert doc.status == "error"
        assert doc.status_message == "Some rendering error"

        # Assert user quota size update
        user.refresh_from_db()
        assert user.total_document_size == 200

    def test_promote_version_wrong_document(self, user):
        doc1 = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="doc1.pdf",
            type="pdf",
            content_type="application/pdf",
        )
        doc2 = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="doc2.pdf",
            type="pdf",
            content_type="application/pdf",
        )
        v_other = DocumentVersion.objects.create(
            document=doc2,
            version_number=1,
            is_primary=True,
            file_size=100,
            content_type="application/pdf",
            original_storage_key="other.pdf",
            storage_key="other.pdf",
            type="pdf",
        )

        with pytest.raises(ValidationError, match="The selected version does not belong to this document."):
            promote_document_version(doc1, v_other, user)

    def test_promote_already_primary_version(self, user):
        """Promoting the already-active version must raise a ValidationError."""
        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="already_primary.pdf",
            type="pdf",
            content_type="application/pdf",
            file_size=100,
            status="ready",
        )
        v1 = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            is_primary=True,
            file_size=100,
            content_type="application/pdf",
            original_storage_key="v1.pdf",
            storage_key="v1.pdf",
            type="pdf",
            render_status=DocumentVersion.RENDER_READY,
        )

        with pytest.raises(ValidationError, match="already the active version"):
            promote_document_version(doc, v1, user)

    def test_check_user_quota_on_upload_respects_custom_quota(self, user):
        """Test that check_user_quota_on_upload respects custom user quota if set, else falls back to global."""
        user.total_document_size = 50 * 1024 * 1024  # 50MB
        user.save()

        # 1. Custom quota set to 40MB (exceeded)
        user.custom_file_size_quota_mb = 40
        user.save()
        with pytest.raises(QuotaExceededError, match="Uploading this file would exceed your storage quota of 40 MB"):
            check_user_quota_on_upload(user, 10)

        # 2. Custom quota set to 60MB (allowed)
        user.custom_file_size_quota_mb = 60
        user.save()
        check_user_quota_on_upload(user, 10 * 1024 * 1024)  # 10MB upload

        # 3. Custom quota set to None (fallback to dynamic setting of e.g. 100MB)
        user.custom_file_size_quota_mb = None
        user.save()
        with patch('core.services.get_dynamic_setting', return_value=100):
            check_user_quota_on_upload(user, 10 * 1024 * 1024)  # 10MB upload allowed under 100MB fallback

        # 4. Custom quota set to None, but fallback exceeded
        user.custom_file_size_quota_mb = None
        user.save()
        with patch('core.services.get_dynamic_setting', return_value=45):
            with pytest.raises(QuotaExceededError, match="Uploading this file would exceed your storage quota of 45 MB"):
                check_user_quota_on_upload(user, 10)


