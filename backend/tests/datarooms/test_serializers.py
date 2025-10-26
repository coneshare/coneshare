import pytest
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, force_authenticate

from datarooms.models import Dataroom, DataroomDocument, DataroomFolder
from datarooms.serializers import (
    AddContentSerializer,
    DataroomDetailSerializer,
    DataroomFolderSerializer,
    DataroomSerializer,
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
