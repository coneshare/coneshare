from unittest.mock import patch, MagicMock
import pytest
from django.core.exceptions import ValidationError
from django.test import override_settings

from datetime import timedelta
from django.utils import timezone

from documents.models import Document, DocumentVersion, DocumentPage, Folder
from documents.renderers import get_renderer, SpreadsheetRenderer
from documents.services import (
    create_document_from_upload,
    delete_document_and_files,
    copy_document,
    QuotaExceededError,
    promote_document_version,
    create_new_document_version,
    check_user_quota_on_upload,
    touch_folder_ancestors,
    soft_delete_document,
    soft_delete_folder,
    restore_item,
    is_dataroom_vault_document,
    ensure_storage_key_not_claimed,
    safe_delete_storage_file,
    filter_unreferenced_storage_keys,
    recalculate_user_document_size,
)
from rest_framework import serializers
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
    @patch('documents.tasks.generate_pdf_pages_task.delay')
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
            render_status = get_renderer(version).enqueue_render_task(version)
     
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
            render_status = get_renderer(version).enqueue_render_task(version)
     
            assert render_status == DocumentVersion.RENDER_FAILED
            assert version.render_status == DocumentVersion.RENDER_FAILED
            assert version.render_error == "Conversion failed."

    @patch('documents.tasks.generate_pdf_pages_task.delay')
    def test_enqueue_re_evaluates_not_applicable_to_queued(self, mock_task_delay, user):
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
            render_status=DocumentVersion.RENDER_NOT_APPLICABLE,
            render_error='',
        )

        with override_settings(PDF_PREVIEW_ENGINE='server_pages'):
            render_status = get_renderer(version).enqueue_render_task(version)
            
            assert render_status == DocumentVersion.RENDER_QUEUED
            assert version.render_status == DocumentVersion.RENDER_QUEUED
            mock_task_delay.assert_called_once_with(version.id)



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
@patch('documents.services.fileserver_client.copy_file')
class TestCopySpreadsheetDocumentService:
    def test_copy_document_office_converted_to_pdf_retains_spreadsheet_properties(self, mock_copy_file, user):
        """When copying a spreadsheet whose primary version has content_type='application/pdf', the copy must retain spreadsheet type and resolve to SpreadsheetRenderer."""
        original_doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="financials.xls",
            type="spreadsheet",
            content_type="application/vnd.ms-excel",
            file_size=5000,
            status="ready",
        )
        DocumentVersion.objects.create(
            document=original_doc,
            version_number=1,
            is_primary=True,
            original_storage_key="org/fin.xls",
            storage_key="org/fin.pdf",
            type="document",
            content_type="application/pdf",
            file_size=5000,
            has_pages=False,
            render_status=DocumentVersion.RENDER_READY,
        )

        new_doc = copy_document(original_doc, user)
        new_version = new_doc.versions.first()

        assert new_doc.type == 'spreadsheet'
        assert new_doc.content_type == 'application/vnd.ms-excel'
        assert new_version.type == 'spreadsheet'
        assert new_version.content_type == 'application/vnd.ms-excel'
        renderer = get_renderer(new_version)
        assert isinstance(renderer, SpreadsheetRenderer)
        assert renderer.get_preview_mode(new_version) == 'spreadsheet'
        assert new_version.render_status == DocumentVersion.RENDER_NOT_GENERATED


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
            assert get_renderer(version).get_preview_mode(version) != 'server_pages'

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
            assert get_renderer(version).get_preview_mode(version) == 'client_pdf'
            
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
            assert get_renderer(version).get_preview_mode(version) == 'download_only'

    @patch('core.services.get_dynamic_setting')
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
            assert get_renderer(version).get_preview_mode(version) == 'video'

        version2 = DocumentVersion.objects.create(
            document=doc,
            version_number=2,
            type='video',
            is_primary=True,
            file_size=600 * 1024 * 1024, # 600MB
        )
        with override_settings(ENABLE_VIDEO_PREVIEW=True):
            assert get_renderer(version2).get_preview_mode(version2) == 'download_only'

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

    @patch('documents.tasks.generate_video_stream_task.delay')
    @patch('core.services.get_dynamic_setting')
    @patch('documents.models.get_dynamic_setting')
    def test_get_effective_render_status_re_evaluates_not_applicable_video(self, mock_models_setting, mock_core_setting, mock_task_delay, user):
        def side_effect(key, default=None):
            if key == 'MAX_PREVIEW_FILE_SIZE_MB':
                return 100
            if key == 'MAX_VIDEO_PREVIEW_SIZE_MB':
                return 100
            return default
        mock_models_setting.side_effect = side_effect
        mock_core_setting.side_effect = side_effect

        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            type='video',
            file_size=200 * 1024 * 1024, # 200MB
            download_only=True,
        )
        version = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            type='video',
            is_primary=True,
            file_size=200 * 1024 * 1024,
            render_status=DocumentVersion.RENDER_NOT_APPLICABLE,
        )

        with override_settings(ENABLE_VIDEO_PREVIEW=True):
            assert get_renderer(version).get_effective_render_status(version) == DocumentVersion.RENDER_NOT_APPLICABLE

        # Increase limit to 300MB
        def side_effect_large(key, default=None):
            if key == 'MAX_PREVIEW_FILE_SIZE_MB':
                return 100
            if key == 'MAX_VIDEO_PREVIEW_SIZE_MB':
                return 300
            return default
        mock_models_setting.side_effect = side_effect_large
        mock_core_setting.side_effect = side_effect_large

        with override_settings(ENABLE_VIDEO_PREVIEW=True):
            assert get_renderer(version).enqueue_render_task(version) == DocumentVersion.RENDER_QUEUED
            assert version.render_status == DocumentVersion.RENDER_QUEUED
            mock_task_delay.assert_called_once_with(version.id)

    @patch('documents.tasks.generate_pdf_pages_task.delay')
    @patch('core.services.get_dynamic_setting')
    @patch('documents.models.get_dynamic_setting')
    def test_get_effective_render_status_re_evaluates_not_applicable_pdf(self, mock_models_setting, mock_core_setting, mock_task_delay, user):
        def side_effect(key, default=None):
            if key == 'MAX_PREVIEW_FILE_SIZE_MB':
                return 100
            return default
        mock_models_setting.side_effect = side_effect
        mock_core_setting.side_effect = side_effect

        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            type='pdf',
            file_size=200 * 1024 * 1024, # 200MB
            download_only=True,
        )
        version = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            type='pdf',
            is_primary=True,
            file_size=200 * 1024 * 1024,
            render_status=DocumentVersion.RENDER_NOT_APPLICABLE,
        )

        with override_settings(PDF_PREVIEW_ENGINE='server_pages'):
            assert get_renderer(version).get_effective_render_status(version) == DocumentVersion.RENDER_NOT_APPLICABLE

        # Increase limit to 300MB
        def side_effect_large(key, default=None):
            if key == 'MAX_PREVIEW_FILE_SIZE_MB':
                return 300
            return default
        mock_models_setting.side_effect = side_effect_large
        mock_core_setting.side_effect = side_effect_large

        with override_settings(PDF_PREVIEW_ENGINE='server_pages'):
            assert get_renderer(version).enqueue_render_task(version) == DocumentVersion.RENDER_QUEUED
            assert version.render_status == DocumentVersion.RENDER_QUEUED
            mock_task_delay.assert_called_once_with(version.id)



