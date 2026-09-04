import pytest
from datetime import timedelta
from django.utils import timezone
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.exceptions import APIException

from core.models import Organization
from documents.models import (Document, DocumentPage, DocumentVersion, Folder)
from documents.services import QuotaExceededError
from sharelinks.models import (ShareLink, ViewSession)

User = get_user_model()


@pytest.fixture
def document_factory(user, organization):
    def _create_document(**kwargs):
        defaults = {
            "created_by": user,
            "organization": organization,
            "status": "ready",
        }
        defaults.update(kwargs)
        doc = Document.objects.create(**defaults)
        version_file_size = kwargs.get('file_size')
        DocumentVersion.objects.create(
            document=doc,
            version_number=1,
            is_primary=True,
            original_storage_key="path/to/original.pdf",
            file_size=version_file_size
        )
        return doc
    return _create_document

@pytest.mark.django_db
def test_get_root_folder_contents(api_client, user, user2, organization):
    """Test retrieving root folder contents is scoped to the user."""
    # Get the invisible root folder for the organization
    root_folder = Folder.objects.get(organization=organization, parent=None, name='__root__')

    # user's content
    user_root_folder = Folder.objects.create(
        name="My Root Folder", organization=organization, created_by=user, parent=root_folder
    )
    # This subfolder should not be in the root listing
    Folder.objects.create(
        name="My Subfolder", organization=organization, created_by=user, parent=user_root_folder
    )
    Document.objects.create(
        name="My Root Document", organization=organization, created_by=user, folder=root_folder
    )

    # user2's content (should not appear)
    Folder.objects.create(
        name="Other's Folder", organization=organization, created_by=user2, parent=root_folder
    )
    Document.objects.create(
        name="Other's Document", organization=organization, created_by=user2, folder=root_folder
    )

    response = api_client.get('/api/v1/folders/')
    assert response.status_code == status.HTTP_200_OK

    data = response.json()
    assert data['current_folder'] is None
    assert len(data['sub_folders']) == 1
    assert data['sub_folders'][0]['name'] == "My Root Folder"
    assert len(data['documents']) == 1
    assert data['documents'][0]['name'] == "My Root Document"


@pytest.mark.django_db
def test_get_folder_contents_retrieve(api_client, user, organization):
    """Test retrieving a specific folder's contents and check for correct ancestor data."""
    root_folder = Folder.objects.get(organization=organization, parent=None, name='__root__')
    parent_folder = Folder.objects.create(
        name="Parent Folder", organization=organization, created_by=user, parent=root_folder
    )
    sub_folder = Folder.objects.create(
        name="Subfolder 1", organization=organization, created_by=user, parent=parent_folder
    )
    Document.objects.create(
        name="Document In Folder", organization=organization, created_by=user, folder=parent_folder
    )

    response = api_client.get(f'/api/v1/folders/{parent_folder.id}/')
    assert response.status_code == status.HTTP_200_OK

    data = response.json()
    assert data['current_folder']['id'] == str(parent_folder.id)
    assert data['current_folder']['name'] == "Parent Folder"

    assert len(data['sub_folders']) == 1
    sub_folder_data = data['sub_folders'][0]
    assert sub_folder_data['name'] == "Subfolder 1"

    assert len(data['documents']) == 1
    assert data['documents'][0]['name'] == "Document In Folder"

    # Check that ancestor data is present on sub-folders
    assert 'ancestors' in sub_folder_data
    assert len(sub_folder_data['ancestors']) == 1
    assert sub_folder_data['ancestors'][0]['id'] == str(parent_folder.id)
    assert sub_folder_data['ancestors'][0]['name'] == "Parent Folder"


@pytest.mark.django_db
def test_list_root_folder_with_multiple_items(api_client, user, user2, organization):
    """
    Test listing the root folder with multiple items to ensure all and only
    the correct user's root-level items are returned.
    """
    root_folder = Folder.objects.get(organization=organization, parent=None, name='__root__')

    # Items that should appear in the root listing for 'user'
    Folder.objects.create(name="Root Folder A", organization=organization, created_by=user, parent=root_folder)
    Folder.objects.create(name="Root Folder B", organization=organization, created_by=user, parent=root_folder)
    Document.objects.create(name="Root Doc A", organization=organization, created_by=user, folder=root_folder)

    # Item that should NOT appear (it is a sub-folder)
    parent = Folder.objects.create(name="Parent With Subfolder", organization=organization, created_by=user, parent=root_folder)
    Folder.objects.create(name="Subfolder", organization=organization, created_by=user, parent=parent)

    # Items that should NOT appear (owned by another user)
    Folder.objects.create(name="User2 Folder", organization=organization, created_by=user2, parent=root_folder)
    Document.objects.create(name="User2 Doc", organization=organization, created_by=user2, folder=root_folder)

    response = api_client.get('/api/v1/folders/')

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data['current_folder'] is None
    
    # Expected folders: 'Root Folder A', 'Root Folder B', and 'Parent With Subfolder'
    assert len(data['sub_folders']) == 3
    folder_names = {f['name'] for f in data['sub_folders']}
    assert folder_names == {"Root Folder A", "Root Folder B", "Parent With Subfolder"}

    # Expected documents: 'Root Doc A'
    assert len(data['documents']) == 1
    doc_names = {d['name'] for d in data['documents']}
    assert doc_names == {"Root Doc A"}


@pytest.mark.django_db
def test_list_sub_folder_contents_and_check_permissions(api_client, user, user2, organization):
    """
    Test listing a sub-folder's contents and verify that a user cannot list the
    contents of a folder they do not own.
    """
    root_folder = Folder.objects.get(organization=organization, parent=None, name='__root__')
    
    # Structure for 'user'
    level1 = Folder.objects.create(name="Level 1", organization=organization, created_by=user, parent=root_folder)
    level2 = Folder.objects.create(name="Level 2", organization=organization, created_by=user, parent=level1)
    Folder.objects.create(name="Subfolder in Level 2", organization=organization, created_by=user, parent=level2)
    Document.objects.create(name="Doc in Level 2", organization=organization, created_by=user, folder=level2)
    
    # Item that should NOT appear in Level 2 listing
    Document.objects.create(name="Doc in Level 1", organization=organization, created_by=user, folder=level1)

    # Folder for 'user2' that 'user' should not be able to access
    user2_folder = Folder.objects.create(name="User2 Folder", organization=organization, created_by=user2, parent=root_folder)

    # 1. Test listing contents of 'user's 'level2' folder
    response = api_client.get(f'/api/v1/folders/{level2.id}/')
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    assert data['current_folder']['name'] == "Level 2"
    assert len(data['sub_folders']) == 1
    assert data['sub_folders'][0]['name'] == "Subfolder in Level 2"
    assert len(data['documents']) == 1
    assert data['documents'][0]['name'] == "Doc in Level 2"
    
    # 2. Test trying to list contents of 'user2's folder (should return 404)
    response_denied = api_client.get(f'/api/v1/folders/{user2_folder.id}/')
    assert response_denied.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_create_folder(api_client, user, organization):
    """Test creating a new folder."""
    # The __root__ folder is created automatically
    assert Folder.objects.count() == 1

    data = {'name': 'New API Folder'}
    response = api_client.post('/api/v1/folders/', data)

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data['name'] == 'New API Folder'
    assert Folder.objects.count() == 2

    folder = Folder.objects.get(name='New API Folder')
    root_folder = Folder.objects.get(name='__root__', parent=None)
    assert folder.organization == organization
    assert folder.created_by == user
    assert folder.parent == root_folder


@pytest.mark.django_db
def test_create_duplicate_root_folder_is_renamed(api_client):
    """Test that creating a folder with a duplicate name at the root level is auto-renamed."""
    data = {'name': 'Duplicate Folder'}
    response1 = api_client.post('/api/v1/folders/', data)
    assert response1.status_code == status.HTTP_201_CREATED
    assert response1.data['name'] == 'Duplicate Folder'

    response2 = api_client.post('/api/v1/folders/', data)
    assert response2.status_code == status.HTTP_201_CREATED
    assert response2.data['name'] == 'Duplicate Folder (2)'


@pytest.mark.django_db
def test_create_duplicate_subfolder_is_renamed(api_client, user, organization):
    """Test that creating a subfolder with a duplicate name is auto-renamed."""
    # Create a parent folder via API
    parent_data = {'name': 'Parent'}
    parent_response = api_client.post('/api/v1/folders/', parent_data)
    assert parent_response.status_code == status.HTTP_201_CREATED
    parent_id = parent_response.data['id']

    # Create a subfolder
    subfolder_data = {'name': 'Duplicate Subfolder', 'parent': parent_id}
    response1 = api_client.post('/api/v1/folders/', subfolder_data)
    assert response1.status_code == status.HTTP_201_CREATED
    assert response1.data['name'] == 'Duplicate Subfolder'

    # Attempt to create another subfolder with the same name and parent
    response2 = api_client.post('/api/v1/folders/', subfolder_data)
    assert response2.status_code == status.HTTP_201_CREATED
    assert response2.data['name'] == 'Duplicate Subfolder (2)'


