import pytest
from django.test import override_settings
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, force_authenticate

from sharelinks.models import ShareLink
from datarooms.models import DataroomDocument, DataroomFolder, DataroomItemOrder
from datarooms.serializers import (
    AddContentSerializer,
    DataroomDetailSerializer,
    DataroomDocumentSerializer,
    DataroomFolderSerializer,
    DataroomSerializer,
    MoveDataroomContentSerializer,
    PublicDataroomDocumentSerializer,
    PublicDataroomFolderSerializer,
    EnsureDataroomFolderPathsSerializer,
    DataroomUploadRequestSerializer,
    DataroomUploadFinalizeSerializer,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def serializer_context(user):
    """Creates a mock request context for serializers."""
    factory = APIRequestFactory()
    request = factory.post("/")
    force_authenticate(request, user=user)
    return {"request": Request(request)}


class TestDataroomSerializer:
    def test_dataroom_serializer(self, dataroom, serializer_context):
        serializer = DataroomSerializer(instance=dataroom, context=serializer_context)
        data = serializer.data
        assert data["id"] == str(dataroom.id)
        assert data["name"] == dataroom.name
        assert data["created_by"] == str(dataroom.created_by.id)
        assert "show_file_index" in data
        assert "brand_primary_color" in data
        assert "brand_secondary_color" in data
        assert "brand_accent_color" in data

    def test_dataroom_detail_serializer(
        self, dataroom, document, serializer_context
    ):
        # Add content to the dataroom
        DataroomDocument.objects.create(dataroom=dataroom, document=document, name=document.name)
        DataroomFolder.objects.create(dataroom=dataroom, name="Root Folder", parent=None)

        serializer = DataroomDetailSerializer(
            instance=dataroom, context=serializer_context
        )
        data = serializer.data

        assert data["id"] == str(dataroom.id)
        assert len(data["items"]) == 2
        assert {item["type"] for item in data["items"]} == {"folder", "document"}

    def test_dataroom_serializer_validates_hex_colors(self, dataroom, serializer_context):
        serializer = DataroomSerializer(
            instance=dataroom,
            data={"brand_primary_color": "not-a-color"},
            partial=True,
            context=serializer_context,
        )
        assert not serializer.is_valid()
        assert "brand_primary_color" in serializer.errors

    @override_settings(SITE_DOMAIN="http://test.coneshare.com")
    def test_dataroom_serializer_builds_branding_banner_url_from_site_domain(self, dataroom, serializer_context):
        dataroom.branding_banner.name = (
            f"dataroom-branding/{dataroom.organization_id}/{dataroom.id}/banner.jpeg"
        )
        serializer = DataroomSerializer(instance=dataroom, context=serializer_context)
        data = serializer.data
        assert data["branding_banner"] == (
            f"http://test.coneshare.com/media/dataroom-branding/{dataroom.organization_id}/{dataroom.id}/banner.jpeg"
        )

    def test_dataroom_detail_items_use_item_order_when_enabled(self, dataroom, document, serializer_context):
        folder = DataroomFolder.objects.create(dataroom=dataroom, name="Root Folder", parent=None)
        ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=document, name=document.name)
        dataroom.show_file_index = True
        dataroom.save(update_fields=["show_file_index"])

        DataroomItemOrder.objects.create(
            dataroom=dataroom,
            parent_folder=None,
            item_type=DataroomItemOrder.ITEM_TYPE_DOCUMENT,
            dataroom_document=ddoc,
            position=0,
        )
        DataroomItemOrder.objects.create(
            dataroom=dataroom,
            parent_folder=None,
            item_type=DataroomItemOrder.ITEM_TYPE_FOLDER,
            folder=folder,
            position=1,
        )

        serializer = DataroomDetailSerializer(instance=dataroom, context=serializer_context)
        data = serializer.data
        assert data["items"][0]["type"] == "document"
        assert data["items"][0]["id"] == str(ddoc.id)
        assert data["items"][0]["position"] == 0
        assert data["items"][1]["type"] == "folder"
        assert data["items"][1]["id"] == str(folder.id)
        assert data["items"][1]["position"] == 1

    def test_dataroom_detail_serializer_preserves_item_order_when_file_index_disabled(self, dataroom, document, serializer_context):
        folder = DataroomFolder.objects.create(dataroom=dataroom, name="A Folder", parent=None)
        ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=document, name=document.name)
        dataroom.show_file_index = False
        dataroom.save(update_fields=["show_file_index"])

        DataroomItemOrder.objects.create(
            dataroom=dataroom,
            parent_folder=None,
            item_type=DataroomItemOrder.ITEM_TYPE_DOCUMENT,
            dataroom_document=ddoc,
            position=0,
        )
        DataroomItemOrder.objects.create(
            dataroom=dataroom,
            parent_folder=None,
            item_type=DataroomItemOrder.ITEM_TYPE_FOLDER,
            folder=folder,
            position=1,
        )

        serializer = DataroomDetailSerializer(instance=dataroom, context=serializer_context)
        data = serializer.data
        assert data["items"][0]["type"] == "document"
        assert data["items"][0]["id"] == str(ddoc.id)
        assert data["items"][0]["position"] == 0
        assert data["items"][1]["type"] == "folder"
        assert data["items"][1]["id"] == str(folder.id)
        assert data["items"][1]["position"] == 1