@pytest.mark.django_db
class TestCreateNewDocumentVersion:
    @patch('documents.services._route_document_for_processing')
    def test_new_version_after_promote_is_only_primary(self, mock_route, user):
        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="contract.pdf",
            type="pdf",
            content_type="application/pdf",
            file_size=100,
            status="ready",
        )
        versions = [
            DocumentVersion.objects.create(
                document=doc,
                version_number=n,
                is_primary=(n == 2),  # v2 was promoted back after v3 was uploaded
                file_size=100,
                content_type="application/pdf",
                original_storage_key=f"v{n}.pdf",
                storage_key=f"v{n}.pdf",
                type="pdf",
            )
            for n in (1, 2, 3)
        ]

        new_version = create_new_document_version(
            document=doc,
            requesting_user=user,
            storage_key="v4.pdf",
            file_size=100,
            content_type="application/pdf",
        )

        assert new_version.version_number == 4
        assert list(doc.versions.filter(is_primary=True)) == [new_version]
        for version in versions:
            version.refresh_from_db()
            assert not version.is_primary
        mock_route.assert_called_once()

    def test_create_new_document_version_refreshes_caller_document_instance(self, user):
        """create_new_document_version must refresh the caller's document instance in-place."""
        doc = Document.objects.create(
            name="initial_doc.txt",
            organization=user.organization,
            created_by=user,
            file_size=1024,
            content_type="text/plain",
            type="txt",
        )
        DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            is_primary=True,
            file_size=1024,
            content_type="text/plain",
            storage_key="initial.txt",
            original_storage_key="initial.txt",
            type="txt",
        )

        new_version = create_new_document_version(
            document=doc,
            requesting_user=user,
            storage_key=f"{user.organization.id}/new_version.pdf",
            file_size=8192,
            content_type="application/pdf",
        )

        assert new_version.version_number == 2
        # doc instance passed in must have refreshed attributes from DB
        assert doc.file_size == 8192
        assert doc.type == "pdf"
        assert doc.content_type == "application/pdf"

    @patch('documents.services._route_document_for_processing')
    def test_create_new_document_version_in_vault_does_not_consume_user_quota(self, mock_route, user):
        """Creating a new version for a vault document must not modify user's personal total_document_size."""
        root_folder = Folder.objects.create(
            name="__root__",
            organization=user.organization,
            created_by=None,
            parent=None,
            folder_type=Folder.FOLDER_TYPE_ROOT,
        )
        vault_folder = Folder.objects.create(
            name="__datarooms__",
            organization=user.organization,
            created_by=None,
            parent=root_folder,
            folder_type=Folder.FOLDER_TYPE_VAULT,
        )
        room_folder = Folder.objects.create(
            name="Room_1",
            organization=user.organization,
            created_by=None,
            parent=vault_folder,
            folder_type=Folder.FOLDER_TYPE_VAULT,
        )

        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            folder=room_folder,
            name="vault_doc.pdf",
            type="pdf",
            content_type="application/pdf",
            file_size=100,
            status="ready",
        )
        assert is_dataroom_vault_document(doc) is True

        user.total_document_size = 1000
        user.save()

        new_version = create_new_document_version(
            document=doc,
            requesting_user=user,
            storage_key="vault_v2.pdf",
            file_size=500,
            content_type="application/pdf",
        )

        user.refresh_from_db()
        assert user.total_document_size == 1000, "User personal quota must not be modified for vault document versions"
        assert new_version.version_number == 1

    @patch('documents.services._route_document_for_processing')
    def test_create_new_document_version_in_vault_enforces_dataroom_storage_quota(self, mock_route, user):
        """Creating a new version for a vault document must enforce Dataroom storage quota."""
        from datarooms.models import Dataroom, DataroomDocument

        room = Dataroom.objects.create(
            name="Deal Room",
            organization=user.organization,
            created_by=user,
            storage_quota_mb=1,  # 1 MB quota limit
            storage_version=2,
        )
        root_folder = Folder.objects.create(
            name="__root__",
            organization=user.organization,
            created_by=None,
            parent=None,
            folder_type=Folder.FOLDER_TYPE_ROOT,
        )
        vault_folder = Folder.objects.create(
            name="__datarooms__",
            organization=user.organization,
            created_by=None,
            parent=root_folder,
            folder_type=Folder.FOLDER_TYPE_VAULT,
        )
        room_folder = Folder.objects.create(
            name="Deal_Room",
            organization=user.organization,
            created_by=None,
            parent=vault_folder,
            folder_type=Folder.FOLDER_TYPE_VAULT,
        )

        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            folder=room_folder,
            name="vault_doc.pdf",
            type="pdf",
            content_type="application/pdf",
            file_size=500 * 1024,
            status="ready",
        )
        DataroomDocument.objects.create(dataroom=room, document=doc, name="vault_doc.pdf")

        # Upload a 2MB version, which exceeds 1MB Dataroom limit
        with pytest.raises(QuotaExceededError, match="exceed the Dataroom storage limit"):
            create_new_document_version(
                document=doc,
                requesting_user=user,
                storage_key="vault_v2_large.pdf",
                file_size=2 * 1024 * 1024,
                content_type="application/pdf",
            )

    @patch('documents.services._route_document_for_processing')
    def test_create_new_document_version_in_vault_locks_datarooms_in_stable_order(self, mock_route, user):
        """Creating a new version in a vault document must lock affected Datarooms with select_for_update in stable ID order."""
        from datarooms.models import Dataroom, DataroomDocument

        room1 = Dataroom.objects.create(
            name="Room 1",
            organization=user.organization,
            created_by=user,
            storage_quota_mb=10,
            storage_version=2,
        )
        room2 = Dataroom.objects.create(
            name="Room 2",
            organization=user.organization,
            created_by=user,
            storage_quota_mb=10,
            storage_version=2,
        )

        root_folder = Folder.objects.create(
            name="__root__",
            organization=user.organization,
            created_by=None,
            parent=None,
            folder_type=Folder.FOLDER_TYPE_ROOT,
        )
        vault_folder = Folder.objects.create(
            name="__datarooms__",
            organization=user.organization,
            created_by=None,
            parent=root_folder,
            folder_type=Folder.FOLDER_TYPE_VAULT,
        )
        room_folder = Folder.objects.create(
            name="Room_1",
            organization=user.organization,
            created_by=None,
            parent=vault_folder,
            folder_type=Folder.FOLDER_TYPE_VAULT,
        )

        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            folder=room_folder,
            name="vault_doc.pdf",
            type="pdf",
            content_type="application/pdf",
            file_size=100,
            status="ready",
        )
        DataroomDocument.objects.create(dataroom=room1, document=doc, name="vault_doc.pdf")
        DataroomDocument.objects.create(dataroom=room2, document=doc, name="vault_doc.pdf")

        original_select_for_update = Dataroom.objects.select_for_update
        locked_datarooms_fetched = []

        def spy_select_for_update(*args, **kwargs):
            qs = original_select_for_update(*args, **kwargs)
            original_filter = qs.filter
            def spy_filter(*f_args, **f_kwargs):
                sub_qs = original_filter(*f_args, **f_kwargs)
                original_order_by = sub_qs.order_by
                def spy_order_by(*o_args, **o_kwargs):
                    ordered_qs = original_order_by(*o_args, **o_kwargs)
                    locked_datarooms_fetched.append((list(o_args), list(ordered_qs)))
                    return ordered_qs
                sub_qs.order_by = spy_order_by
                return sub_qs
            qs.filter = spy_filter
            return qs

        with patch.object(Dataroom.objects, 'select_for_update', side_effect=spy_select_for_update) as mock_sfu:
            create_new_document_version(doc, user, "vault_v2.pdf", 200, "application/pdf")
            assert mock_sfu.called, "Dataroom.objects.select_for_update must be called to serialize quota checks"
            assert len(locked_datarooms_fetched) == 1
            order_by_args, locked_rooms = locked_datarooms_fetched[0]
            assert order_by_args == ['id'], "Datarooms must be ordered by 'id' to prevent deadlocks"
            assert [r.id for r in locked_rooms] == sorted([room1.id, room2.id])



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

    def test_promote_version_in_vault_does_not_consume_user_quota(self, user):
        """Promoting a version of a vault document should not increase user's total_document_size."""
        root_folder = Folder.objects.create(
            name="__root__",
            organization=user.organization,
            created_by=None,
            parent=None,
            folder_type=Folder.FOLDER_TYPE_ROOT,
        )
        vault_folder = Folder.objects.create(
            name="__datarooms__",
            organization=user.organization,
            created_by=None,
            parent=root_folder,
            folder_type=Folder.FOLDER_TYPE_VAULT,
        )
        room_folder = Folder.objects.create(
            name="Room_1",
            organization=user.organization,
            created_by=None,
            parent=vault_folder,
            folder_type=Folder.FOLDER_TYPE_VAULT,
        )

        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            folder=room_folder,
            name="vault_doc.pdf",
            type="pdf",
            content_type="application/pdf",
            file_size=100,
            status="ready",
        )
        assert is_dataroom_vault_document(doc) is True

        v1 = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            is_primary=True,
            file_size=100,
            content_type="application/pdf",
            original_storage_key="vault_v1.pdf",
            storage_key="vault_v1.pdf",
            type="pdf",
            render_status=DocumentVersion.RENDER_READY,
        )
        v2 = DocumentVersion.objects.create(
            document=doc,
            version_number=2,
            is_primary=False,
            file_size=500,
            content_type="application/pdf",
            original_storage_key="vault_v2.pdf",
            storage_key="vault_v2.pdf",
            type="pdf",
            render_status=DocumentVersion.RENDER_READY,
        )

        user.total_document_size = 0
        user.save()

        # Act
        promote_document_version(doc, v2, user)

        # Assert document updated
        doc.refresh_from_db()
        assert doc.file_size == 500
        v2.refresh_from_db()
        assert v2.is_primary is True

        # Assert user's personal quota was NOT affected
        user.refresh_from_db()
        assert user.total_document_size == 0

    @patch('core.services.get_dynamic_setting')
    def test_promote_version_in_vault_succeeds_when_user_quota_exhausted(self, mock_get_setting, user):
        """Promoting a version of a vault document should not be blocked if the user's personal quota is full."""
        def get_setting_mock(key):
            if key == 'FILE_SIZE_QUOTA_MB':
                return 1  # 1 MB quota
            elif key == 'MAX_PREVIEW_FILE_SIZE_MB':
                return 100
            elif key == 'MAX_VIDEO_PREVIEW_SIZE_MB':
                return 100
            return 0
        mock_get_setting.side_effect = get_setting_mock

        root_folder = Folder.objects.create(
            name="__root__",
            organization=user.organization,
            created_by=None,
            parent=None,
            folder_type=Folder.FOLDER_TYPE_ROOT,
        )
        vault_folder = Folder.objects.create(
            name="__datarooms__",
            organization=user.organization,
            created_by=None,
            parent=root_folder,
            folder_type=Folder.FOLDER_TYPE_VAULT,
        )
        room_folder = Folder.objects.create(
            name="Room_1",
            organization=user.organization,
            created_by=None,
            parent=vault_folder,
            folder_type=Folder.FOLDER_TYPE_VAULT,
        )

        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            folder=room_folder,
            name="vault_doc.pdf",
            type="pdf",
            content_type="application/pdf",
            file_size=500 * 1024,
            status="ready",
        )
        v1 = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            is_primary=True,
            file_size=500 * 1024,
            content_type="application/pdf",
            original_storage_key="vault_v1.pdf",
            storage_key="vault_v1.pdf",
            type="pdf",
            render_status=DocumentVersion.RENDER_READY,
        )
        v2 = DocumentVersion.objects.create(
            document=doc,
            version_number=2,
            is_primary=False,
            file_size=2 * 1024 * 1024,  # 2 MB (> 1 MB user quota limit)
            content_type="application/pdf",
            original_storage_key="vault_v2.pdf",
            storage_key="vault_v2.pdf",
            type="pdf",
            render_status=DocumentVersion.RENDER_READY,
        )

        # User's personal storage quota is completely exhausted
        user.total_document_size = 1024 * 1024
        user.save()

        # Act: promoting the version on a vault document should succeed
        promote_document_version(doc, v2, user)

        doc.refresh_from_db()
        assert doc.file_size == 2 * 1024 * 1024
        user.refresh_from_db()
        assert user.total_document_size == 1024 * 1024

    def test_promote_version_in_vault_respects_dataroom_quota(self, user):
        """Promoting a version of a vault document should enforce dataroom storage quota."""
        from datarooms.models import Dataroom, DataroomDocument

        dataroom = Dataroom.objects.create(
            name="Confidential Project",
            organization=user.organization,
            created_by=user,
            storage_quota_mb=1,  # 1 MB quota limit
            storage_version=2,
        )

        root_folder = Folder.objects.create(
            name="__root__",
            organization=user.organization,
            created_by=None,
            parent=None,
            folder_type=Folder.FOLDER_TYPE_ROOT,
        )
        vault_folder = Folder.objects.create(
            name="__datarooms__",
            organization=user.organization,
            created_by=None,
            parent=root_folder,
            folder_type=Folder.FOLDER_TYPE_VAULT,
        )
        room_folder = Folder.objects.create(
            name="Room_1",
            organization=user.organization,
            created_by=None,
            parent=vault_folder,
            folder_type=Folder.FOLDER_TYPE_VAULT,
        )

        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            folder=room_folder,
            name="vault_doc.pdf",
            type="pdf",
            content_type="application/pdf",
            file_size=500 * 1024,
            status="ready",
        )
        DataroomDocument.objects.create(
            dataroom=dataroom,
            document=doc,
            name="vault_doc.pdf",
            is_direct_upload=True,
        )

        v1 = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            is_primary=True,
            file_size=500 * 1024,
            content_type="application/pdf",
            original_storage_key="vault_v1.pdf",
            storage_key="vault_v1.pdf",
            type="pdf",
            render_status=DocumentVersion.RENDER_READY,
        )
        v2 = DocumentVersion.objects.create(
            document=doc,
            version_number=2,
            is_primary=False,
            file_size=2 * 1024 * 1024,  # 2 MB (> 1 MB dataroom limit)
            content_type="application/pdf",
            original_storage_key="vault_v2.pdf",
            storage_key="vault_v2.pdf",
            type="pdf",
            render_status=DocumentVersion.RENDER_READY,
        )

        with pytest.raises(QuotaExceededError, match="Promoting this version would exceed the Dataroom storage limit"):
            promote_document_version(doc, v2, user)

    def test_promote_version_in_vault_locks_datarooms_in_stable_order(self, user):
        """Promoting a version of a vault document must lock affected Datarooms with select_for_update in stable ID order."""
        from datarooms.models import Dataroom, DataroomDocument

        room1 = Dataroom.objects.create(
            name="Room 1",
            organization=user.organization,
            created_by=user,
            storage_quota_mb=10,
            storage_version=2,
        )
        room2 = Dataroom.objects.create(
            name="Room 2",
            organization=user.organization,
            created_by=user,
            storage_quota_mb=10,
            storage_version=2,
        )

        root_folder = Folder.objects.create(
            name="__root__",
            organization=user.organization,
            created_by=None,
            parent=None,
            folder_type=Folder.FOLDER_TYPE_ROOT,
        )
        vault_folder = Folder.objects.create(
            name="__datarooms__",
            organization=user.organization,
            created_by=None,
            parent=root_folder,
            folder_type=Folder.FOLDER_TYPE_VAULT,
        )
        room_folder = Folder.objects.create(
            name="Room_1",
            organization=user.organization,
            created_by=None,
            parent=vault_folder,
            folder_type=Folder.FOLDER_TYPE_VAULT,
        )

        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            folder=room_folder,
            name="vault_doc.pdf",
            type="pdf",
            content_type="application/pdf",
            file_size=100,
            status="ready",
        )
        DataroomDocument.objects.create(dataroom=room1, document=doc, name="vault_doc.pdf")
        DataroomDocument.objects.create(dataroom=room2, document=doc, name="vault_doc.pdf")

        v1 = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            is_primary=True,
            file_size=100,
            content_type="application/pdf",
            original_storage_key="vault_v1.pdf",
            storage_key="vault_v1.pdf",
            type="pdf",
            render_status=DocumentVersion.RENDER_READY,
        )
        v2 = DocumentVersion.objects.create(
            document=doc,
            version_number=2,
            is_primary=False,
            file_size=200,
            content_type="application/pdf",
            original_storage_key="vault_v2.pdf",
            storage_key="vault_v2.pdf",
            type="pdf",
            render_status=DocumentVersion.RENDER_READY,
        )

        original_select_for_update = Dataroom.objects.select_for_update
        locked_datarooms_fetched = []

        def spy_select_for_update(*args, **kwargs):
            qs = original_select_for_update(*args, **kwargs)
            # Wrap the queryset evaluation or save the query
            original_filter = qs.filter
            def spy_filter(*f_args, **f_kwargs):
                sub_qs = original_filter(*f_args, **f_kwargs)
                original_order_by = sub_qs.order_by
                def spy_order_by(*o_args, **o_kwargs):
                    ordered_qs = original_order_by(*o_args, **o_kwargs)
                    locked_datarooms_fetched.append((list(o_args), list(ordered_qs)))
                    return ordered_qs
                sub_qs.order_by = spy_order_by
                return sub_qs
            qs.filter = spy_filter
            return qs

        with patch.object(Dataroom.objects, 'select_for_update', side_effect=spy_select_for_update) as mock_sfu:
            promote_document_version(doc, v2, user)
            assert mock_sfu.called, "Dataroom.objects.select_for_update must be called to serialize quota checks"
            assert len(locked_datarooms_fetched) == 1
            order_by_args, locked_rooms = locked_datarooms_fetched[0]
            assert order_by_args == ['id'], "Datarooms must be ordered by 'id' to prevent deadlocks"
            expected_ids = sorted([room1.id, room2.id])
            assert [r.id for r in locked_rooms] == expected_ids




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