@pytest.mark.django_db
class TestEnsureFolderPathsView:
    """Tests for the EnsureFolderPathsView endpoint."""

    def test_ensure_paths_success_and_returns_mappings(self, api_client, user):
        """
        Test creating a nested structure from multiple paths and verify it
        returns the correct path mappings.
        """
        # __root__ folder exists
        assert Folder.objects.count() == 1

        path_data = {'paths': ['Reports/Q1', 'Data/Internal']}
        response = api_client.post('/api/v1/folders/ensure-paths/', path_data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['path_mappings'] == {
            'Reports': 'Reports',
            'Data': 'Data',
        }
        # __root__, Reports, Q1, Data, Internal
        assert Folder.objects.count() == 5

        q1 = Folder.objects.get(name='Q1')
        reports = q1.parent
        internal = Folder.objects.get(name='Internal')
        data = internal.parent

        assert q1.created_by == user
        assert reports.name == 'Reports'
        assert reports.created_by == user
        assert internal.created_by == user
        assert data.name == 'Data'
        assert data.created_by == user

    def test_ensure_paths_renames_conflicting_top_level_folder(self, api_client, user):
        """
        Test that if a top-level folder name conflicts, it is renamed
        and the correct mapping is returned.
        """
        root = Folder.objects.get(name='__root__', parent=None)
        Folder.objects.create(name="Reports", created_by=user, organization=user.organization, parent=root)
        assert Folder.objects.count() == 2  # __root__, Reports

        path_data = {'paths': ['Reports/Q1', 'Reports/Q2']}
        response = api_client.post('/api/v1/folders/ensure-paths/', path_data)

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['path_mappings'] == {'Reports': 'Reports (2)'}

        # __root__, Reports, Reports (2), Q1, Q2
        assert Folder.objects.count() == 5
        assert Folder.objects.filter(name='Reports (2)').exists()

        new_reports_folder = Folder.objects.get(name='Reports (2)')
        assert new_reports_folder.children.count() == 2
        child_names = {c.name for c in new_reports_folder.children.all()}
        assert child_names == {'Q1', 'Q2'}

    # def test_ensure_paths_permission_denied(self, api_client, user2):
    #     """Test a user cannot create a subfolder inside another user's folder."""
    #     root = Folder.objects.get(name='__root__', parent=None, organization=user2.organization)
    #     user2_folder = Folder.objects.create(name="User2s-Folder", organization=user2.organization, created_by=user2, parent=root)
    #     assert Folder.objects.count() == 2

    #     path_data = {'paths': ["User2s-Folder/My-Stuff"]}
    #     response = api_client.post('/api/v1/folders/ensure-paths/', path_data)

    #     assert response.status_code == status.HTTP_403_FORBIDDEN
    #     assert Folder.objects.count() == 2  # No new folders created

    # def test_ensure_paths_is_atomic(self, api_client, user, user2):
    #     """Test that if one path fails, the whole transaction is rolled back."""
    #     root = Folder.objects.get(name='__root__', parent=None, organization=user2.organization)
    #     user2_folder = Folder.objects.create(name="User2s-Folder", organization=user2.organization, created_by=user2, parent=root)
    #     assert Folder.objects.count() == 2

    #     path_data = {'paths': ["Good-Folder/Sub", "User2s-Folder/My-Stuff"]}
    #     response = api_client.post('/api/v1/folders/ensure-paths/', path_data)

    #     assert response.status_code == status.HTTP_403_FORBIDDEN
    #     # Ensure no folders were created at all
    #     assert Folder.objects.count() == 2
    #     assert not Folder.objects.filter(created_by=user).exists()

    def test_ensure_paths_in_subfolder_success(self, api_client, user):
        """Test creating a nested structure within an existing subfolder."""
        root = Folder.objects.get(name='__root__', parent=None)
        parent = Folder.objects.create(name="Parent", created_by=user, organization=user.organization, parent=root)
        
        path_data = {
            'paths': ['NewFolder/Sub'],
            'parent_path': 'Parent'
        }
        response = api_client.post('/api/v1/folders/ensure-paths/', path_data)
        
        assert response.status_code == status.HTTP_201_CREATED
        assert Folder.objects.count() == 4  # __root__, Parent, NewFolder, Sub
        
        new_folder = Folder.objects.get(name='NewFolder')
        assert new_folder.parent == parent
        
        sub_folder = Folder.objects.get(name='Sub')
        assert sub_folder.parent == new_folder

    def test_ensure_paths_in_subfolder_renames_conflict(self, api_client, user):
        """Test that a conflicting folder name within a subfolder is correctly renamed."""
        root = Folder.objects.get(name='__root__', parent=None)
        parent = Folder.objects.create(name="Parent", created_by=user, organization=user.organization, parent=root)
        Folder.objects.create(name="Existing", created_by=user, organization=user.organization, parent=parent)
        
        path_data = {
            'paths': ['Existing/Sub'],
            'parent_path': 'Parent'
        }
        response = api_client.post('/api/v1/folders/ensure-paths/', path_data)
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['path_mappings'] == {'Existing': 'Existing (2)'}
        assert Folder.objects.count() == 5  # __root__, Parent, Existing, Existing (2), Sub
        assert Folder.objects.filter(name='Existing (2)').exists()
        
        new_existing_folder = Folder.objects.get(name='Existing (2)')
        assert new_existing_folder.parent == parent
        
        sub_folder = Folder.objects.get(name='Sub')
        assert sub_folder.parent == new_existing_folder
    
    def test_ensure_paths_with_invalid_parent_path(self, api_client):
        """Test that using a non-existent parent_path returns an error."""
        path_data = {
            'paths': ['NewFolder/Sub'],
            'parent_path': 'NonExistent'
        }
        response = api_client.post('/api/v1/folders/ensure-paths/', path_data)
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Parent path 'NonExistent' not found" in response.data['detail']

    def test_ensure_paths_allows_separate_users_to_create_same_name_folder(self, api_client, user, user2):
        """
        Tests that User B can create a folder with the same name as User A's
        folder at the same level without a permission error. This reproduces
        a bug where get_or_create was not user-specific.
        """
        # User A (the default user for api_client) creates a folder
        path_data_user_a = {'paths': ['Marketing']}
        response_a = api_client.post('/api/v1/folders/ensure-paths/', path_data_user_a)
        assert response_a.status_code == status.HTTP_201_CREATED
        assert Folder.objects.filter(created_by=user, name='Marketing').count() == 1

        # Now, authenticate as User B and try to create a folder with the same name
        api_client.force_authenticate(user=user2)

        path_data_user_b = {'paths': ['Marketing']}
        response_b = api_client.post('/api/v1/folders/ensure-paths/', path_data_user_b)

        # Before fix, this would fail with 403 Forbidden. After fix, it should be 201.
        assert response_b.status_code == status.HTTP_201_CREATED, response_b.data

        # Verify that User B's folder was created and is distinct from User A's
        assert Folder.objects.filter(created_by=user2, name='Marketing').count() == 1
        assert Folder.objects.filter(name='Marketing').count() == 2


@pytest.mark.django_db
def test_delete_folder_permission_denied(api_client, user2):
    """Test that a user cannot delete another user's folder."""
    # user2 creates a folder
    folder_by_user2 = Folder.objects.create(
        organization=user2.organization,
        created_by=user2,
        name="User2's Folder"
    )

    # api_client (logged in as user) tries to delete it
    response = api_client.delete(f'/api/v1/folders/{folder_by_user2.id}/')

    # The user should not be able to delete this folder.
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert Folder.objects.filter(id=folder_by_user2.id).exists()


@pytest.mark.django_db
@patch('documents.services.fileserver_client.delete_file')
def test_soft_delete_folder_keeps_size_and_files(mock_fs_delete, api_client, user, organization):
    """
    Test that soft-deleting a folder keeps the user's total document
    size and does not delete associated files.
    """
    # 1. Setup folder structure and documents
    root_folder = Folder.objects.get_root_for_org(organization)
    folder_to_delete = Folder.objects.create(
        name="Top Level", organization=organization, created_by=user, parent=root_folder
    )
    subfolder = Folder.objects.create(
        name="Subfolder", organization=organization, created_by=user, parent=folder_to_delete
    )

    doc1_size = 1 * 1024 * 1024
    doc2_size = 2 * 1024 * 1024
    total_size = doc1_size + doc2_size

    doc1 = Document.objects.create(
        name="Doc1.pdf", organization=organization, created_by=user, folder=folder_to_delete, file_size=doc1_size
    )
    doc2 = Document.objects.create(
        name="Doc2.pdf", organization=organization, created_by=user, folder=subfolder, file_size=doc2_size
    )

    # Create versions and pages to check for file deletion
    v1 = DocumentVersion.objects.create(document=doc1, version_number=1, original_storage_key="doc1.pdf")
    DocumentPage.objects.create(document_version=v1, page_number=1, storage_key="doc1_page1.png")
    v2 = DocumentVersion.objects.create(document=doc2, version_number=1, original_storage_key="doc2.pdf")

    # 2. Set user's initial size
    user.total_document_size = total_size
    user.save()
    assert user.total_document_size == total_size

    # 3. Perform deletion
    response = api_client.delete(f'/api/v1/folders/{folder_to_delete.id}/')

    # 4. Assertions
    assert response.status_code == status.HTTP_204_NO_CONTENT

    # Check that everything is soft deleted from the DB
    assert not Folder.objects.active().filter(id=folder_to_delete.id).exists()
    assert Folder.objects.deleted().filter(id=folder_to_delete.id).exists()
    assert not Folder.objects.active().filter(id=subfolder.id).exists()
    assert not Document.objects.active().filter(id__in=[doc1.id, doc2.id]).exists()

    # Check user size is unchanged
    user.refresh_from_db()
    assert user.total_document_size == total_size

    # Check that file deletion was NOT called
    assert mock_fs_delete.call_count == 0


@pytest.mark.django_db
@patch('documents.services.fileserver_client.delete_file')
def test_permanent_delete_trash_item_file_server_error_returns_500(mock_fs_delete, api_client, user, organization):
    """
    Test that if the file server fails during permanent deletion from trash,
    the view returns a 500 error and the database transaction is rolled back.
    """
    mock_fs_delete.side_effect = APIException("File server error")

    root_folder = Folder.objects.get_root_for_org(organization)
    folder = Folder.objects.create(name="Folder", organization=organization, created_by=user, parent=root_folder)
    doc = Document.objects.create(name="Doc.pdf", organization=organization, created_by=user, folder=folder, file_size=100)
    DocumentVersion.objects.create(document=doc, version_number=1, original_storage_key="doc.pdf")

    user.total_document_size = 100
    user.save()

    # Soft delete first
    api_client.delete(f'/api/v1/folders/{folder.id}/')

    # Now permanently delete from trash
    response = api_client.delete(f'/api/v1/trash/{folder.id}/permanent/')

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

    # The service should raise an exception before deleting DB records,
    # so the folder should still exist in trash.
    assert Folder.objects.deleted().filter(id=folder.id).exists()
    user.refresh_from_db()
    assert user.total_document_size == 100


@pytest.mark.django_db
def test_update_folder_name(api_client, user, organization):
    """Test a user can rename their own folder."""
    root_folder = Folder.objects.get(organization=organization, parent=None, name='__root__')
    folder = Folder.objects.create(
        name="Original Name", organization=organization, created_by=user, parent=root_folder
    )

    response = api_client.patch(f'/api/v1/folders/{folder.id}/', {'name': 'New Name'})

    assert response.status_code == status.HTTP_200_OK
    assert response.data['name'] == 'New Name'
    folder.refresh_from_db()
    assert folder.name == 'New Name'


@pytest.mark.django_db
def test_update_folder_star_status(api_client, user, organization):
    """Test a user can star and unstar their own folder."""
    root_folder = Folder.objects.get(organization=organization, parent=None, name='__root__')
    folder = Folder.objects.create(
        name="My Folder", organization=organization, created_by=user, parent=root_folder
    )
    assert folder.is_starred is False

    # Star the folder
    response = api_client.patch(f'/api/v1/folders/{folder.id}/', {'is_starred': True})
    assert response.status_code == status.HTTP_200_OK
    assert response.data['is_starred'] is True
    folder.refresh_from_db()
    assert folder.is_starred is True

    # Unstar the folder
    response = api_client.patch(f'/api/v1/folders/{folder.id}/', {'is_starred': False})
    assert response.status_code == status.HTTP_200_OK
    assert response.data['is_starred'] is False
    folder.refresh_from_db()
    assert folder.is_starred is False


@pytest.mark.django_db
def test_update_folder_permission_denied(api_client, user2, organization):
    """Test a user cannot rename another user's folder."""
    root_folder = Folder.objects.get(organization=organization, parent=None, name='__root__')
    folder_by_user2 = Folder.objects.create(
        name="User2's Folder", organization=organization, created_by=user2, parent=root_folder
    )

    # api_client (logged in as user) tries to rename it
    response = api_client.patch(f'/api/v1/folders/{folder_by_user2.id}/', {'name': 'New Name'})

    assert response.status_code == status.HTTP_404_NOT_FOUND
    folder_by_user2.refresh_from_db()
    assert folder_by_user2.name == "User2's Folder"


@pytest.mark.django_db
def test_star_folder_permission_denied(api_client, user2, organization):
    """Test a user cannot star another user's folder."""
    root_folder = Folder.objects.get(organization=organization, parent=None, name='__root__')
    folder_by_user2 = Folder.objects.create(
        name="User2's Folder", organization=organization, created_by=user2, parent=root_folder, is_starred=False
    )

    # api_client (logged in as user) tries to star it
    response = api_client.patch(f'/api/v1/folders/{folder_by_user2.id}/', {'is_starred': True})

    assert response.status_code == status.HTTP_404_NOT_FOUND
    folder_by_user2.refresh_from_db()
    assert folder_by_user2.is_starred is False


@pytest.mark.django_db
def test_create_folder_with_other_users_parent_folder_fails(api_client, user2, organization):
    """Test a user cannot create a subfolder in another user's folder."""
    root_folder = Folder.objects.get(organization=organization, parent=None, name='__root__')
    parent_by_user2 = Folder.objects.create(
        name="User2's Parent", organization=organization, created_by=user2, parent=root_folder
    )

    data = {'name': 'My Subfolder', 'parent': str(parent_by_user2.id)}
    response = api_client.post('/api/v1/folders/', data)

    # This should fail because the parent folder is not in the user's queryset.
    # The serializer will raise a validation error.
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'parent' in response.data
    assert 'only create subfolders in your own folders' in str(response.data['parent'])


@pytest.mark.django_db
def test_create_folder_with_non_existent_parent_fails(api_client):
    """Test creating a folder with a parent that does not exist fails."""
    non_existent_parent_id = 'fld_00000000000000000000000000'
    data = {'name': 'Subfolder', 'parent': non_existent_parent_id}
    response = api_client.post('/api/v1/folders/', data)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'parent' in response.data
    assert 'Invalid pk' in str(response.data['parent'])


@pytest.mark.django_db
def test_list_folder_contents_includes_share_link_views(api_client, user, organization):
    """
    Test that the folder contents API response includes nested view session
    data for share links to avoid N+1 queries on the frontend.
    """
    root_folder = Folder.objects.get(organization=organization, parent=None, name='__root__')
    doc = Document.objects.create(name="Doc with views", organization=organization, created_by=user, folder=root_folder)
    link = ShareLink.objects.create(document=doc, created_by=user)
    ViewSession.objects.create(share_link=link, viewer_email="viewer1@test.com")
    ViewSession.objects.create(share_link=link, viewer_email="viewer2@test.com")

    response = api_client.get('/api/v1/folders/')  # list root folder
    assert response.status_code == status.HTTP_200_OK

    data = response.json()
    assert len(data['documents']) == 1
    document_data = data['documents'][0]

    assert 'share_links' in document_data
    assert len(document_data['share_links']) == 1
    share_link_data = document_data['share_links'][0]

    assert 'view_count' in share_link_data
    assert share_link_data['view_count'] == 2
    assert 'recent_view_sessions' in share_link_data
    assert len(share_link_data['recent_view_sessions']) == 2


@pytest.mark.django_db
def test_list_folder_contents_includes_direct_share_link_view_count(api_client, user, organization, dataroom):
    """Document lists expose direct share-link view counts without mixing in dataroom visits."""
    from datarooms.models import DataroomDocument
    from sharelinks.models import DataroomVisit

    root_folder = Folder.objects.get(organization=organization, parent=None, name='__root__')
    doc = Document.objects.create(name="Doc with direct views", organization=organization, created_by=user, folder=root_folder)
    direct_link = ShareLink.objects.create(document=doc, created_by=user)
    ViewSession.objects.create(share_link=direct_link, viewer_email="viewer1@test.com")
    ViewSession.objects.create(share_link=direct_link, viewer_email="viewer2@test.com")

    dataroom_doc = DataroomDocument.objects.create(dataroom=dataroom, document=doc, name=doc.name)
    dataroom_link = ShareLink.objects.create(dataroom=dataroom, created_by=user)
    dataroom_session = ViewSession.objects.create(share_link=dataroom_link, viewer_email="viewer3@test.com")
    DataroomVisit.objects.create(view_session=dataroom_session, dataroom_document=dataroom_doc)

    response = api_client.get('/api/v1/folders/')

    assert response.status_code == status.HTTP_200_OK
    document_data = response.json()['documents'][0]
    assert document_data['share_link_view_count'] == 2


@pytest.mark.django_db
def test_list_documents_is_scoped_to_user_and_root_only(api_client, user, user2, organization):
    """Test retrieving documents is scoped to the user and only returns root-level documents."""
    folder = Folder.objects.create(organization=organization, created_by=user, name="Test Folder")
    Document.objects.create(
        name="My Root Document",
        organization=organization,
        created_by=user,
    )
    Document.objects.create(
        name="My Folder Document",
        organization=organization,
        created_by=user,
        folder=folder
    )
    Document.objects.create(
        name="Other User's Document",
        organization=organization,
        created_by=user2,
    )
    response = api_client.get('/api/v1/documents/')
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]['name'] == "My Root Document"
    assert response.data[0]['share_link_view_count'] == 0