class TestDataroomFolderSerializer:
    def test_dataroom_folder_serializer(self, dataroom, serializer_context, user2):
        folder = DataroomFolder.objects.create(
            dataroom=dataroom, name="My Folder", parent=None, created_by=user2
        )
        serializer = DataroomFolderSerializer(
            instance=folder, context=serializer_context
        )
        data = serializer.data

        assert data["id"] == str(folder.id)
        assert data["name"] == "My Folder"
        assert data["dataroom"] == str(dataroom.id)
        assert data["parent"] is None
        assert data["created_by"]["id"] == str(user2.id)
        assert data["created_by"]["email"] == user2.email

    def test_dataroom_folder_serializer_fallback_to_dataroom_creator(self, dataroom, serializer_context):
        folder = DataroomFolder.objects.create(
            dataroom=dataroom, name="Legacy Folder", parent=None, created_by=None
        )
        serializer = DataroomFolderSerializer(
            instance=folder, context=serializer_context
        )
        data = serializer.data

        assert data["created_by"]["id"] == str(dataroom.created_by.id)
        assert data["created_by"]["email"] == dataroom.created_by.email


class TestDataroomDocumentSerializer:
    def test_dataroom_view_count_defaults_to_zero_without_annotation(self, dataroom, document, serializer_context):
        ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=document, name=document.name)

        serializer = DataroomDocumentSerializer(instance=ddoc, context=serializer_context)

        assert serializer.data["dataroom_view_count"] == 0


class TestAddContentSerializer:
    def test_add_content_serializer_valid(self, document):
        data = {"document_ids": [str(document.id)]}
        serializer = AddContentSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_add_content_serializer_empty_fails(self):
        data = {"document_ids": [], "folder_ids": []}
        serializer = AddContentSerializer(data=data)
        assert not serializer.is_valid()
        assert "must be provided" in str(serializer.errors)

    def test_add_content_serializer_no_ids_fails(self):
        data = {}
        serializer = AddContentSerializer(data=data)
        assert not serializer.is_valid()
        assert "must be provided" in str(serializer.errors)


class TestMoveContentSerializer:
    def test_move_content_serializer_valid(self):
        data = {
            "dataroom_document_ids": ["doc_id_1"],
            "destination_folder_id": "folder_id_1"
        }
        serializer = MoveDataroomContentSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_move_content_serializer_to_root(self):
        data = {
            "dataroom_folder_ids": ["folder_id_1"],
            "destination_folder_id": None
        }
        serializer = MoveDataroomContentSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_move_content_serializer_empty_fails(self):
        data = {
            "dataroom_document_ids": [],
            "dataroom_folder_ids": [],
            "destination_folder_id": "folder_id_1"
        }
        serializer = MoveDataroomContentSerializer(data=data)
        assert not serializer.is_valid()
        assert "must be provided" in str(serializer.errors)

    def test_move_content_serializer_no_ids_fails(self):
        data = { "destination_folder_id": "folder_id_1" }
        serializer = MoveDataroomContentSerializer(data=data)
        assert not serializer.is_valid()
        assert "must be provided" in str(serializer.errors)


class TestPublicDataroomSerializers:
    def test_public_document_serializer(self, dataroom, document, user):
        """
        Test that the public document serializer correctly includes data
        from the model and context.
        """
        ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=document, name=document.name)
        link = ShareLink.objects.create(dataroom=dataroom, created_by=user, allow_download=False)
        setting = link.dataroom_settings.get(dataroom_document=ddoc)
        setting.allow_download = False
        setting.save()

        # The settings map is built in the view. We replicate it here.
        settings_map = {ddoc.id: {'allow_download': False, 'enable_watermark': False}}
        context = {'settings_map': settings_map}

        serializer = PublicDataroomDocumentSerializer(instance=ddoc, context=context)
        data = serializer.data

        assert data['id'] == str(ddoc.id)
        assert data['name'] == document.name
        assert data['allow_download'] is False  # From context
        assert data['enable_watermark'] is False  # From context

    def test_public_folder_serializer(self, dataroom, user):
        """
        Test that the public folder serializer correctly includes data
        from the model and context.
        """
        dfolder = DataroomFolder.objects.create(dataroom=dataroom, name="Test Folder")
        link = ShareLink.objects.create(dataroom=dataroom, created_by=user, allow_download=True)
        setting = link.dataroom_settings.get(dataroom_folder=dfolder)
        setting.allow_download = True
        setting.save()

        settings_map = {dfolder.id: {'allow_download': True, 'enable_watermark': False}}
        context = {'settings_map': settings_map}

        serializer = PublicDataroomFolderSerializer(instance=dfolder, context=context)
        data = serializer.data

        assert data['id'] == str(dfolder.id)
        assert data['name'] == "Test Folder"
        assert data['allow_download'] is True  # From context