@pytest.mark.django_db
class TestFolderMtimeUpdates:
    def test_touch_folder_ancestors_updates_tree(self, user):
        """Test that touch_folder_ancestors updates the timestamp of the folder and all its ancestors."""
        past_time = timezone.now() - timedelta(days=2)
        root = Folder.objects.create(name="Root", organization=user.organization, created_by=user)
        sub1 = Folder.objects.create(name="Sub1", parent=root, organization=user.organization, created_by=user)
        sub2 = Folder.objects.create(name="Sub2", parent=sub1, organization=user.organization, created_by=user)

        Folder.objects.filter(id__in=[root.id, sub1.id, sub2.id]).update(updated_at=past_time)
        root.refresh_from_db()
        sub1.refresh_from_db()
        sub2.refresh_from_db()
        assert root.updated_at == past_time
        assert sub1.updated_at == past_time
        assert sub2.updated_at == past_time

        touch_folder_ancestors(sub2)

        root.refresh_from_db()
        sub1.refresh_from_db()
        sub2.refresh_from_db()
        assert root.updated_at > past_time
        assert sub1.updated_at > past_time
        assert sub2.updated_at > past_time

    def test_create_document_touches_parent_folder(self, user):
        """Test that uploading/creating a document touches parent folder updated_at."""
        past_time = timezone.now() - timedelta(days=1)
        folder = Folder.objects.create(name="Folder", organization=user.organization, created_by=user)
        Folder.objects.filter(id=folder.id).update(updated_at=past_time)
        folder.refresh_from_db()
        assert folder.updated_at == past_time

        create_document_from_upload(
            requesting_user=user,
            folder=folder,
            storage_key=f"{user.organization.id}/test.pdf",
            unique_name="test.pdf",
            file_size=100,
            content_type="application/pdf"
        )

        folder.refresh_from_db()
        assert folder.updated_at > past_time

    def test_soft_delete_and_restore_document_touches_parent_folder(self, user):
        """Test that soft deleting and restoring a document touches parent folder updated_at."""
        past_time = timezone.now() - timedelta(days=1)
        folder = Folder.objects.create(name="Folder", organization=user.organization, created_by=user)
        doc = Document.objects.create(
            name="file.pdf",
            organization=user.organization,
            folder=folder,
            created_by=user,
            type="pdf",
            content_type="application/pdf"
        )
        Folder.objects.filter(id=folder.id).update(updated_at=past_time)
        folder.refresh_from_db()
        assert folder.updated_at == past_time

        # 1. Soft delete touches parent folder
        soft_delete_document(doc, user)
        folder.refresh_from_db()
        assert folder.updated_at > past_time

        # 2. Reset and restore touches parent folder
        Folder.objects.filter(id=folder.id).update(updated_at=past_time)
        folder.refresh_from_db()
        assert folder.updated_at == past_time

        restore_item(doc, 'document', user)
        folder.refresh_from_db()
        assert folder.updated_at > past_time

    def test_soft_delete_folder_touches_parent_folder(self, user):
        """Test that soft deleting a subfolder touches its parent folder updated_at."""
        past_time = timezone.now() - timedelta(days=1)
        parent = Folder.objects.create(name="Parent", organization=user.organization, created_by=user)
        child = Folder.objects.create(name="Child", parent=parent, organization=user.organization, created_by=user)
        Folder.objects.filter(id=parent.id).update(updated_at=past_time)
        parent.refresh_from_db()
        assert parent.updated_at == past_time

        soft_delete_folder(child, user)
        parent.refresh_from_db()
        assert parent.updated_at > past_time

    def test_promote_document_version_touches_parent_folder(self, user):
        """Test that promoting a document version touches parent folder updated_at."""
        past_time = timezone.now() - timedelta(days=1)
        folder = Folder.objects.create(name="Folder", organization=user.organization, created_by=user)
        doc = Document.objects.create(
            name="file.pdf",
            organization=user.organization,
            folder=folder,
            created_by=user,
            type="pdf",
            content_type="application/pdf",
            file_size=100
        )
        v1 = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            is_primary=True,
            file_size=100,
            content_type="application/pdf",
            storage_key="v1.pdf",
            type="pdf"
        )
        v2 = DocumentVersion.objects.create(
            document=doc,
            version_number=2,
            is_primary=False,
            file_size=200,
            content_type="application/pdf",
            storage_key="v2.pdf",
            type="pdf"
        )
        Folder.objects.filter(id=folder.id).update(updated_at=past_time)
        folder.refresh_from_db()
        assert folder.updated_at == past_time

        promote_document_version(doc, v2, user)
        folder.refresh_from_db()
        assert folder.updated_at > past_time

    def test_touch_folder_ancestors_with_cycle_safely_terminates(self, user):
        """Test that touch_folder_ancestors does not infinite-loop if there is a cycle."""
        f1 = Folder.objects.create(name="F1", organization=user.organization, created_by=user)
        f2 = Folder.objects.create(name="F2", parent=f1, organization=user.organization, created_by=user)
        # Mock a cycle in memory
        f1.parent = f2
        touch_folder_ancestors(f2)  # Should terminate cleanly without hanging