@pytest.mark.django_db
def test_list_documents_includes_direct_share_link_view_count(api_client, user, organization):
    root_folder = Folder.objects.get(organization=organization, parent=None, name='__root__')
    doc = Document.objects.create(
        name="Viewed Document",
        organization=organization,
        created_by=user,
        folder=root_folder,
    )
    link = ShareLink.objects.create(document=doc, created_by=user)
    ViewSession.objects.create(share_link=link, viewer_email="viewer1@test.com")
    ViewSession.objects.create(share_link=link, viewer_email="viewer2@test.com")

    response = api_client.get('/api/v1/documents/')

    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]['id'] == str(doc.id)
    assert response.data[0]['share_link_view_count'] == 2


@pytest.mark.django_db
def test_list_documents_in_folder(api_client, user, organization):
    """Test retrieving documents is correctly filtered by folder ID."""
    root_folder = Folder.objects.get(organization=organization, parent=None, name='__root__')
    target_folder = Folder.objects.create(
        name="Target Folder", organization=organization, created_by=user, parent=root_folder
    )
    Document.objects.create(
        name="Document In Folder", organization=organization, created_by=user, folder=target_folder
    )
    Document.objects.create(
        name="Root Document", organization=organization, created_by=user, folder=root_folder
    )

    response = api_client.get(f'/api/v1/documents/?folder={target_folder.id}')
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]['name'] == "Document In Folder"


@pytest.mark.django_db
def test_create_document_is_deprecated(api_client, user, organization):
    """Test creating a document via the old endpoint is disallowed or handled."""
    # This endpoint is effectively deprecated by the async upload view.
    # A good test is to ensure it can't be used to bypass the async flow.
    # This example shows a simple creation for demonstration.
    data = {
        'name': 'New API Doc',
        'type': 'docx',
        'content_type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
    response = api_client.post('/api/v1/documents/', data)
    assert response.status_code == status.HTTP_201_CREATED
    assert Document.objects.count() == 1
    doc = Document.objects.get()
    assert doc.name == 'New API Doc'
    assert doc.organization == organization
    assert doc.created_by == user


@pytest.mark.django_db
@patch('documents.views.fileserver_client.generate_upload_url')
def test_upload_document_with_path(mock_fs_upload_url, api_client, user):
    """Test the two-step document upload process into a pre-existing folder path."""
    mock_fs_upload_url.return_value = "/files/upload/some-token"
    # First, create the folder structure
    path_data = {'paths': ['Client Reports/Q4/Final']}
    response = api_client.post('/api/v1/folders/ensure-paths/', path_data)
    assert response.status_code == status.HTTP_201_CREATED

    # Step 1: Request upload URL
    request_data = {'file_name': 'report.docx', 'path': 'Client Reports/Q4/Final/report.docx', 'file_size': 123}
    request_response = api_client.post('/api/v1/uploads/document/request/', request_data)
    assert request_response.status_code == status.HTTP_200_OK, request_response.json()
    upload_data = request_response.json()
    assert upload_data['upload_url'] == "/files/upload/some-token"
    assert 'storage_key' in upload_data
    assert upload_data['unique_name'] == 'report.docx'

    # Step 2: Finalize upload
    finalize_data = {
        'storage_key': upload_data['storage_key'],
        'unique_name': upload_data['unique_name'],
        'file_size': 123,
        'content_type': 'application/msword',
        'path': 'Client Reports/Q4/Final/report.docx'
    }
    finalize_response = api_client.post('/api/v1/uploads/document/finalize/', finalize_data)

    assert finalize_response.status_code == status.HTTP_202_ACCEPTED
    assert Document.objects.count() == 1

    doc = Document.objects.first()
    assert doc.name == 'report.docx'
    assert doc.folder is not None
    assert doc.folder.name == 'Final'
    assert doc.folder.parent.name == 'Q4'
    assert doc.folder.parent.parent.name == 'Client Reports'


@pytest.mark.django_db
@patch('documents.views.fileserver_client.generate_upload_url')
def test_upload_duplicate_root_file_is_renamed(mock_fs_upload_url, api_client):
    """Uploading the same root-level filename twice should auto-rename the second file."""
    mock_fs_upload_url.return_value = "/files/upload/some-token"

    first_request_data = {'file_name': 'foo.txt', 'path': 'foo.txt', 'file_size': 123}
    first_request = api_client.post('/api/v1/uploads/document/request/', first_request_data)
    assert first_request.status_code == status.HTTP_200_OK
    first_upload_data = first_request.json()
    assert first_upload_data['unique_name'] == 'foo.txt'

    first_finalize_data = {
        'storage_key': first_upload_data['storage_key'],
        'unique_name': first_upload_data['unique_name'],
        'file_size': 123,
        'content_type': 'text/plain',
        'path': 'foo.txt'
    }
    first_finalize = api_client.post('/api/v1/uploads/document/finalize/', first_finalize_data)
    assert first_finalize.status_code == status.HTTP_202_ACCEPTED

    second_request_data = {'file_name': 'foo.txt', 'path': 'foo.txt', 'file_size': 456}
    second_request = api_client.post('/api/v1/uploads/document/request/', second_request_data)
    assert second_request.status_code == status.HTTP_200_OK
    second_upload_data = second_request.json()
    assert second_upload_data['unique_name'] == 'foo (2).txt'

    second_finalize_data = {
        'storage_key': second_upload_data['storage_key'],
        'unique_name': second_upload_data['unique_name'],
        'file_size': 456,
        'content_type': 'text/plain',
        'path': 'foo.txt'
    }
    second_finalize = api_client.post('/api/v1/uploads/document/finalize/', second_finalize_data)
    assert second_finalize.status_code == status.HTTP_202_ACCEPTED

    assert Document.objects.count() == 2
    assert sorted(Document.objects.values_list('name', flat=True)) == ['foo (2).txt', 'foo.txt']


@pytest.mark.django_db
@patch('documents.views.fileserver_client.generate_upload_url')
def test_finalize_duplicate_name_defensive_rename(mock_fs_upload_url, api_client, user):
    """Test that calling finalize with a duplicate name automatically renames defensively to prevent 500 crashes."""
    api_client.force_authenticate(user=user)
    mock_fs_upload_url.return_value = "/files/upload/some-token"

    # Create initial document named 'README_zh.md'
    root_folder = Folder.objects.get_root_for_org(user.organization)
    Document.objects.create(name='README_zh.md', organization=user.organization, created_by=user, folder=root_folder)

    # Finalize a new upload where client passes 'README_zh.md' as unique_name
    finalize_data = {
        'storage_key': f"{user.organization.id}/storage/README_zh.md",
        'unique_name': 'README_zh.md',
        'file_size': 1024,
        'content_type': 'text/markdown',
        'path': None
    }
    response = api_client.post('/api/v1/uploads/document/finalize/', finalize_data, format='json')
    assert response.status_code == status.HTTP_202_ACCEPTED
    assert response.json()['name'] == 'README_zh (2).md'


@pytest.mark.django_db
def test_finalize_invalid_or_unauthorized_storage_key(api_client, user):
    """Finalizing an upload with an unauthorized or mismatched storage key prefix returns HTTP 400."""
    api_client.force_authenticate(user=user)

    # Key from different org
    response = api_client.post('/api/v1/uploads/document/finalize/', {
        'storage_key': 'other_org_id/ab/12345.pdf',
        'unique_name': 'test.pdf',
        'file_size': 100,
        'content_type': 'application/pdf',
    }, format='json')
    assert response.status_code == status.HTTP_400_BAD_REQUEST

    # Path traversal key
    response = api_client.post('/api/v1/uploads/document/finalize/', {
        'storage_key': f"{user.organization.id}/../secret.txt",
        'unique_name': 'secret.txt',
        'file_size': 100,
        'content_type': 'text/plain',
    }, format='json')
    assert response.status_code == status.HTTP_400_BAD_REQUEST

    # URL-encoded path traversal key
    response = api_client.post('/api/v1/uploads/document/finalize/', {
        'storage_key': f"{user.organization.id}/%2e%2e/secret.txt",
        'unique_name': 'secret.txt',
        'file_size': 100,
        'content_type': 'text/plain',
    }, format='json')
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_finalize_nonexistent_destination_path_returns_400(api_client, user):
    """Finalizing an upload to a non-existent folder path returns HTTP 400 instead of falling back to root."""
    api_client.force_authenticate(user=user)

    response = api_client.post('/api/v1/uploads/document/finalize/', {
        'storage_key': f"{user.organization.id}/ab/12345.pdf",
        'unique_name': 'test.pdf',
        'file_size': 100,
        'content_type': 'application/pdf',
        'path': 'NonExistentFolder/SubFolder/test.pdf'
    }, format='json')
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "Destination folder path" in response.json()['detail']


@pytest.mark.django_db
@override_settings(SITE_DOMAIN="http://test.coneshare.com")
@patch('documents.views.fileserver_client.generate_download_url')
def test_get_document_preview_data_for_image_document(
    mock_fs_download_url, api_client, image_document_with_content
):
    """
    Verify that preview data for an image document returns a temporary URL
    from the file server.
    """
    primary_version = image_document_with_content.versions.get(is_primary=True)
    mock_fs_download_url.return_value = "http://test.coneshare.com/files/download/some-token"

    url = f'/api/v1/documents/{image_document_with_content.id}/preview-data/'
    response = api_client.get(url)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data['id'] == str(image_document_with_content.id)
    assert len(data['pages']) == 1

    page_data = data['pages'][0]
    expected_url = "http://test.coneshare.com/files/download/some-token"
    assert page_data['url'] == expected_url

    mock_fs_download_url.assert_called_once_with(
        primary_version.original_storage_key, is_internal=False, filename=image_document_with_content.name
    )


@pytest.mark.django_db
@override_settings(SITE_DOMAIN="http://test.coneshare.com")
@override_settings(PDF_PREVIEW_ENGINE='server_pages')
@patch('documents.views.fileserver_client.generate_download_url')
def test_get_document_preview_data_success(mock_fs_download_url, api_client, user):
    """Test successfully retrieving document preview data."""
    # Setup
    mock_fs_download_url.return_value = "http://test.coneshare.com/files/download/some-token"
    doc = Document.objects.create(
        organization=user.organization,
        created_by=user,
        name="preview.pdf",
        num_pages=1,
        status='ready'
    )
    version = DocumentVersion.objects.create(
        document=doc,
        version_number=1,
        is_primary=True,
        has_pages=True,
        num_pages=1
    )
    page = DocumentPage.objects.create(
        document_version=version, page_number=1, storage_key="pages/1.png"
    )

    # Action
    response = api_client.get(f'/api/v1/documents/{doc.id}/preview-data/')

    # Assertions
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data['pages']) == 1
    assert data['pages'][0]['url'] == "http://test.coneshare.com/files/download/some-token"
    mock_fs_download_url.assert_called_once_with(page.storage_key, is_internal=False)


