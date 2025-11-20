import pytest
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.exceptions import APIException

from core.models import Organization
from documents.models import (Document, DocumentPage, DocumentVersion, Folder)
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

    def test_ensure_paths_permission_denied(self, api_client, user2):
        """Test a user cannot create a subfolder inside another user's folder."""
        root = Folder.objects.get(name='__root__', parent=None, organization=user2.organization)
        user2_folder = Folder.objects.create(name="User2s-Folder", organization=user2.organization, created_by=user2, parent=root)
        assert Folder.objects.count() == 2

        path_data = {'paths': ["User2s-Folder/My-Stuff"]}
        response = api_client.post('/api/v1/folders/ensure-paths/', path_data)

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert Folder.objects.count() == 2  # No new folders created

    def test_ensure_paths_is_atomic(self, api_client, user, user2):
        """Test that if one path fails, the whole transaction is rolled back."""
        root = Folder.objects.get(name='__root__', parent=None, organization=user2.organization)
        user2_folder = Folder.objects.create(name="User2s-Folder", organization=user2.organization, created_by=user2, parent=root)
        assert Folder.objects.count() == 2

        path_data = {'paths': ["Good-Folder/Sub", "User2s-Folder/My-Stuff"]}
        response = api_client.post('/api/v1/folders/ensure-paths/', path_data)

        assert response.status_code == status.HTTP_403_FORBIDDEN
        # Ensure no folders were created at all
        assert Folder.objects.count() == 2
        assert not Folder.objects.filter(created_by=user).exists()

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
def test_delete_folder_updates_user_size_and_deletes_contents(mock_fs_delete, api_client, user, organization):
    """
    Test that deleting a folder correctly updates the user's total document
    size and deletes all nested documents, folders, and associated files.
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

    # Check that everything is deleted from the DB
    assert not Folder.objects.filter(id=folder_to_delete.id).exists()
    assert not Folder.objects.filter(id=subfolder.id).exists()
    assert not Document.objects.filter(id__in=[doc1.id, doc2.id]).exists()

    # Check user size is updated
    user.refresh_from_db()
    assert user.total_document_size == 0

    # Check that file deletion was called for all associated files
    assert mock_fs_delete.call_count == 3
    mock_fs_delete.assert_any_call("doc1.pdf")
    mock_fs_delete.assert_any_call("doc1_page1.png")
    mock_fs_delete.assert_any_call("doc2.pdf")


@pytest.mark.django_db
@patch('documents.services.fileserver_client.delete_file')
def test_delete_folder_file_server_error_returns_500(mock_fs_delete, api_client, user, organization):
    """
    Test that if the file server fails during folder deletion, the view returns
    a 500 error, but the database changes are still committed.
    """
    mock_fs_delete.side_effect = APIException("File server error")

    root_folder = Folder.objects.get_root_for_org(organization)
    folder = Folder.objects.create(name="Folder", organization=organization, created_by=user, parent=root_folder)
    doc = Document.objects.create(name="Doc.pdf", organization=organization, created_by=user, folder=folder, file_size=100)
    DocumentVersion.objects.create(document=doc, version_number=1, original_storage_key="doc.pdf")

    user.total_document_size = 100
    user.save()

    response = api_client.delete(f'/api/v1/folders/{folder.id}/')

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

    # Per current implementation, DB changes are committed before file deletion.
    assert not Folder.objects.filter(id=folder.id).exists()
    user.refresh_from_db()
    assert user.total_document_size == 0


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
    request_data = {'file_name': 'report.docx', 'path': 'Client Reports/Q4/Final/report.docx'}
    request_response = api_client.post('/api/v1/uploads/document/request/', request_data)
    assert request_response.status_code == status.HTTP_200_OK
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

    mock_fs_download_url.assert_called_once_with(primary_version.original_storage_key, is_internal=False)


@pytest.mark.django_db
@override_settings(SITE_DOMAIN="http://test.coneshare.com")
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
    assert "still processing" in response.json()['detail']


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
def test_delete_document_success(mock_fs_delete, api_client, user):
    """Test that a user can successfully delete their own document."""
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
    assert not Document.objects.filter(id=doc.id).exists()
    
    # Check that file cleanup was triggered
    assert mock_fs_delete.call_count == 2
    mock_fs_delete.assert_any_call("delete_me.pdf")
    mock_fs_delete.assert_any_call("delete_me_page_1.png")


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
def test_delete_document_in_subfolder_success(api_client, user, organization):
    """
    Test that a user can delete their document via its ID, even if it's in a subfolder.
    This reproduces a bug where the lookup for destroy actions was incorrectly
    scoped to the root folder.
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
    assert not Document.objects.filter(id=doc.id).exists()


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
        request_response = api_client.post(request_url, {'file_name': 'v2.pdf'})
        assert request_response.status_code == status.HTTP_200_OK
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

        assert doc.status == 'processing'
        assert doc.versions.count() == 2

        new_version = doc.versions.get(version_number=2)
        assert new_version.is_primary is True
        assert initial_version.is_primary is False

        mock_task_delay.assert_called_once_with(new_version.id)

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
            'storage_key': 'key1',
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

        # 3. Delete the document
        api_client.delete(f'/api/v1/documents/{doc.id}/')
        user.refresh_from_db()
        assert user.total_document_size == 0

    @override_settings(FILE_SIZE_QUOTA_MB=1)
    @patch('documents.views.fileserver_client.generate_upload_url')
    def test_upload_request_respects_quota(self, mock_fs_upload_url, api_client, user):
        """Test that the document upload request endpoint rejects uploads that exceed the quota."""
        # Quota is 1MB. User has 0 usage.

        # This should fail (2MB > 1MB)
        request_data_fail = {'file_name': 'large.pdf', 'file_size': 2 * 1024 * 1024}
        response_fail = api_client.post('/api/v1/uploads/document/request/', request_data_fail)
        assert response_fail.status_code == status.HTTP_400_BAD_REQUEST
        assert "exceed your storage quota" in response_fail.data['detail']

        # This should succeed (0.5MB < 1MB)
        request_data_ok = {'file_name': 'small.pdf', 'file_size': 512 * 1024}
        response_ok = api_client.post('/api/v1/uploads/document/request/', request_data_ok)
        assert response_ok.status_code == status.HTTP_200_OK

    @override_settings(FILE_SIZE_QUOTA_MB=2)
    @patch('documents.views.fileserver_client.generate_upload_url')
    def test_version_upload_request_respects_quota(self, mock_fs_upload_url, api_client, user, document_factory):
        """
        Test that the version upload request endpoint correctly calculates
        potential usage against the quota.
        """
        # Quota is 2MB.
        # 1. Create an initial document of 1.5MB.
        doc_size = int(1.5 * 1024 * 1024)
        doc = document_factory(name="doc1.pdf", file_size=doc_size)
        user.total_document_size = doc_size
        user.save()

        # 2. Try to upload a new version of 1MB.
        # Potential usage: 1.5MB (current) + 1MB (new) - 1.5MB (old) = 1MB.
        # 1MB < 2MB, so this should succeed.
        request_data_ok = {'file_name': 'v2_ok.pdf', 'file_size': 1 * 1024 * 1024}
        request_url = f'/api/v1/uploads/document/{doc.id}/versions/request/'
        response_ok = api_client.post(request_url, request_data_ok)
        assert response_ok.status_code == status.HTTP_200_OK

        # 3. Try to upload a new version of 3MB.
        # Potential usage: 1.5MB (current) + 3MB (new) - 1.5MB (old) = 3MB.
        # 3MB > 2MB, so this should fail.
        request_data_fail = {'file_name': 'v2_fail.pdf', 'file_size': 3 * 1024 * 1024}
        response_fail = api_client.post(request_url, request_data_fail)
        assert response_fail.status_code == status.HTTP_400_BAD_REQUEST
        assert "exceed your storage quota" in response_fail.data['detail']
