import pytest
from django.contrib.auth.hashers import check_password
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, force_authenticate

from documents.models import Document, Folder, ShareLink, ViewSession
from documents.serializers import FolderSerializer, ShareLinkSerializer

pytestmark = pytest.mark.django_db


@pytest.fixture
def serializer_context(user):
    """Creates a mock request context for serializers."""
    factory = APIRequestFactory()
    request = factory.post("/")  # Method doesn't matter for this context
    force_authenticate(request, user=user)
    return {"request": Request(request)}


class TestShareLinkSerializer:
    def test_create_with_password(self, document, serializer_context):
        serializer = ShareLinkSerializer(
            data={"document": document.id, "name": "", "password": "testpassword"},
            context=serializer_context,
        )
        assert serializer.is_valid(), serializer.errors
        instance = serializer.save()

        assert instance.name == "Untitled Link"
        assert instance.password_hash is not None
        assert check_password("testpassword", instance.password_hash)
        assert "password" not in serializer.data
        assert "password_hash" not in serializer.data
        assert serializer.data["has_password"] is True

    def test_create_without_password(self, document, serializer_context):
        serializer = ShareLinkSerializer(
            data={"document": document.id, "name": ""}, context=serializer_context
        )
        assert serializer.is_valid(), serializer.errors
        instance = serializer.save()

        assert instance.name == "Untitled Link"
        assert instance.password_hash is None
        assert "password_hash" not in serializer.data
        assert serializer.data["has_password"] is False

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

        assert serializer.data["has_password"] is True

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

        assert serializer.data["has_password"] is False

        instance.refresh_from_db()
        assert instance.password_hash is None

    def test_view_count_and_sessions_serialization(self, share_link, serializer_context):
        """
        Test that view_count and nested view_sessions are correctly serialized.
        """
        # Create some view sessions for the link
        ViewSession.objects.create(share_link=share_link)
        ViewSession.objects.create(share_link=share_link)

        # The serializer expects prefetched data for efficiency, which is what the
        # viewsets are configured to do.
        share_link_with_prefetch = ShareLink.objects.prefetch_related(
            'view_sessions'
        ).get(id=share_link.id)

        serializer = ShareLinkSerializer(
            instance=share_link_with_prefetch,
            context=serializer_context,
        )

        data = serializer.data
        assert data['view_count'] == 2
        assert 'view_sessions' in data
        assert len(data['view_sessions']) == 2
        assert 'viewer_email' in data['view_sessions'][0]

    def test_create_with_duplicate_name_is_renamed(self, document, user, serializer_context):
        """
        Test that creating a share link with a duplicate name for the same
        document results in an appended counter.
        """
        # Create first link
        ShareLink.objects.create(document=document, name="My Test Link", created_by=user)

        # Create second link with the same name
        serializer = ShareLinkSerializer(
            data={"document": document.id, "name": "My Test Link"},
            context=serializer_context,
        )
        assert serializer.is_valid(), serializer.errors
        instance = serializer.save()

        assert instance.name == "My Test Link (2)"

        # Create a third link, which should become (3)
        serializer_3 = ShareLinkSerializer(
            data={"document": document.id, "name": "My Test Link"},
            context=serializer_context,
        )
        assert serializer_3.is_valid(), serializer_3.errors
        instance_3 = serializer_3.save()

        assert instance_3.name == "My Test Link (3)"

    def test_create_with_duplicate_name_for_different_document(self, document, user, serializer_context):
        """
        Test that duplicate names are allowed for different documents.
        """
        # Create another document for the same user
        other_document = Document.objects.create(
            name="Other Document.pdf",
            organization=user.organization,
            created_by=user,
        )

        # Create first link
        ShareLink.objects.create(document=document, name="My Test Link", created_by=user)

        # Create a link with the same name, but for a different document
        serializer = ShareLinkSerializer(
            data={"document": other_document.id, "name": "My Test Link"},
            context=serializer_context,
        )
        assert serializer.is_valid(), serializer.errors
        instance = serializer.save()

        # The name should NOT be changed
        assert instance.name == "My Test Link"

    def test_create_without_name_is_renamed_if_default_exists(self, document, user, serializer_context):
        """
        Test that creating a share link without a name results in a default
        name that is correctly suffixed if it already exists.
        """
        # Create a link with the default name first
        ShareLink.objects.create(document=document, name="Untitled Link", created_by=user)

        # Create a second link without a name
        serializer = ShareLinkSerializer(
            data={"document": document.id, "name": ""},
            context=serializer_context,
        )
        assert serializer.is_valid(), serializer.errors
        instance = serializer.save()

        assert instance.name == "Untitled Link (2)"

    def test_update_with_duplicate_name_fails(self, document, user, serializer_context):
        """
        Test that renaming a share link to an existing name for the same
        document fails validation.
        """
        # Create two links for the same document
        link1 = ShareLink.objects.create(document=document, name="Link 1", created_by=user)
        ShareLink.objects.create(document=document, name="Link 2", created_by=user)

        # Attempt to rename link1 to "Link 2"
        serializer = ShareLinkSerializer(
            instance=link1,
            data={"name": "Link 2"},
            context=serializer_context,
            partial=True
        )
        assert not serializer.is_valid()
        assert 'name' in serializer.errors


class TestFolderSerializer:
    def test_create_with_duplicate_name_is_renamed(self, user, organization, serializer_context):
        """
        Test that creating a folder with a duplicate name in the same parent
        results in an appended counter.
        """
        root = Folder.objects.get(organization=organization, name="__root__")

        # Create first folder
        Folder.objects.create(
            organization=organization, name="My Test Folder", parent=root, created_by=user
        )

        # Create second folder with the same name
        serializer = FolderSerializer(
            data={"name": "My Test Folder"},
            context=serializer_context,
        )
        assert serializer.is_valid(), serializer.errors
        instance = serializer.save(organization=user.organization, created_by=user)
        assert instance.name == "My Test Folder (2)"

        # Create a third, which should become (3)
        serializer_3 = FolderSerializer(
            data={"name": "My Test Folder"},
            context=serializer_context,
        )
        assert serializer_3.is_valid(), serializer_3.errors
        instance_3 = serializer_3.save(organization=user.organization, created_by=user)
        assert instance_3.name == "My Test Folder (3)"

    def test_update_with_duplicate_name_fails(self, user, organization, serializer_context):
        """
        Test that renaming a folder to an existing name fails validation.
        """
        root = Folder.objects.get(organization=organization, name="__root__")
        folder1 = Folder.objects.create(
            organization=organization, name="Folder 1", parent=root, created_by=user
        )
        Folder.objects.create(
            organization=organization, name="Folder 2", parent=root, created_by=user
        )

        serializer = FolderSerializer(
            instance=folder1,
            data={"name": "Folder 2"},
            context=serializer_context,
            partial=True
        )
        assert not serializer.is_valid()
        assert 'name' in serializer.errors

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