@pytest.mark.django_db
def test_get_document_preview_data_permission_denied_for_other_user(api_client, user2):
    """Test a user cannot access preview data for a document they don't own."""
    # user2 creates a document
    doc_by_user2 = Document.objects.create(
        organization=user2.organization,
        created_by=user2,
        name="user2_doc.pdf",
        status='ready'
    )
    
    # api_client (logged in as user) tries to access it
    response = api_client.get(f'/api/v1/documents/{doc_by_user2.id}/preview-data/')
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_get_document_preview_data_not_ready(api_client, user):
    """Test getting preview data for a document that is not ready."""
    doc = Document.objects.create(
        organization=user.organization,
        created_by=user,
        name="processing.pdf",
        status='processing'
    )
    response = api_client.get(f'/api/v1/documents/{doc.id}/preview-data/')
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "not ready" in response.json()['detail']


@pytest.mark.django_db
@override_settings(MAX_PREVIEW_PAGES=10, PDF_PREVIEW_ENGINE='server_pages')
def test_get_document_preview_data_too_many_pages(api_client, user):
    """Test preview data reports render failure when preview generation exceeded page limits."""
    doc = Document.objects.create(
        organization=user.organization,
        created_by=user,
        name="large_doc.pdf",
        status='ready',
        num_pages=11,
        type='pdf',
        content_type='application/pdf',
    )
    DocumentVersion.objects.create(
        document=doc,
        version_number=1,
        is_primary=True,
        original_storage_key="large_doc.pdf",
        storage_key="large_doc.pdf",
        type='pdf',
        render_status=DocumentVersion.RENDER_FAILED,
        render_error="Document has too many pages to generate a preview.",
    )
    response = api_client.get(f'/api/v1/documents/{doc.id}/preview-data/')
    assert response.status_code == status.HTTP_200_OK
    assert response.json()['preview_status'] == "failed"
    assert response.json()['render_error'] == "Document has too many pages to generate a preview."


@pytest.mark.django_db
@override_settings(PDF_PREVIEW_ENGINE='server_pages')
@patch('documents.views.fileserver_client.delete_file')
@patch('documents.services.generate_pdf_pages_task.delay')
def test_post_rebuild_preview(mock_task_delay, mock_delete_file, api_client, user):
    """Test that POST /rebuild-preview/ resets version render status, deletes pages and re-triggers rendering."""
    doc = Document.objects.create(
        organization=user.organization,
        created_by=user,
        status='ready',
        type='pdf',
    )
    version = DocumentVersion.objects.create(
        document=doc,
        version_number=1,
        original_storage_key="test_rebuild.pdf",
        storage_key="test_rebuild.pdf",
        type='pdf',
        is_primary=True,
        render_status=DocumentVersion.RENDER_READY,
        render_error="Some error",
        has_pages=True,
        num_pages=3,
    )
    
    # Create mock pages
    page1 = DocumentPage.objects.create(document_version=version, page_number=1, storage_key="page1.png")
    page2 = DocumentPage.objects.create(document_version=version, page_number=2, storage_key="page2.png")
    
    assert DocumentPage.objects.filter(document_version=version).count() == 2
    
    # Make request with POST rebuild-preview
    response = api_client.post(f'/api/v1/documents/{doc.id}/rebuild-preview/')
    assert response.status_code == status.HTTP_200_OK
    
    # Refresh version from database
    version.refresh_from_db()
    
    # Assert pages deleted
    assert DocumentPage.objects.filter(document_version=version).count() == 0
    
    # Assert version fields reset and set to queued
    assert version.render_status == DocumentVersion.RENDER_QUEUED
    assert version.render_error == ''
    assert version.has_pages is False
    assert version.num_pages is None
    
    # Assert physical files deleted from storage
    assert mock_delete_file.call_count == 2
    mock_delete_file.assert_any_call("page1.png")
    mock_delete_file.assert_any_call("page2.png")
    
    # Assert task triggered
    mock_task_delay.assert_called_once_with(version.id)


@pytest.mark.django_db
@patch('documents.views.fileserver_client.delete_file')
@patch('documents.services.generate_pdf_pages_task.delay')
def test_rebuild_preview_concurrency_conflict(mock_task_delay, mock_delete_file, api_client, user):
    """Test that POST /rebuild-preview/ rejects with 409 Conflict if a render task is already processing."""
    doc = Document.objects.create(
        organization=user.organization,
        created_by=user,
        status='ready',
        type='pdf',
    )
    version = DocumentVersion.objects.create(
        document=doc,
        version_number=1,
        original_storage_key="test_rebuild.pdf",
        storage_key="test_rebuild.pdf",
        type='pdf',
        is_primary=True,
        render_status=DocumentVersion.RENDER_PROCESSING,
        has_pages=False,
    )
    
    # Create a mock page
    DocumentPage.objects.create(document_version=version, page_number=1, storage_key="page1.png")
    
    # Request rebuild-preview
    response = api_client.post(f'/api/v1/documents/{doc.id}/rebuild-preview/')
    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.json()['detail'] == "A preview generation is already in progress. Please wait."
    
    # Assert nothing was deleted or enqueued
    assert DocumentPage.objects.filter(document_version=version).count() == 1
    mock_delete_file.assert_not_called()
    mock_task_delay.assert_not_called()


@pytest.mark.django_db
@override_settings(PDF_PREVIEW_ENGINE='server_pages')
@patch('documents.views.fileserver_client.delete_file')
@patch('documents.services.generate_pdf_pages_task.delay')
def test_rebuild_preview_no_existing_pages(mock_task_delay, mock_delete_file, api_client, user):
    """Test that rebuild-preview completes cleanly when the version has no existing pages."""
    doc = Document.objects.create(
        organization=user.organization,
        created_by=user,
        status='ready',
        type='pdf',
    )
    version = DocumentVersion.objects.create(
        document=doc,
        version_number=1,
        original_storage_key="test_rebuild.pdf",
        storage_key="test_rebuild.pdf",
        type='pdf',
        is_primary=True,
        render_status=DocumentVersion.RENDER_FAILED,
        has_pages=False,
    )
    
    # Make request
    response = api_client.post(f'/api/v1/documents/{doc.id}/rebuild-preview/')
    assert response.status_code == status.HTTP_200_OK
    
    # Assert database pages is empty and task delay was called
    assert DocumentPage.objects.filter(document_version=version).count() == 0
    mock_delete_file.assert_not_called()
    mock_task_delay.assert_called_once_with(version.id)



@pytest.mark.django_db
def test_get_document_preview_data_wrong_org(api_client):
    """Test that a user cannot access preview data from another organization."""
    other_org = Organization.objects.create(name="Other Org")
    other_user = User.objects.create_user(
        username='other@example.com', organization=other_org
    )
    doc = Document.objects.create(
        organization=other_org,
        created_by=other_user,
        status='ready'
    )
    
    response = api_client.get(f'/api/v1/documents/{doc.id}/preview-data/')
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
@patch('documents.services.fileserver_client.delete_file')
def test_soft_delete_document_success(mock_fs_delete, api_client, user):
    """Test that a user can successfully soft delete their own document."""
    # Setup
    doc = Document.objects.create(organization=user.organization, created_by=user)
    version = DocumentVersion.objects.create(
        document=doc,
        version_number=1,
        original_storage_key="delete_me.pdf"
    )
    DocumentPage.objects.create(
        document_version=version, page_number=1, storage_key="delete_me_page_1.png"
    )

    # Action
    response = api_client.delete(f'/api/v1/documents/{doc.id}/')

    # Assertions
    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not Document.objects.active().filter(id=doc.id).exists()
    assert Document.objects.deleted().filter(id=doc.id).exists()
    
    # Check that file cleanup was NOT triggered
    assert mock_fs_delete.call_count == 0


@pytest.mark.django_db
def test_delete_document_permission_denied(api_client, user, user2):
    """Test that a user cannot delete another user's document."""
    # Setup: user2 creates a document
    doc_by_user2 = Document.objects.create(
        organization=user2.organization, created_by=user2
    )

    # Action: api_client (logged in as user) tries to delete it
    response = api_client.delete(f'/api/v1/documents/{doc_by_user2.id}/')

    # Assertions
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert Document.objects.filter(id=doc_by_user2.id).exists()