class TestEnsureDataroomFolderPathsSerializer:
    def test_valid_safe_paths(self):
        data = {
            "paths": ["foo/bar", "baz/qux", "a\\b\\c"]
        }
        serializer = EnsureDataroomFolderPathsSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["paths"] == ["foo/bar", "baz/qux", "a/b/c"]

    def test_absolute_paths_fail(self):
        data = {
            "paths": ["/foo/bar"]
        }
        serializer = EnsureDataroomFolderPathsSerializer(data=data)
        assert not serializer.is_valid()
        assert "paths" in serializer.errors

    def test_directory_traversal_fails(self):
        data = {
            "paths": ["foo/../../bar"]
        }
        serializer = EnsureDataroomFolderPathsSerializer(data=data)
        assert not serializer.is_valid()
        assert "paths" in serializer.errors

    def test_traversal_starting_with_dots_fails(self):
        data = {
            "paths": ["../foo"]
        }
        serializer = EnsureDataroomFolderPathsSerializer(data=data)
        assert not serializer.is_valid()
        assert "paths" in serializer.errors

    def test_redundant_separators_normalized(self):
        data = {
            "paths": ["foo//bar", "foo/./bar"]
        }
        serializer = EnsureDataroomFolderPathsSerializer(data=data)
        assert serializer.is_valid()
        assert serializer.validated_data["paths"] == ["foo/bar", "foo/bar"]


class TestDataroomUploadRequestSerializer:
    def test_valid_safe_path(self):
        data = {
            "file_name": "test.txt",
            "file_size": 100,
            "path": "foo/bar"
        }
        serializer = DataroomUploadRequestSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["path"] == "foo/bar"

    def test_backslash_normalized(self):
        data = {
            "file_name": "test.txt",
            "file_size": 100,
            "path": "foo\\bar"
        }
        serializer = DataroomUploadRequestSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["path"] == "foo/bar"

    def test_absolute_path_fails(self):
        data = {
            "file_name": "test.txt",
            "file_size": 100,
            "path": "/foo"
        }
        serializer = DataroomUploadRequestSerializer(data=data)
        assert not serializer.is_valid()
        assert "path" in serializer.errors

    def test_directory_traversal_fails(self):
        data = {
            "file_name": "test.txt",
            "file_size": 100,
            "path": "../foo"
        }
        serializer = DataroomUploadRequestSerializer(data=data)
        assert not serializer.is_valid()
        assert "path" in serializer.errors


class TestDataroomUploadFinalizeSerializer:
    def test_valid_safe_path(self):
        data = {
            "storage_key": "key",
            "unique_name": "unique",
            "file_size": 100,
            "content_type": "text/plain",
            "path": "foo/bar"
        }
        serializer = DataroomUploadFinalizeSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["path"] == "foo/bar"

    def test_backslash_normalized(self):
        data = {
            "storage_key": "key",
            "unique_name": "unique",
            "file_size": 100,
            "content_type": "text/plain",
            "path": "foo\\bar"
        }
        serializer = DataroomUploadFinalizeSerializer(data=data)
        assert serializer.is_valid(), serializer.errors
        assert serializer.validated_data["path"] == "foo/bar"

    def test_absolute_path_fails(self):
        data = {
            "storage_key": "key",
            "unique_name": "unique",
            "file_size": 100,
            "content_type": "text/plain",
            "path": "/foo"
        }
        serializer = DataroomUploadFinalizeSerializer(data=data)
        assert not serializer.is_valid()
        assert "path" in serializer.errors

    def test_directory_traversal_fails(self):
        data = {
            "storage_key": "key",
            "unique_name": "unique",
            "file_size": 100,
            "content_type": "text/plain",
            "path": "../foo"
        }
        serializer = DataroomUploadFinalizeSerializer(data=data)
        assert not serializer.is_valid()
        assert "path" in serializer.errors
