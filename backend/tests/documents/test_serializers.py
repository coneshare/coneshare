import pytest
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, force_authenticate

from documents.models import Document, Folder
from documents.serializers import (
    DocumentSerializer, FolderSerializer,
    DocumentVersionSerializer, DocumentVersionListSerializer
)
from sharelinks.models import ShareLink, ViewSession

pytestmark = pytest.mark.django_db


@pytest.fixture
def serializer_context(user):
    """Creates a mock request context for serializers."""
    factory = APIRequestFactory()
    request = factory.post("/")  # Method doesn't matter for this context
    force_authenticate(request, user=user)
    return {"request": Request(request)}




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


class TestDocumentSerializer:
    def test_folder_is_nested_on_read_succeeds_without_prefetch(self, user, organization, serializer_context):
        """
        Tests that the serializer correctly handles a Document whose 'folder'
        relation has not been prefetched, preventing an AttributeError.
        """
        root = Folder.objects.get(organization=organization, name="__root__")
        parent_folder = Folder.objects.create(
            organization=organization, name="Parent", parent=root, created_by=user
        )
        doc = Document.objects.create(
            organization=organization,
            name="My Doc",
            folder=parent_folder,
            created_by=user,
            file_size=12345,
        )

        # Fetch the document instance *without* prefetching the folder relation.
        doc_from_db = Document.objects.get(pk=doc.pk)
        serializer = DocumentSerializer(instance=doc_from_db, context=serializer_context)

        # Accessing .data should now succeed without raising an error.
        data = serializer.data

        assert data['folder'] is not None
        assert data['folder']['id'] == str(parent_folder.id)
        assert data['folder']['name'] == "Parent"

    def test_share_link_view_count_falls_back_for_unannotated_document(self, user, organization, serializer_context):
        doc = Document.objects.create(
            organization=organization,
            name="Unannotated Doc",
            created_by=user,
        )
        link = ShareLink.objects.create(document=doc, created_by=user)
        ViewSession.objects.create(share_link=link)
        ViewSession.objects.create(share_link=link)

        serializer = DocumentSerializer(instance=doc, context=serializer_context)

        assert serializer.data['share_link_view_count'] == 2

    def test_share_link_view_count_fallback_queries_database(self, user, organization, serializer_context, django_assert_num_queries):
        doc = Document.objects.create(
            organization=organization,
            name="Fallback Count Doc",
            created_by=user,
        )
        link = ShareLink.objects.create(document=doc, created_by=user)
        ViewSession.objects.create(share_link=link)

        doc_from_db = Document.objects.get(pk=doc.pk)

        serializer = DocumentSerializer(instance=doc_from_db, context=serializer_context)
        with django_assert_num_queries(1):
            assert serializer.get_share_link_view_count(doc_from_db) == 1


class TestDocumentVersionSerializers:
    def test_version_serializers_cloud_import_exposed_metadata_hidden(self, user, organization):
        from documents.models import DocumentVersion
        doc = Document.objects.create(
            organization=organization,
            name="Version Test.pdf",
            created_by=user,
        )
        metadata_val = {
            "cloud_import": {
                "connection_id": 12,
                "file_id": "id:abcdef12345",
                "file_name": "Test.pdf",
                "file_path": "/photos/Test.pdf",
                "provider": "dropbox",
                "etag_or_rev": "015d30000000000000000",
            }
        }
        v1 = DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            is_primary=True,
            file_size=100,
            content_type="application/pdf",
            original_storage_key="v1.pdf",
            storage_key="v1.pdf",
            type="pdf",
            metadata=metadata_val,
        )

        for serializer_class in [DocumentVersionSerializer, DocumentVersionListSerializer]:
            serializer = serializer_class(instance=v1)
            data = serializer.data
            
            # Assert metadata field itself is not present
            assert "metadata" not in data
            
            # Assert display-safe cloud_import field is present with only non-sensitive keys
            assert "cloud_import" in data
            ci = data["cloud_import"]
            assert ci["provider"] == "dropbox"
            assert ci["file_name"] == "Test.pdf"
            assert ci["file_path"] == "/photos/Test.pdf"
            
            # Assert sensitive details are filtered out
            assert "connection_id" not in ci
            assert "etag_or_rev" not in ci