@pytest.mark.django_db
def test_soft_delete_document_in_subfolder_success(api_client, user, organization):
    """
    Test that a user can soft delete their document via its ID, even if it's in a subfolder.
    """
    # Setup: Create a document inside a subfolder
    root_folder = Folder.objects.get_root_for_org(organization)
    subfolder = Folder.objects.create(
        organization=organization, created_by=user, name="Subfolder", parent=root_folder
    )
    doc = Document.objects.create(
        organization=organization, created_by=user, folder=subfolder
    )

    # Action: Attempt to delete the document by its ID
    response = api_client.delete(f'/api/v1/documents/{doc.id}/')

    # Assertions: The request should succeed, not 404
    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not Document.objects.active().filter(id=doc.id).exists()
    assert Document.objects.deleted().filter(id=doc.id).exists()


@pytest.mark.django_db
class TestDocumentVersionUploadViews:
    """Tests for the two-step document version upload process."""

    @pytest.fixture
    def document_with_version(self, document):
        """Fixture for a document that has one version."""
        initial_version = document.versions.get(is_primary=True)
        return document, initial_version

    @patch('documents.services.generate_pdf_pages_task.delay')
    @patch('documents.views.fileserver_client.generate_upload_url')
    def test_upload_new_version_success(self, mock_fs_upload_url, mock_task_delay, api_client, document_with_version):
        """Test successfully uploading a new version of a document."""
        mock_fs_upload_url.return_value = "/files/upload/some-token"
        doc, initial_version = document_with_version

        # Step 1: Request upload URL
        request_url = f'/api/v1/uploads/document/{doc.id}/versions/request/'
        request_response = api_client.post(request_url, {'file_name': 'v2.pdf', 'file_size': 11})
        assert request_response.status_code == status.HTTP_200_OK, request_response.json()
        upload_data = request_response.json()
        assert upload_data['upload_url'] == "/files/upload/some-token"
        assert 'storage_key' in upload_data

        # Step 2: Finalize upload
        finalize_url = f'/api/v1/uploads/document/{doc.id}/versions/finalize/'
        finalize_data = {
            'storage_key': upload_data['storage_key'],
            'file_size': 11,
            'content_type': 'application/pdf'
        }
        finalize_response = api_client.post(finalize_url, finalize_data)

        assert finalize_response.status_code == status.HTTP_202_ACCEPTED

        doc.refresh_from_db()
        initial_version.refresh_from_db()

        assert doc.status == 'ready'
        assert doc.versions.count() == 2

        new_version = doc.versions.get(version_number=2)
        assert new_version.is_primary is True
        assert initial_version.is_primary is False
        assert new_version.render_status == DocumentVersion.RENDER_NOT_GENERATED

        mock_task_delay.assert_not_called()

    def test_upload_version_for_other_user_doc_permission_denied(self, api_client, user2):
        """Test a user cannot upload a new version to another user's document."""
        doc_by_user2 = Document.objects.create(
            organization=user2.organization, created_by=user2, name="user2_doc.pdf", status='ready'
        )
        DocumentVersion.objects.create(document=doc_by_user2, version_number=1, is_primary=True)

        request_url = f'/api/v1/uploads/document/{doc_by_user2.id}/versions/request/'
        response = api_client.post(request_url, {'file_name': 'v2.pdf'})

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestDocumentViewSet:
    def test_retrieve_document_with_share_link_views(self, api_client, user, document):
        """
        Test that the document detail endpoint includes nested view session
        data for its share links.
        """
        link = ShareLink.objects.create(document=document, created_by=user)
        ViewSession.objects.create(share_link=link, viewer_email="viewer1@test.com")

        response = api_client.get(f'/api/v1/documents/{document.id}/')
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert data['id'] == str(document.id)

        assert 'share_links' in data
        assert len(data['share_links']) == 1
        share_link_data = data['share_links'][0]

        assert share_link_data['view_count'] == 1
        assert len(share_link_data['recent_view_sessions']) == 1
        assert share_link_data['recent_view_sessions'][0]['viewer_email'] == "viewer1@test.com"

    def test_document_views_pagination(self, api_client, document, share_link):
        """
        Tests that the document views endpoint is properly paginated.
        """
        # Create 15 views for the share link
        for i in range(15):
            ViewSession.objects.create(share_link=share_link, viewer_email=f"viewer{i+1}@example.com")

        # 1. Fetch the first page
        response = api_client.get(f'/api/v1/documents/{document.id}/view-sessions/')
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert data['count'] == 15
        assert len(data['results']) == 10  # Default page size is 10
        assert data['next'] is not None
        assert data['previous'] is None

        # 2. Fetch the second page using the 'next' URL
        response_page_2 = api_client.get(data['next'])
        assert response_page_2.status_code == status.HTTP_200_OK
        data_page_2 = response_page_2.json()

        assert data_page_2['count'] == 15
        assert len(data_page_2['results']) == 5
        assert data_page_2['next'] is None
        assert data_page_2['previous'] is not None

    def test_document_views_forbidden_for_non_owner_dataroom_collaborator(
        self, api_client, document, dataroom, user, user2, admin_user
    ):
        """
        Test that a dataroom collaborator cannot access view_sessions of a document
        owned by another user, while owners and org admins can.
        """
        from datarooms.models import DataroomCollaborator, DataroomDocument

        # Add user2 as collaborator to dataroom containing user's document
        DataroomCollaborator.objects.create(dataroom=dataroom, user=user2)
        DataroomDocument.objects.create(dataroom=dataroom, document=document, name=document.name)

        # 1. As collaborator (user2): document details are accessible (200 OK)
        api_client.force_authenticate(user=user2)
        doc_resp = api_client.get(f'/api/v1/documents/{document.id}/')
        assert doc_resp.status_code == status.HTTP_200_OK

        # But view-sessions access is forbidden (403 Forbidden)
        views_resp = api_client.get(f'/api/v1/documents/{document.id}/view-sessions/')
        assert views_resp.status_code == status.HTTP_403_FORBIDDEN

        # 2. As document owner (user): view-sessions access is permitted (200 OK)
        api_client.force_authenticate(user=user)
        owner_views_resp = api_client.get(f'/api/v1/documents/{document.id}/view-sessions/')
        assert owner_views_resp.status_code == status.HTTP_200_OK

        # 3. As org admin (admin_user): view-sessions access is permitted (200 OK)
        api_client.force_authenticate(user=admin_user)
        admin_views_resp = api_client.get(f'/api/v1/documents/{document.id}/view-sessions/')
        assert admin_views_resp.status_code == status.HTTP_200_OK

    def test_update_document_star_status(self, api_client, document):
        """Test starring and unstarring a document."""
        assert document.is_starred is False

        # Star the document
        response = api_client.patch(f'/api/v1/documents/{document.id}/', {'is_starred': True})
        assert response.status_code == status.HTTP_200_OK
        assert response.data['is_starred'] is True
        document.refresh_from_db()
        assert document.is_starred is True

        # Unstar the document
        response = api_client.patch(f'/api/v1/documents/{document.id}/', {'is_starred': False})
        assert response.status_code == status.HTTP_200_OK
        assert response.data['is_starred'] is False
        document.refresh_from_db()
        assert document.is_starred is False

    def test_star_document_permission_denied(self, api_client, user2, organization):
        """Test a user cannot star another user's document."""
        doc_by_user2 = Document.objects.create(
            name="User2's Document",
            organization=organization,
            created_by=user2,
            is_starred=False
        )

        # api_client (logged in as user) tries to star it
        response = api_client.patch(f'/api/v1/documents/{doc_by_user2.id}/', {'is_starred': True})

        assert response.status_code == status.HTTP_404_NOT_FOUND
        doc_by_user2.refresh_from_db()
        assert doc_by_user2.is_starred is False

    @patch('documents.views.copy_document')
    def test_copy_document_api_success(self, mock_copy_document, api_client, document, user):
        """Test the POST /copy/ endpoint successfully triggers the copy."""
        # Arrange
        from core.fields import generate_ulid
        new_doc_id = generate_ulid()
        new_doc_instance = Document(
            id=new_doc_id,
            name="Copy of doc.pdf",
            created_by=user,
            organization=user.organization
        )
        mock_copy_document.return_value = new_doc_instance

        # Act
        response = api_client.post(f'/api/v1/documents/{document.id}/copy/')

        # Assert
        assert response.status_code == status.HTTP_201_CREATED
        mock_copy_document.assert_called_once()
        # Check that the service was called with the correct document and user
        assert mock_copy_document.call_args[0][0] == document
        assert mock_copy_document.call_args[0][1] == user
        assert response.data['name'] == "Copy of doc.pdf"

    def test_copy_document_api_permission_denied(self, api_client, user2, document):
        """Test a user cannot copy a document they do not own."""
        document.created_by = user2
        document.save()

        response = api_client.post(f'/api/v1/documents/{document.id}/copy/')

        assert response.status_code == status.HTTP_404_NOT_FOUND

    @patch('documents.views.copy_document')
    def test_copy_document_api_quota_exceeded(self, mock_copy_document, api_client, document):
        """Test that the API returns a 400 if QuotaExceededError is raised."""
        mock_copy_document.side_effect = QuotaExceededError("Quota exceeded")

        response = api_client.post(f'/api/v1/documents/{document.id}/copy/')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Quota exceeded" in response.data['detail']

    @patch('documents.services.fileserver_client.copy_file')
    def test_copy_document_api_fileserver_error(self, mock_copy_file, api_client, document):
        """Test that the API returns the correct status if the fileserver fails."""
        document.file_size = 1024  # Add file size to pass initial check
        document.save()

        api_exception = APIException("File server error")
        api_exception.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        mock_copy_file.side_effect = api_exception

        response = api_client.post(f'/api/v1/documents/{document.id}/copy/')

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert "File server error" in response.data['detail']

    @patch('documents.views.copy_document')
    def test_copy_document_api_throttling(self, mock_copy_document, api_client, document):
        """Test that the copy document API is throttled at 5 requests per minute."""
        from django.core.cache import cache
        from core.fields import generate_ulid
        cache.clear()
        try:
            new_doc_id = generate_ulid()
            new_doc_instance = Document(
                id=new_doc_id,
                name="Copy of doc.pdf",
                created_by=document.created_by,
                organization=document.organization
            )
            mock_copy_document.return_value = new_doc_instance

            # 5 successful requests
            for _ in range(5):
                response = api_client.post(f'/api/v1/documents/{document.id}/copy/')
                assert response.status_code == status.HTTP_201_CREATED

            # The 6th request should be throttled (429 Too Many Requests)
            response = api_client.post(f'/api/v1/documents/{document.id}/copy/')
            assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        finally:
            cache.clear()


