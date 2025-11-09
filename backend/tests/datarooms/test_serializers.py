import pytest
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, force_authenticate

from sharelinks.models import ShareLink
from datarooms.models import DataroomDocument, DataroomFolder
from datarooms.serializers import (
    AddContentSerializer,
    DataroomDetailSerializer,
    DataroomFolderSerializer,
    DataroomSerializer,
    MoveDataroomContentSerializer,
    PublicDataroomDocumentSerializer,
    PublicDataroomFolderSerializer,
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

    def test_dataroom_detail_serializer(
        self, dataroom, document, serializer_context
    ):
        # Add content to the dataroom
        DataroomDocument.objects.create(dataroom=dataroom, document=document)
        DataroomFolder.objects.create(dataroom=dataroom, name="Root Folder", parent=None)

        serializer = DataroomDetailSerializer(
            instance=dataroom, context=serializer_context
        )
        data = serializer.data

        assert data["id"] == str(dataroom.id)
        assert len(data["documents"]) == 1
        assert data["documents"][0]["document_name"] == document.name
        assert len(data["folders"]) == 1
        assert data["folders"][0]["name"] == "Root Folder"


class TestDataroomFolderSerializer:
    def test_dataroom_folder_serializer(self, dataroom, serializer_context):
        folder = DataroomFolder.objects.create(
            dataroom=dataroom, name="My Folder", parent=None
        )
        serializer = DataroomFolderSerializer(
            instance=folder, context=serializer_context
        )
        data = serializer.data

        assert data["id"] == str(folder.id)
        assert data["name"] == "My Folder"
        assert data["dataroom"] == str(dataroom.id)
        assert data["parent"] is None


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
        ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=document)
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
        assert data['document_name'] == document.name
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