class TestStorageKeyIsolationAndSafeDeletion:
    def test_ensure_storage_key_not_claimed_raises_on_existing_document(self, user):
        """Verifies that an existing document's storage key is rejected on re-registration."""
        key = f"{user.organization.id}/existing/file.pdf"
        Document.objects.create(
            name="Existing.pdf",
            organization=user.organization,
            created_by=user,
            original_storage_key=key,
            storage_key=key,
        )
        with pytest.raises(serializers.ValidationError) as exc:
            ensure_storage_key_not_claimed(key, user.organization.id)
        assert "This storage key has already been registered." in str(exc.value)

    def test_ensure_storage_key_not_claimed_raises_on_existing_version(self, user):
        """Verifies that an existing document version's storage key is rejected on re-registration."""
        key = f"{user.organization.id}/version/file.pdf"
        doc = Document.objects.create(
            name="Doc.pdf",
            organization=user.organization,
            created_by=user,
        )
        DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key=key,
            storage_key=key,
        )
        with pytest.raises(serializers.ValidationError) as exc:
            ensure_storage_key_not_claimed(key, user.organization.id)
        assert "This storage key has already been registered." in str(exc.value)

    def test_ensure_storage_key_not_claimed_passes_for_fresh_key(self, user):
        """Verifies that an unclaimed storage key passes validation without errors."""
        fresh_key = f"{user.organization.id}/fresh/unclaimed.pdf"
        ensure_storage_key_not_claimed(fresh_key, user.organization.id)

    @patch('documents.services.fileserver_client.delete_file')
    def test_safe_delete_storage_file_deletes_when_no_other_references(self, mock_delete, user):
        """Verifies that physical deletion occurs when no other document records reference the key."""
        key = f"{user.organization.id}/single/doc.pdf"
        result = safe_delete_storage_file(key, user.organization.id)
        assert result is True
        mock_delete.assert_called_once_with(key)

    @patch('documents.services.fileserver_client.delete_file')
    def test_safe_delete_storage_file_skips_when_another_document_references_key(self, mock_delete, user):
        """Verifies that physical deletion is skipped when another document references the same storage key."""
        key = f"{user.organization.id}/shared/doc.pdf"
        Document.objects.create(
            name="Retained.pdf",
            organization=user.organization,
            created_by=user,
            original_storage_key=key,
            storage_key=key,
        )
        result = safe_delete_storage_file(key, user.organization.id)
        assert result is False
        mock_delete.assert_not_called()

    def test_ensure_storage_key_not_claimed_raises_on_soft_deleted_document(self, user):
        """Verifies that a soft-deleted document's storage key is still treated as claimed."""
        key = f"{user.organization.id}/soft_deleted/file.pdf"
        Document.objects.create(
            name="SoftDeleted.pdf",
            organization=user.organization,
            created_by=user,
            original_storage_key=key,
            storage_key=key,
            deleted_at=timezone.now(),
        )
        with pytest.raises(serializers.ValidationError) as exc:
            ensure_storage_key_not_claimed(key, user.organization.id)
        assert "This storage key has already been registered." in str(exc.value)

    def test_filter_unreferenced_storage_keys_batches_correctly(self, user):
        """Verifies that filter_unreferenced_storage_keys accurately filters out referenced keys."""
        k1 = f"{user.organization.id}/doc1.pdf"
        k2 = f"{user.organization.id}/doc2.pdf"
        k3 = f"{user.organization.id}/doc3.pdf"

        Document.objects.create(name="Doc1", organization=user.organization, created_by=user, original_storage_key=k1)
        Document.objects.create(name="Doc2", organization=user.organization, created_by=user, original_storage_key=k2)

        # k1 and k2 are referenced, k3 is unreferenced
        unreferenced = filter_unreferenced_storage_keys({k1, k2, k3}, user.organization.id)
        assert unreferenced == {k3}

        # If we exclude Doc1, k1 becomes unreferenced as well
        doc1 = Document.objects.get(name="Doc1")
        unreferenced_with_exclusion = filter_unreferenced_storage_keys(
            {k1, k2, k3}, user.organization.id, exclude_document_ids=[doc1.pk]
        )
        assert unreferenced_with_exclusion == {k1, k3}