@pytest.mark.django_db
class TestMoveItemsView:
    """Tests for the MoveItemsView endpoint."""

    @pytest.fixture
    def setup_folders(self, user, organization):
        """Setup initial folder structure for move tests."""
        root = Folder.objects.get_root_for_org(organization)
        folder_a = Folder.objects.create(name="Folder A", created_by=user, organization=organization, parent=root)
        folder_b = Folder.objects.create(name="Folder B", created_by=user, organization=organization, parent=root)
        subfolder_a = Folder.objects.create(name="Subfolder A", created_by=user, organization=organization, parent=folder_a)
        doc_in_a = Document.objects.create(name="Doc in A.pdf", created_by=user, organization=organization, folder=folder_a)
        doc_in_root = Document.objects.create(name="Doc in Root.pdf", created_by=user, organization=organization, folder=root)
        return {
            'root': root,
            'folder_a': folder_a,
            'folder_b': folder_b,
            'subfolder_a': subfolder_a,
            'doc_in_a': doc_in_a,
            'doc_in_root': doc_in_root,
        }

    def test_move_items_to_another_folder(self, api_client, setup_folders):
        """Test moving a document and a folder into another folder."""
        data = {
            'document_ids': [str(setup_folders['doc_in_root'].id)],
            'folder_ids': [str(setup_folders['folder_a'].id)],
            'destination_folder_id': str(setup_folders['folder_b'].id)
        }
        response = api_client.post('/api/v1/actions/move/', data)
        assert response.status_code == status.HTTP_200_OK

        setup_folders['doc_in_root'].refresh_from_db()
        setup_folders['folder_a'].refresh_from_db()

        assert setup_folders['doc_in_root'].folder == setup_folders['folder_b']
        assert setup_folders['folder_a'].parent == setup_folders['folder_b']

    def test_move_items_to_root(self, api_client, setup_folders):
        """Test moving items from a subfolder to the root folder."""
        data = {
            'document_ids': [str(setup_folders['doc_in_a'].id)],
            'folder_ids': [str(setup_folders['subfolder_a'].id)],
            'destination_folder_id': None  # None signifies root
        }
        response = api_client.post('/api/v1/actions/move/', data, format='json')
        assert response.status_code == status.HTTP_200_OK

        setup_folders['doc_in_a'].refresh_from_db()
        setup_folders['subfolder_a'].refresh_from_db()

        assert setup_folders['doc_in_a'].folder == setup_folders['root']
        assert setup_folders['subfolder_a'].parent == setup_folders['root']

    def test_move_folder_into_itself_fails(self, api_client, setup_folders):
        """Test that moving a folder into itself is not allowed."""
        data = {
            'folder_ids': [str(setup_folders['folder_a'].id)],
            'destination_folder_id': str(setup_folders['folder_a'].id)
        }
        response = api_client.post('/api/v1/actions/move/', data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "into itself" in response.data['detail']

    def test_move_folder_into_descendant_fails(self, api_client, setup_folders):
        """Test that moving a folder into one of its own children is not allowed."""
        data = {
            'folder_ids': [str(setup_folders['folder_a'].id)],
            'destination_folder_id': str(setup_folders['subfolder_a'].id)
        }
        response = api_client.post('/api/v1/actions/move/', data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "into one of its own subfolders" in response.data['detail']

    def test_move_items_permission_denied_for_destination(self, api_client, user2, setup_folders):
        """A user cannot move items into a folder they do not own."""
        other_user_folder = Folder.objects.create(name="User2 Folder", created_by=user2, organization=user2.organization, parent=setup_folders['root'])
        data = {
            'document_ids': [str(setup_folders['doc_in_root'].id)],
            'destination_folder_id': str(other_user_folder.id)
        }
        response = api_client.post('/api/v1/actions/move/', data)
        assert response.status_code == status.HTTP_404_NOT_FOUND  # Because the folder is not in the user's queryset
        assert "Destination folder not found" in response.data['detail']

    def test_move_items_permission_denied_for_source(self, api_client, user2, setup_folders):
        """A user cannot move items they do not own."""
        other_user_doc = Document.objects.create(name="User2 Doc.pdf", created_by=user2, organization=user2.organization, folder=setup_folders['root'])
        data = {
            'document_ids': [str(other_user_doc.id)],
            'destination_folder_id': str(setup_folders['folder_a'].id)
        }
        response = api_client.post('/api/v1/actions/move/', data)
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "permission to move" in response.data['detail']

    def test_move_items_with_name_conflict_is_renamed(self, api_client, user, setup_folders):
        """Test that a moved item with a name conflict is automatically renamed."""
        # Create a document in Folder B with the same name as a document in Folder A
        Document.objects.create(name="Doc in A.pdf", created_by=user, organization=user.organization, folder=setup_folders['folder_b'])
        
        data = {
            'document_ids': [str(setup_folders['doc_in_a'].id)],
            'destination_folder_id': str(setup_folders['folder_b'].id)
        }
        response = api_client.post('/api/v1/actions/move/', data)
        assert response.status_code == status.HTTP_200_OK

        setup_folders['doc_in_a'].refresh_from_db()
        assert setup_folders['doc_in_a'].folder == setup_folders['folder_b']
        assert setup_folders['doc_in_a'].name == "Doc in A (2).pdf"

    def test_move_no_items_fails(self, api_client, setup_folders):
        """Test that calling the move endpoint with no item IDs fails."""
        data = {
            'document_ids': [],
            'folder_ids': [],
            'destination_folder_id': str(setup_folders['folder_a'].id)
        }
        response = api_client.post('/api/v1/actions/move/', data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "No items selected to move" in response.data['detail']


@pytest.mark.django_db
class TestQuotaAndSizeTracking:
    @pytest.fixture(autouse=True)
    def setup(self, user):
        user.total_document_size = 0
        user.save()

    @patch('documents.services.generate_pdf_pages_task.delay')
    @patch('documents.services.convert_office_to_pdf_task.delay')
    @patch('documents.views.fileserver_client.generate_upload_url')
    def test_document_lifecycle_updates_user_size(self, mock_fs_upload_url, mock_convert_task, mock_pdf_task, api_client, user):
        """
        Test that creating, versioning, and deleting documents correctly updates
        the user's total_document_size.
        """
        mock_fs_upload_url.return_value = "/files/upload/token"
        assert user.total_document_size == 0

        # 1. Create a document (1MB)
        file_size_1 = 1 * 1024 * 1024
        finalize_data = {
            'storage_key': f"{user.organization.id}/key1",
            'unique_name': 'doc1.pdf',
            'file_size': file_size_1,
            'content_type': 'application/pdf',
        }
        response = api_client.post('/api/v1/uploads/document/finalize/', finalize_data)
        assert response.status_code == status.HTTP_202_ACCEPTED
        user.refresh_from_db()
        assert user.total_document_size == file_size_1
        doc = Document.objects.get(name='doc1.pdf')

        # 2. Upload a new version (2MB)
        file_size_2 = 2 * 1024 * 1024
        finalize_version_url = f'/api/v1/uploads/document/{doc.id}/versions/finalize/'
        finalize_version_data = {
            'storage_key': 'key2',
            'file_size': file_size_2,
            'content_type': 'application/pdf'
        }
        api_client.post(finalize_version_url, finalize_version_data)
        user.refresh_from_db()
        # Size should now be 2MB, not 3MB (old was replaced)
        assert user.total_document_size == file_size_2

        # 3. Soft Delete the document
        api_client.delete(f'/api/v1/documents/{doc.id}/')
        user.refresh_from_db()
        # Size should still be 2MB
        assert user.total_document_size == file_size_2

        # 4. Permanent Delete the document from trash
        api_client.delete(f'/api/v1/trash/{doc.id}/permanent/')
        user.refresh_from_db()
        assert user.total_document_size == 0

    @patch('documents.views.fileserver_client.generate_upload_url')
    def test_upload_request_respects_quota(self, mock_fs_upload_url, api_client, user):
        """Test that the document upload request endpoint rejects uploads that exceed the quota."""
        api_client.force_authenticate(user=user)
        mock_fs_upload_url.return_value = "/files/upload/token"
        user.custom_file_size_quota_mb = 1
        user.save()

        # This should fail (2MB > 1MB)
        request_data_fail = {'file_name': 'large.pdf', 'file_size': 2 * 1024 * 1024}
        response_fail = api_client.post('/api/v1/uploads/document/request/', request_data_fail)
        assert response_fail.status_code == status.HTTP_400_BAD_REQUEST
        assert "exceed your storage quota" in response_fail.data['detail']

        # This should succeed (0.5MB < 1MB)
        request_data_ok = {'file_name': 'small.pdf', 'file_size': 512 * 1024}
        response_ok = api_client.post('/api/v1/uploads/document/request/', request_data_ok)
        assert response_ok.status_code == status.HTTP_200_OK

    @patch('documents.views.fileserver_client.generate_upload_url')
    def test_upload_request_nonexistent_folder_path_returns_400(self, mock_fs_upload_url, api_client, user):
        """Test that requesting upload with a non-existent folder path returns HTTP 400."""
        api_client.force_authenticate(user=user)
        mock_fs_upload_url.return_value = "/files/upload/token"

        request_data = {
            'file_name': 'doc.pdf',
            'file_size': 1024,
            'path': 'NonExistentFolder/doc.pdf'
        }
        response = api_client.post('/api/v1/uploads/document/request/', request_data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Folder path 'NonExistentFolder' does not exist." in response.data['detail']

@pytest.mark.django_db
@patch('documents.views.fileserver_client.generate_preview_url')
def test_get_document_preview_data_client_pdf(mock_fs_preview_url, api_client, user):
    """Test getting preview data for a PDF when PDF.js engine is used."""
    mock_fs_preview_url.return_value = "https://mock.fileserver/client_pdf.pdf"
    
    doc = Document.objects.create(
        organization=user.organization,
        created_by=user,
        name="test_client.pdf",
        status="ready",
        type="pdf",
        content_type="application/pdf",
        download_only=False,
    )
    DocumentVersion.objects.create(
        document=doc,
        version_number=1,
        type="pdf",
        is_primary=True,
        original_storage_key="test_client.pdf",
        render_status="not_generated",
    )

    with override_settings(PDF_PREVIEW_ENGINE='pdfjs'):
        response = api_client.get(f'/api/v1/documents/{doc.id}/preview-data/')

    assert response.status_code == 200
    data = response.json()
    assert data['preview_mode'] == 'client_pdf'
    assert data['preview_status'] == 'ready'
    assert data['pdf_preview_url'] == 'https://mock.fileserver/client_pdf.pdf'


def test_document_status_endpoint(api_client, user, organization):
    """Test retrieving document status via the lightweight status endpoint."""
    doc = Document.objects.create(
        name="Status Test.pdf",
        organization=organization,
        created_by=user,
        status="processing",
        status_message="Downloading from cloud..."
    )

    response = api_client.get(f'/api/v1/documents/{doc.id}/status/')
    assert response.status_code == status.HTTP_200_OK
    assert response.data == {
        'status': 'processing',
        'status_message': 'Downloading from cloud...'
    }


@pytest.mark.django_db
def test_promote_version_endpoint_success(api_client, user, organization):
    """Test promoting a document version via the API."""
    doc = Document.objects.create(
        name="Promote API Test.pdf",
        organization=organization,
        created_by=user,
        status="ready",
        file_size=100,
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
    )
    v2 = DocumentVersion.objects.create(
        document=doc,
        version_number=2,
        is_primary=False,
        file_size=200,
        content_type="application/pdf",
        original_storage_key="v2.pdf",
        storage_key="v2.pdf",
        type="pdf",
    )

    response = api_client.post(
        f'/api/v1/documents/{doc.id}/promote_version/',
        {'version_id': str(v2.id)}
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.data['file_size'] == 200
    assert response.data['storage_key'] == "v2.pdf"
    
    doc.refresh_from_db()
    v1.refresh_from_db()
    v2.refresh_from_db()
    
    assert not v1.is_primary
    assert v2.is_primary
    assert doc.file_size == 200
    assert doc.storage_key == "v2.pdf"


@pytest.mark.django_db
def test_promote_version_endpoint_wrong_doc(api_client, user, organization):
    """Test promoting a version that belongs to a different document returns 404."""
    doc1 = Document.objects.create(
        name="Doc1.pdf",
        organization=organization,
        created_by=user,
    )
    doc2 = Document.objects.create(
        name="Doc2.pdf",
        organization=organization,
        created_by=user,
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

    response = api_client.post(
        f'/api/v1/documents/{doc1.id}/promote_version/',
        {'version_id': str(v_other.id)}
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
@patch('documents.views.fileserver_client.generate_download_url')
@patch('documents.views.fileserver_client.generate_preview_url')
def test_preview_data_endpoint_with_version_id(mock_preview_url, mock_download_url, api_client, user, organization):
    """Test retrieving preview data for a specific inactive version."""
    mock_download_url.return_value = "https://mock.fileserver/v1.pdf"
    mock_preview_url.return_value = "https://mock.fileserver/client_pdf.pdf"

    doc = Document.objects.create(
        name="Preview Version Test.pdf",
        organization=organization,
        created_by=user,
        status="ready",
        file_size=100,
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
    )
    v2 = DocumentVersion.objects.create(
        document=doc,
        version_number=2,
        is_primary=False,
        file_size=200,
        content_type="application/pdf",
        original_storage_key="v2.pdf",
        storage_key="v2.pdf",
        type="pdf",
        render_error="Stale preview failed",
    )

    with override_settings(PDF_PREVIEW_ENGINE='pdfjs'):
        # Preview specific version v2 (which is inactive)
        response = api_client.get(f'/api/v1/documents/{doc.id}/preview-data/?version_id={v2.id}')

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data['render_error'] == "Stale preview failed"


@pytest.mark.django_db
def test_list_versions_endpoint_success(api_client, user, organization):
    """Test retrieving document version history via the API."""
    doc = Document.objects.create(
        name="List Versions Test.pdf",
        organization=organization,
        created_by=user,
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
    )
    v2 = DocumentVersion.objects.create(
        document=doc,
        version_number=2,
        is_primary=False,
        file_size=200,
        content_type="application/pdf",
        original_storage_key="v2.pdf",
        storage_key="v2.pdf",
        type="pdf",
    )

    response = api_client.get(f'/api/v1/documents/{doc.id}/versions/')
    assert response.status_code == status.HTTP_200_OK
    
    data = response.json()
    assert isinstance(data, dict)
    assert 'count' in data
    assert 'results' in data
    assert data['count'] == 2
    
    results = data['results']
    assert len(results) == 2
    assert results[0]['version_number'] == 2
    assert results[1]['version_number'] == 1
    assert 'pages' not in results[0]


@pytest.mark.django_db
@patch('core.services.get_dynamic_setting')
def test_promote_version_endpoint_respects_quota(mock_get_setting, api_client, user, organization):
    """Test that promoting a version that exceeds user storage quota fails."""
    def get_setting_mock(key):
        if key == 'FILE_SIZE_QUOTA_MB':
            return 1
        elif key == 'MAX_PREVIEW_FILE_SIZE_MB':
            return 100
        elif key == 'MAX_VIDEO_PREVIEW_SIZE_MB':
            return 100
        return 0
    mock_get_setting.side_effect = get_setting_mock

    doc = Document.objects.create(
        name="Doc.pdf",
        organization=organization,
        created_by=user,
        status="ready",
        file_size=500 * 1024,
    )
    v1 = DocumentVersion.objects.create(
        document=doc,
        version_number=1,
        is_primary=True,
        file_size=500 * 1024,
        content_type="application/pdf",
        original_storage_key="v1.pdf",
        storage_key="v1.pdf",
        type="pdf",
    )
    v2 = DocumentVersion.objects.create(
        document=doc,
        version_number=2,
        is_primary=False,
        file_size=1500 * 1024,
        content_type="application/pdf",
        original_storage_key="v2.pdf",
        storage_key="v2.pdf",
        type="pdf",
    )
    user.total_document_size = 500 * 1024
    user.save()

    response = api_client.post(
        f'/api/v1/documents/{doc.id}/promote_version/',
        {'version_id': str(v2.id)}
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "exceed your storage quota" in response.json()['detail']


def test_preview_data_endpoint_document_uploading_state(api_client, user, organization):
    """Test retrieving preview data when document is in uploading state."""
    doc = Document.objects.create(
        name="Test.pdf",
        organization=organization,
        created_by=user,
        status="uploading",
        file_size=100,
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
    )
    # Even with a specific version_id, preview should be rejected since document is uploading
    response = api_client.get(f'/api/v1/documents/{doc.id}/preview-data/?version_id={v1.id}')
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()['detail'] == "Document is not ready for preview."


@pytest.mark.django_db
def test_soft_deleted_document_not_accessible_via_document_viewset(api_client, user, organization):
    """
    RED Test: Verify soft-deleted documents return 404 on retrieve, status, download,
    preview-data, versions endpoints, and are excluded from folder list query.
    """
    root_folder = Folder.objects.get_root_for_org(organization)
    doc = Document.objects.create(
        name="DeletedDoc.pdf",
        organization=organization,
        created_by=user,
        folder=root_folder,
        status="ready",
        file_size=100,
        type="pdf",
    )
    DocumentVersion.objects.create(
        document=doc,
        version_number=1,
        is_primary=True,
        file_size=100,
        content_type="application/pdf",
        original_storage_key="v1.pdf",
        storage_key="v1.pdf",
        type="pdf",
    )

    # Soft delete the document
    api_client.delete(f'/api/v1/documents/{doc.id}/')

    # 1. Retrieve -> 404
    res = api_client.get(f'/api/v1/documents/{doc.id}/')
    assert res.status_code == status.HTTP_404_NOT_FOUND

    # 2. List in folder -> should not include doc
    res = api_client.get(f'/api/v1/documents/?folder={root_folder.id}')
    assert res.status_code == status.HTTP_200_OK
    data = res.json()
    items_list = data['results'] if isinstance(data, dict) and 'results' in data else data
    doc_ids = [d['id'] for d in items_list]
    assert doc.id not in doc_ids

    # 3. Status endpoint -> 404
    res = api_client.get(f'/api/v1/documents/{doc.id}/status/')
    assert res.status_code == status.HTTP_404_NOT_FOUND

    # 4. Download endpoint -> 404
    res = api_client.get(f'/api/v1/documents/{doc.id}/download/')
    assert res.status_code == status.HTTP_404_NOT_FOUND

    # 5. Preview data -> 404
    res = api_client.get(f'/api/v1/documents/{doc.id}/preview-data/')
    assert res.status_code == status.HTTP_404_NOT_FOUND

    # 6. Versions endpoint -> 404
    res = api_client.get(f'/api/v1/documents/{doc.id}/versions/')
    assert res.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_soft_deleted_folder_not_accessible_via_folder_viewset(api_client, user, organization):
    """
    RED Test: Verify soft-deleted folders return 404 on retrieve and cannot be used as parent for new subfolders.
    """
    root_folder = Folder.objects.get_root_for_org(organization)
    folder = Folder.objects.create(
        name="TrashedFolder",
        organization=organization,
        parent=root_folder,
        created_by=user,
    )

    # Soft delete the folder
    api_client.delete(f'/api/v1/folders/{folder.id}/')

    # 1. Retrieve -> 404
    res = api_client.get(f'/api/v1/folders/{folder.id}/')
    assert res.status_code == status.HTTP_404_NOT_FOUND

    # 2. Subfolder creation under trashed parent -> rejected
    res = api_client.post('/api/v1/folders/', {
        'name': 'NewSubfolder',
        'parent': folder.id,
    })
    assert res.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_404_NOT_FOUND]


@pytest.mark.django_db
def test_restore_folder_with_duplicate_trashed_document_names_succeeds(api_client, user, organization):
    """
    Test: Restoring a folder with active/trashed documents of the same name
    resolves collisions without throwing a 500 / IntegrityError.
    """
    api_client.force_authenticate(user=user)
    root_folder = Folder.objects.get_root_for_org(organization)
    reports = Folder.objects.create(name="Reports", organization=organization, created_by=user, parent=root_folder)

    # 1. Create first Q1.pdf and soft delete it independently
    doc1 = Document.objects.create(name="Q1.pdf", organization=organization, created_by=user, folder=reports, status="ready")
    api_client.delete(f'/api/v1/documents/{doc1.id}/')

    # 2. Create second Q1.pdf in same folder while doc1 is in trash
    doc2 = Document.objects.create(name="Q1.pdf", organization=organization, created_by=user, folder=reports, status="ready")

    # 3. Soft delete the folder (soft deletes reports and doc2 together)
    api_client.delete(f'/api/v1/folders/{reports.id}/')

    # 4. Restore the folder via TrashViewSet (restores reports and doc2)
    res = api_client.post(f'/api/v1/trash/{reports.id}/restore/')
    assert res.status_code == status.HTTP_200_OK

    doc2.refresh_from_db()
    assert doc2.deleted_at is None

    # 5. Restore doc1 independently from trash
    res_doc1 = api_client.post(f'/api/v1/trash/{doc1.id}/restore/')
    assert res_doc1.status_code == status.HTTP_200_OK

    doc1.refresh_from_db()
    assert doc1.deleted_at is None
    assert doc1.name != doc2.name  # Renamed to avoid DB unique constraint collision


@pytest.mark.django_db
def test_restore_document_with_trashed_parent_folder_is_rejected(api_client, user, organization):
    """
    RED Test (macOS 14 Behavior): Restoring a document whose parent folder is in Trash
    must be rejected with a 400 Bad Request error stating the parent folder is in Trash.
    """
    api_client.force_authenticate(user=user)
    root_folder = Folder.objects.get_root_for_org(organization)
    parent_folder = Folder.objects.create(name="ParentFolder", organization=organization, created_by=user, parent=root_folder)
    sub_folder = Folder.objects.create(name="SubFolder", organization=organization, created_by=user, parent=parent_folder)
    doc = Document.objects.create(name="DocInSub.pdf", organization=organization, created_by=user, folder=sub_folder, status="ready")

    # Soft delete parent folder (cascades to sub_folder and doc)
    api_client.delete(f'/api/v1/folders/{parent_folder.id}/')

    # Attempt to restore document alone -> rejected
    res = api_client.post(f'/api/v1/trash/{doc.id}/restore/')
    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert "parent folder 'SubFolder' is in Trash" in res.json().get('detail', '')

    # Verify items remain in Trash
    doc.refresh_from_db()
    sub_folder.refresh_from_db()
    assert doc.deleted_at is not None
    assert sub_folder.deleted_at is not None


@pytest.mark.django_db
def test_trash_list_filters_to_root_level_deleted_items_only(api_client, user, organization):
    """
    RED Test: GET /api/v1/trash/ must only list top-level (root) deleted entries.
    Nested files and subfolders inside a deleted folder must not clog the trash list.
    """
    api_client.force_authenticate(user=user)
    root_folder = Folder.objects.get_root_for_org(organization)
    parent_folder = Folder.objects.create(name="ParentFolder", organization=organization, created_by=user, parent=root_folder)
    sub_folder = Folder.objects.create(name="SubFolder", organization=organization, created_by=user, parent=parent_folder)
    doc = Document.objects.create(name="DocInSub.pdf", organization=organization, created_by=user, folder=sub_folder, status="ready")

    # Soft delete parent folder (cascades to sub_folder and doc)
    api_client.delete(f'/api/v1/folders/{parent_folder.id}/')

    # Fetch trash list
    res = api_client.get('/api/v1/trash/')
    assert res.status_code == status.HTTP_200_OK
    data = res.json()
    items = data['results'] if isinstance(data, dict) and 'results' in data else data

    # Trash list should only contain 1 item (ParentFolder), not 3 items
    item_ids = [item['id'] for item in items]
    assert len(items) == 1
    assert str(parent_folder.id) in item_ids
    assert str(sub_folder.id) not in item_ids
    assert str(doc.id) not in item_ids


@pytest.mark.django_db
def test_trash_restore_returns_rename_feedback(api_client, user, organization):
    """
    RED Test: Restoring a soft-deleted document that undergoes collision renaming
    must return detailed rename feedback (was_renamed=True, name, original_name) in API response.
    """
    api_client.force_authenticate(user=user)
    root_folder = Folder.objects.get_root_for_org(organization)

    # 1. Trashed document "File.pdf"
    trashed_doc = Document.objects.create(name="File.pdf", organization=organization, created_by=user, folder=root_folder, status="ready")
    api_client.delete(f'/api/v1/documents/{trashed_doc.id}/')

    # 2. Active document "File.pdf" in same folder
    Document.objects.create(name="File.pdf", organization=organization, created_by=user, folder=root_folder, status="ready")

    # 3. Restore trashed document
    res = api_client.post(f'/api/v1/trash/{trashed_doc.id}/restore/')
    assert res.status_code == status.HTTP_200_OK
    res_data = res.json()

    assert res_data.get('was_renamed') is True
    assert res_data.get('name').startswith("File (")
    assert "Restored as" in res_data.get('detail', '')


@pytest.mark.django_db
def test_independently_trashed_file_remains_in_trash_when_parent_folder_trashed(api_client, user, organization):
    """
    RED Test (Workflow B):
    1. Trashing foo.c BEFORE trashing its parent folder src makes foo.c an independent trash entry.
    2. Trashing src afterwards shows BOTH src AND foo.c in Trash (2 items).
    3. Restoring src restores src and items trashed WITH src, but LEAVES foo.c in Trash.
    """
    import time
    api_client.force_authenticate(user=user)
    root_folder = Folder.objects.get_root_for_org(organization)
    src_folder = Folder.objects.create(name="src", organization=organization, created_by=user, parent=root_folder)
    foo_doc = Document.objects.create(name="foo.c", organization=organization, created_by=user, folder=src_folder, status="ready")

    # 1. Soft delete foo.c first
    api_client.delete(f'/api/v1/documents/{foo_doc.id}/')
    time.sleep(0.02)  # Ensure distinct timestamps

    # 2. Soft delete folder src second
    api_client.delete(f'/api/v1/folders/{src_folder.id}/')

    # 3. GET /api/v1/trash/ should list BOTH src AND foo.c (2 items)
    res = api_client.get('/api/v1/trash/')
    assert res.status_code == status.HTTP_200_OK
    data = res.json()
    items = data['results'] if isinstance(data, dict) and 'results' in data else data
    item_ids = [item['id'] for item in items]

    assert len(items) == 2
    assert str(src_folder.id) in item_ids
    assert str(foo_doc.id) in item_ids

    # 4. Restoring src should restore src, but LEAVE foo.c in Trash
    res_restore = api_client.post(f'/api/v1/trash/{src_folder.id}/restore/')
    assert res_restore.status_code == status.HTTP_200_OK

    src_folder.refresh_from_db()
    foo_doc.refresh_from_db()

    assert src_folder.deleted_at is None
    assert foo_doc.deleted_at is not None  # foo.c stays in Trash!

    # 5. Restoring foo.c independently restores foo.c
    res_restore_foo = api_client.post(f'/api/v1/trash/{foo_doc.id}/restore/')
    assert res_restore_foo.status_code == status.HTTP_200_OK
    foo_doc.refresh_from_db()
    assert foo_doc.deleted_at is None


@pytest.mark.django_db
def test_restore_document_relinks_to_newly_created_active_parent_folder(api_client, user, organization):
    """
    RED Test: If original parent folder 'images' was soft-deleted, but user manually created a new
    active folder named 'images', restoring a document from trash should automatically re-link to the new
    active 'images' folder instead of failing.
    """
    api_client.force_authenticate(user=user)
    root_folder = Folder.objects.get_root_for_org(organization)

    # 1. Create original folder 'images' and document inside it
    old_images_folder = Folder.objects.create(name="images", organization=organization, created_by=user, parent=root_folder)
    doc = Document.objects.create(name="photo.jpeg", organization=organization, created_by=user, folder=old_images_folder, status="ready")

    # 2. Soft delete old_images_folder (soft deletes old_images_folder and doc)
    api_client.delete(f'/api/v1/folders/{old_images_folder.id}/')

    # 3. User manually creates a NEW active folder named 'images' under root
    new_images_folder = Folder.objects.create(name="images", organization=organization, created_by=user, parent=root_folder)
    assert new_images_folder.id != old_images_folder.id

    # 4. Restore photo.jpeg
    res = api_client.post(f'/api/v1/trash/{doc.id}/restore/')
    assert res.status_code == status.HTTP_200_OK

    doc.refresh_from_db()
    assert doc.deleted_at is None
    assert doc.folder == new_images_folder


@pytest.mark.django_db
def test_restore_document_does_not_relink_to_another_users_active_parent_folder(api_client, user, organization):
    """
    Test: Active replacement folder lookup must be scoped to the document owner (created_by).
    A document restored by User A must NOT be relinked to an active folder 'images' created by User B.
    """
    other_user = User.objects.create_user(username="other@example.com", email="other@example.com", password="password", organization=organization)
    api_client.force_authenticate(user=user)
    root_folder = Folder.objects.get_root_for_org(organization)

    # 1. User A creates folder 'images' and document inside it
    old_images_folder = Folder.objects.create(name="images", organization=organization, created_by=user, parent=root_folder)
    doc = Document.objects.create(name="photo.jpeg", organization=organization, created_by=user, folder=old_images_folder, status="ready")

    # 2. Soft delete old_images_folder
    api_client.delete(f'/api/v1/folders/{old_images_folder.id}/')

    # 3. Other user (User B) creates an active folder named 'images'
    other_user_images_folder = Folder.objects.create(name="images", organization=organization, created_by=other_user, parent=root_folder)

    # 4. User A attempts to restore photo.jpeg -> should be rejected because User A has no active 'images' folder
    res = api_client.post(f'/api/v1/trash/{doc.id}/restore/')
    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert "parent folder 'images' is in Trash" in res.json().get('detail', '')


@pytest.mark.django_db
def test_rename_document_with_duplicate_name_fails(api_client, user, organization):
    """
    RED Test: Renaming a document to a name that already exists in the same folder
    should return 400 Bad Request with a clear validation error, instead of crashing
    with a 500 SQLite IntegrityError.
    """
    api_client.force_authenticate(user=user)
    root_folder = Folder.objects.get_root_for_org(organization)

    # 1. Create two documents in the same folder
    doc1 = Document.objects.create(name="foo.c", organization=organization, created_by=user, folder=root_folder, status="ready")
    doc2 = Document.objects.create(name="foo.txt", organization=organization, created_by=user, folder=root_folder, status="ready")

    # 2. Attempt to rename doc1 to "foo.txt"
    response = api_client.patch(f'/api/v1/documents/{doc1.id}/', {'name': 'foo.txt'}, format='json')

    # 3. Must return 400 Bad Request with field validation error
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'name' in response.json()
    assert 'already exists' in str(response.json()['name'])


@pytest.mark.django_db
def test_create_subfolder_touches_parent_folder_mtime(api_client, user, organization):
    """Test creating a subfolder touches its parent folder updated_at."""
    api_client.force_authenticate(user=user)
    root_folder = Folder.objects.get_root_for_org(organization)
    parent_folder = Folder.objects.create(name="Parent", organization=organization, created_by=user, parent=root_folder)
    past_time = timezone.now() - timedelta(days=2)
    Folder.objects.filter(id=parent_folder.id).update(updated_at=past_time)
    parent_folder.refresh_from_db()
    assert parent_folder.updated_at == past_time

    res = api_client.post('/api/v1/folders/', {'name': 'New Child', 'parent': parent_folder.id}, format='json')
    assert res.status_code == status.HTTP_201_CREATED

    parent_folder.refresh_from_db()
    assert parent_folder.updated_at > past_time


@pytest.mark.django_db
def test_rename_subfolder_touches_parent_folder_mtime(api_client, user, organization):
    """Test renaming a subfolder touches its parent folder updated_at."""
    api_client.force_authenticate(user=user)
    root_folder = Folder.objects.get_root_for_org(organization)
    parent_folder = Folder.objects.create(name="Parent", organization=organization, created_by=user, parent=root_folder)
    child_folder = Folder.objects.create(name="Old Child", organization=organization, created_by=user, parent=parent_folder)
    past_time = timezone.now() - timedelta(days=2)
    Folder.objects.filter(id=parent_folder.id).update(updated_at=past_time)
    parent_folder.refresh_from_db()
    assert parent_folder.updated_at == past_time

    res = api_client.patch(f'/api/v1/folders/{child_folder.id}/', {'name': 'Renamed Child'}, format='json')
    assert res.status_code == status.HTTP_200_OK

    parent_folder.refresh_from_db()
    assert parent_folder.updated_at > past_time


@pytest.mark.django_db
def test_rename_document_touches_parent_folder_mtime(api_client, user, organization):
    """Test renaming a document touches its parent folder updated_at."""
    api_client.force_authenticate(user=user)
    root_folder = Folder.objects.get_root_for_org(organization)
    parent_folder = Folder.objects.create(name="Parent", organization=organization, created_by=user, parent=root_folder)
    doc = Document.objects.create(name="doc.pdf", organization=organization, created_by=user, folder=parent_folder, status="ready")
    past_time = timezone.now() - timedelta(days=2)
    Folder.objects.filter(id=parent_folder.id).update(updated_at=past_time)
    parent_folder.refresh_from_db()
    assert parent_folder.updated_at == past_time

    res = api_client.patch(f'/api/v1/documents/{doc.id}/', {'name': 'renamed_doc.pdf'}, format='json')
    assert res.status_code == status.HTTP_200_OK

    parent_folder.refresh_from_db()
    assert parent_folder.updated_at > past_time


@pytest.mark.django_db
def test_bulk_move_items_touches_source_and_destination_folders(api_client, user, organization):
    """Test moving documents/folders touches both source and destination parent folder updated_at."""
    api_client.force_authenticate(user=user)
    root_folder = Folder.objects.get_root_for_org(organization)
    source_folder = Folder.objects.create(name="Source", organization=organization, created_by=user, parent=root_folder)
    dest_folder = Folder.objects.create(name="Dest", organization=organization, created_by=user, parent=root_folder)
    doc = Document.objects.create(name="move_me.pdf", organization=organization, created_by=user, folder=source_folder, status="ready")

    past_time = timezone.now() - timedelta(days=2)
    Folder.objects.filter(id__in=[source_folder.id, dest_folder.id]).update(updated_at=past_time)
    source_folder.refresh_from_db()
    dest_folder.refresh_from_db()
    assert source_folder.updated_at == past_time
    assert dest_folder.updated_at == past_time

    res = api_client.post('/api/v1/actions/move/', {
        'document_ids': [doc.id],
        'folder_ids': [],
        'destination_folder_id': dest_folder.id
    }, format='json')
    assert res.status_code == status.HTTP_200_OK

    source_folder.refresh_from_db()
    dest_folder.refresh_from_db()
    assert source_folder.updated_at > past_time
    assert dest_folder.updated_at > past_time


@pytest.mark.django_db
def test_ensure_folder_paths_touches_parent_folder_mtime(api_client, user, organization):
    """Test that EnsureFolderPathsView touches parent folder updated_at when folders are created."""
    api_client.force_authenticate(user=user)
    root_folder = Folder.objects.get_root_for_org(organization)
    parent_folder = Folder.objects.create(name="Doc Base", organization=organization, created_by=user, parent=root_folder)
    past_time = timezone.now() - timedelta(days=2)
    Folder.objects.filter(id=parent_folder.id).update(updated_at=past_time)
    parent_folder.refresh_from_db()
    assert parent_folder.updated_at == past_time

    res = api_client.post('/api/v1/folders/ensure-paths/', {
        'paths': ['SubFolder/DeepNested'],
        'parent_path': parent_folder.name,
    }, format='json')
    assert res.status_code == status.HTTP_201_CREATED

    parent_folder.refresh_from_db()
    assert parent_folder.updated_at > past_time


