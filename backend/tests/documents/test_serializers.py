import pytest
from django.contrib.auth.hashers import check_password
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from backend.documents.models import Folder
from backend.documents.serializers import FolderSerializer, ShareLinkSerializer

pytestmark = pytest.mark.django_db


@pytest.fixture
def serializer_context(user):
    """Creates a mock request context for serializers."""
    factory = APIRequestFactory()
    request = factory.post("/")  # Method doesn't matter for this context
    request.user = user
    return {"request": Request(request)}


class TestShareLinkSerializer:
    def test_create_with_password(self, document, serializer_context):
        serializer = ShareLinkSerializer(
            data={"document": document.id, "password": "testpassword"},
            context=serializer_context,
        )
        assert serializer.is_valid(), serializer.errors
        instance = serializer.save()

        assert instance.password_hash is not None
        assert check_password("testpassword", instance.password_hash)
        assert "password" not in serializer.data
        assert "password_hash" in serializer.data

    def test_update_to_add_password(self, share_link, serializer_context):
        assert share_link.password_hash is None

        serializer = ShareLinkSerializer(
            instance=share_link,
            data={"password": "newpassword"},
            context=serializer_context,
            partial=True,
        )
        assert serializer.is_valid(), serializer.errors
        instance = serializer.save()

        instance.refresh_from_db()
        assert instance.password_hash is not None
        assert check_password("newpassword", instance.password_hash)

    def test_update_to_remove_password(self, share_link_with_password, serializer_context):
        assert share_link_with_password.password_hash is not None

        serializer = ShareLinkSerializer(
            instance=share_link_with_password,
            data={"password": ""},
            context=serializer_context,
            partial=True,
        )
        assert serializer.is_valid(), serializer.errors
        instance = serializer.save()

        instance.refresh_from_db()
        assert instance.password_hash is None


class TestFolderSerializer:
    def test_get_ancestors(self, user, organization):
        root = Folder.objects.get(organization=organization, name="__root__")
        folder1 = Folder.objects.create(
            organization=organization, name="Folder 1", parent=root, created_by=user
        )
        folder2 = Folder.objects.create(
            organization=organization, name="Folder 2", parent=folder1, created_by=user
        )
        folder3 = Folder.objects.create(
            organization=organization, name="Folder 3", parent=folder2, created_by=user
        )

        serializer = FolderSerializer(instance=folder3)
        ancestors = serializer.data["ancestors"]

        assert len(ancestors) == 2
        assert ancestors[0]["id"] == str(folder1.id)
        assert ancestors[0]["name"] == "Folder 1"
        assert ancestors[1]["id"] == str(folder2.id)
        assert ancestors[1]["name"] == "Folder 2"

    def test_get_ancestors_for_root_level_folder(self, user, organization):
        root = Folder.objects.get(organization=organization, name="__root__")
        folder1 = Folder.objects.create(
            organization=organization, name="Folder 1", parent=root, created_by=user
        )

        serializer = FolderSerializer(instance=folder1)
        ancestors = serializer.data["ancestors"]

        assert len(ancestors) == 0