@pytest.mark.django_db
class TestDataConsistencyBatch1:
    @patch('documents.services.safe_delete_storage_file')
    def test_quota_recalculation_includes_trashed_documents_and_no_double_subtract(self, mock_delete, user):
        """
        Bug 1: Recalculate quota must include trashed documents because they still
        consume storage until purged. Purging from trash must not subtract twice
        or make total_document_size negative.
        """
        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="test.pdf",
            status="ready",
            file_size=1000,
        )
        user.total_document_size = 1000
        user.save()

        # 1. Soft-delete document into Trash
        soft_delete_document(doc, user)
        assert doc.deleted_at is not None
        user.refresh_from_db()
        assert user.total_document_size == 1000

        # 2. Recalculate quota while document is in Trash
        recalculated = recalculate_user_document_size(user)
        # MUST count trashed documents (still taking up physical disk space)
        assert recalculated == 1000
        user.refresh_from_db()
        assert user.total_document_size == 1000

        # 3. Permanently purge the document from Trash
        delete_document_and_files(doc)
        user.refresh_from_db()
        assert user.total_document_size == 0

    @patch('documents.services.safe_delete_storage_file')
    def test_delete_document_and_files_prevents_negative_quota(self, mock_delete, user):
        """
        Bug 1: Defensive guard ensures total_document_size never goes below 0.
        """
        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="test.pdf",
            status="ready",
            file_size=5000,
        )
        user.total_document_size = 1000  # Smaller than file_size
        user.save()

        delete_document_and_files(doc)
        user.refresh_from_db()
        assert user.total_document_size == 0

    @patch('documents.services.safe_delete_storage_file')
    def test_delete_video_document_deletes_hls_directory(self, mock_safe_delete, user):
        """
        Bug 9: Deleting a video document must enqueue the entire _hls directory
        so orphaned .ts segments are not left on disk.
        """
        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="demo.mp4",
            status="ready",
            type="video",
            file_size=1000,
        )
        version = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key="org_1/videos/demo.mp4",
            storage_key="org_1/videos/demo_hls/playlist.m3u8",
            type="video",
            is_primary=True,
        )

        delete_document_and_files(doc)

        # Check all keys passed to safe_delete_storage_file
        deleted_keys = {call.args[0] for call in mock_safe_delete.call_args_list}
        assert "org_1/videos/demo.mp4" in deleted_keys
        assert "org_1/videos/demo_hls" in deleted_keys

    @patch('documents.services.fileserver_client.delete_file')
    def test_delete_folder_and_contents_deletes_hls_directory(self, mock_delete_file, user):
        """
        Finding 1: Deleting a folder containing video documents must enqueue and delete
        the entire _hls directory.
        """
        from documents.services import delete_folder_and_contents

        folder = Folder.objects.create(
            organization=user.organization,
            name="VideoFolder",
            created_by=user,
        )
        doc = Document.objects.create(
            organization=user.organization,
            folder=folder,
            created_by=user,
            name="demo.mp4",
            status="ready",
            type="video",
            file_size=1000,
        )
        DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key=f"{user.organization.id}/videos/demo.mp4",
            storage_key=f"{user.organization.id}/videos/demo_hls/playlist.m3u8",
            type="video",
            is_primary=True,
        )

        delete_folder_and_contents(folder)

        deleted_keys = {call.args[0] for call in mock_delete_file.call_args_list}
        assert f"{user.organization.id}/videos/demo.mp4" in deleted_keys
        assert f"{user.organization.id}/videos/demo_hls" in deleted_keys

    def test_filter_unreferenced_storage_keys_handles_hls_prefix_referencing(self, user):
        """
        Finding 2: filter_unreferenced_storage_keys must correctly detect references
        to an _hls directory prefix.
        """
        hls_dir = f"{user.organization.id}/videos/demo_hls"
        playlist_key = f"{hls_dir}/playlist.m3u8"

        doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="video.mp4",
            status="ready",
            type="video",
            file_size=1000,
        )
        DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            original_storage_key=f"{user.organization.id}/videos/video.mp4",
            storage_key=playlist_key,
            type="video",
            is_primary=True,
        )

        # 1. hls_dir is referenced by doc's version
        unreferenced = filter_unreferenced_storage_keys({hls_dir}, user.organization.id)
        assert unreferenced == set(), "hls_dir should be detected as referenced"

        # 2. When doc is excluded, hls_dir becomes unreferenced
        unreferenced_excluded = filter_unreferenced_storage_keys(
            {hls_dir}, user.organization.id, exclude_document_ids=[doc.pk]
        )
        assert unreferenced_excluded == {hls_dir}








