import pytest
from unittest.mock import patch
from datetime import timedelta
from rest_framework.test import APIClient

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework import status

from core.models import Organization
from documents.models import Document, Folder, ShareLink, DocumentVersion, DocumentPage, PreviewSession, ViewSession, PageView, EmailVerificationToken
from io import BytesIO
try:
    from PIL import Image
except ImportError:
    Image = None

User = get_user_model()




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
def test_delete_folder_success(api_client, user, organization):
    """Test a user can delete their own folder."""
    root_folder = Folder.objects.get(organization=organization, parent=None, name='__root__')
    folder = Folder.objects.create(
        name="To Be Deleted", organization=organization, created_by=user, parent=root_folder
    )
    folder_id = folder.id

    response = api_client.delete(f'/api/v1/folders/{folder.id}/')

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert not Folder.objects.filter(id=folder_id).exists()


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
def test_list_share_links_is_scoped_to_user(api_client, user, user2):
    """Test retrieving a list of share links is scoped to the current user."""
    doc1 = Document.objects.create(organization=user.organization, created_by=user)
    doc2 = Document.objects.create(organization=user.organization, created_by=user2)
    ShareLink.objects.create(document=doc1, created_by=user, name="My Link")
    ShareLink.objects.create(document=doc2, created_by=user2, name="Other's Link")

    response = api_client.get('/api/v1/share-links/')
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]['name'] == "My Link"


@pytest.mark.django_db
def test_upload_document_with_path(api_client, user):
    """Test uploading a file with a path to pre-existing folders."""
    # First, create the folder structure
    path_data = {'paths': ['Client Reports/Q4/Final']}
    response = api_client.post('/api/v1/folders/ensure-paths/', path_data)
    assert response.status_code == status.HTTP_201_CREATED
    assert Folder.objects.filter(created_by=user).count() == 3

    # Now, upload the document into that path
    dummy_file = SimpleUploadedFile("report.docx", b"content", "application/msword")
    response = api_client.post(
        '/api/v1/uploads/document/',
        {'file': dummy_file, 'path': 'Client Reports/Q4/Final/report.docx'},
        format='multipart'
    )

    assert response.status_code == status.HTTP_202_ACCEPTED
    assert Document.objects.count() == 1

    doc = Document.objects.first()
    assert doc.name == 'report.docx'
    assert doc.folder is not None
    assert doc.folder.name == 'Final'
    assert doc.folder.created_by == user
    assert doc.folder.parent.name == 'Q4'
    assert doc.folder.parent.created_by == user
    assert doc.folder.parent.parent.name == 'Client Reports'
    assert doc.folder.parent.parent.created_by == user
    assert doc.folder.parent.parent.parent.name == '__root__'


@pytest.mark.django_db
@override_settings(SITE_DOMAIN="http://test.coneshare.com")
@patch('django.core.files.storage.default_storage.url')
def test_get_document_preview_data_for_image_document(
    mock_storage_url, api_client, image_document_with_content
):
    """
    Verify that preview data for an image document returns the direct URL
    to the image file itself.
    """
    primary_version = image_document_with_content.versions.get(is_primary=True)
    # Mock storage url to return a relative path
    mock_storage_url.return_value = f"/{primary_version.original_storage_key}"

    url = f'/api/v1/documents/{image_document_with_content.id}/preview-data/'
    response = api_client.get(url)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data['id'] == str(image_document_with_content.id)
    assert data['type'] == 'image'
    assert data['num_pages'] == 1
    assert len(data['pages']) == 1

    page_data = data['pages'][0]
    assert page_data['page_number'] == 1
    assert 'url' in page_data

    expected_url = f"http://test.coneshare.com/{primary_version.original_storage_key}"
    assert page_data['url'] == expected_url

    mock_storage_url.assert_called_once_with(primary_version.original_storage_key)


@pytest.mark.django_db
@override_settings(SITE_DOMAIN="http://test.coneshare.com")
@patch('django.core.files.storage.default_storage.url')
def test_get_document_preview_data_success(mock_storage_url, api_client, user):
    """Test successfully retrieving document preview data."""
    # Setup
    mock_storage_url.return_value = "/media/pages/page.png"
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
    DocumentPage.objects.create(
        document_version=version, page_number=1, storage_key="pages/1.png"
    )

    # Action
    response = api_client.get(f'/api/v1/documents/{doc.id}/preview-data/')

    # Assertions
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data['id'] == str(doc.id)
    assert data['name'] == "preview.pdf"
    assert data['num_pages'] == 1
    assert len(data['pages']) == 1
    assert data['pages'][0]['page_number'] == 1
    assert data['pages'][0]['url'] == "http://test.coneshare.com/media/pages/page.png"
    assert mock_storage_url.call_count == 1


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
@patch('django.core.files.storage.default_storage.delete')
def test_delete_document_success(mock_storage_delete, api_client, user):
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
    assert mock_storage_delete.call_count == 2
    mock_storage_delete.assert_any_call("delete_me.pdf")
    mock_storage_delete.assert_any_call("delete_me_page_1.png")


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
class TestShareLinkViewDataView:
    """Tests for the public ShareLinkViewDataView endpoint."""

    @pytest.fixture
    def document_with_pages(self, document):
        """Fixture for a document that has pages."""
        version = document.versions.get(is_primary=True)
        version.has_pages = True
        version.num_pages = 1
        version.save()
        DocumentPage.objects.create(
            document_version=version, page_number=1, storage_key="pages/shared_1.png"
        )
        document.num_pages = 1
        document.save()
        return document

    @patch('django.core.files.storage.default_storage.url')
    def test_get_share_link_data_success(self, mock_storage_url, public_client, share_link, document_with_pages):
        """Test successful retrieval of public share link data."""
        mock_storage_url.return_value = "http://test.com/shared_page.png"
        response = public_client.get(f'/api/v1/links/{share_link.slug}/view-data/')

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data['id'] == str(document_with_pages.id)
        assert data['name'] == document_with_pages.name
        assert data['num_pages'] == 1
        assert len(data['pages']) == 1
        assert data['pages'][0]['url'] == "http://test.com/shared_page.png"
        assert data['link_settings']['allow_download'] == share_link.allow_download

    @override_settings(SITE_DOMAIN="http://test.coneshare.com")
    @patch('django.core.files.storage.default_storage.url')
    def test_get_share_link_data_includes_download_url(self, mock_storage_url, public_client, share_link):
        """Test that the view data includes a correctly constructed download_url."""
        # Setup
        primary_version = share_link.document.versions.get(is_primary=True)
        primary_version.original_storage_key = "path/to/original.pdf"
        primary_version.save()

        # Mock storage url to return a relative path
        mock_storage_url.return_value = "/media/path/to/original.pdf"

        # Action
        response = public_client.get(f'/api/v1/links/{share_link.slug}/view-data/')

        # Assertions
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "download_url" in data
        assert data["download_url"] == "http://test.coneshare.com/media/path/to/original.pdf"

        mock_storage_url.assert_called_once_with("path/to/original.pdf")

    @override_settings(SITE_DOMAIN="http://test.coneshare.com")
    @patch('django.core.files.storage.default_storage.url')
    def test_get_share_link_data_for_image_document(self, mock_storage_url, public_client, image_document_with_content, user):
        """Test successful retrieval of public share link data for an image document."""
        # Setup
        image_share_link = ShareLink.objects.create(
            document=image_document_with_content,
            created_by=user
        )
        primary_version = image_document_with_content.versions.get(is_primary=True)
        # Mock storage url to return a relative path
        mock_storage_url.return_value = f"/{primary_version.original_storage_key}"

        # Action
        response = public_client.get(f'/api/v1/links/{image_share_link.slug}/view-data/')

        # Assertions
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data['id'] == str(image_document_with_content.id)
        assert data['type'] == 'image'
        assert data['num_pages'] == 1
        assert len(data['pages']) == 1

        page_data = data['pages'][0]
        assert page_data['page_number'] == 1

        expected_url = f"http://test.coneshare.com/{primary_version.original_storage_key}"
        assert page_data['url'] == expected_url
        mock_storage_url.assert_called_once_with(primary_version.original_storage_key)

    def test_get_share_link_data_not_found(self, public_client):
        """Test getting a link with a non-existent slug returns 404."""
        response = public_client.get('/api/v1/links/non-existent-slug/view-data/')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_share_link_data_inactive(self, public_client, share_link):
        """Test that an inactive link returns 404."""
        share_link.is_active = False
        share_link.save()
        response = public_client.get(f'/api/v1/links/{share_link.slug}/view-data/')
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.json()["message"] == "This file is not available."

    def test_get_share_link_data_expired(self, public_client, share_link):
        """Test that an expired link returns 410 Gone."""
        share_link.expires_at = timezone.now() - timedelta(days=1)
        share_link.save()
        response = public_client.get(f'/api/v1/links/{share_link.slug}/view-data/')
        assert response.status_code == status.HTTP_410_GONE

    def test_get_share_link_data_password_protected(self, public_client, share_link_with_password):
        """Test that a password-protected link returns 401 Unauthorized."""
        response = public_client.get(f'/api/v1/links/{share_link_with_password.slug}/view-data/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_share_link_data_document_not_ready(self, public_client, share_link, document):
        """Test link for a document that isn't ready returns 400."""
        document.status = 'processing'
        document.save()
        response = public_client.get(f'/api/v1/links/{share_link.slug}/view-data/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestDocumentVersionUploadView:
    """Tests for the DocumentVersionUploadView endpoint."""

    @pytest.fixture
    def document_with_version(self, document):
        """Fixture for a document that has one version."""
        initial_version = document.versions.get(is_primary=True)
        return document, initial_version

    @patch('documents.services.generate_pdf_pages_task.delay')
    def test_upload_new_version_success(self, mock_task_delay, api_client, document_with_version):
        """Test successfully uploading a new version of a document."""
        doc, initial_version = document_with_version
        dummy_file = SimpleUploadedFile("v2.pdf", b"new_content", "application/pdf")

        response = api_client.post(
            f'/api/v1/documents/{doc.id}/versions/',
            {'file': dummy_file},
            format='multipart'
        )

        assert response.status_code == status.HTTP_202_ACCEPTED

        doc.refresh_from_db()
        initial_version.refresh_from_db()

        assert doc.status == 'processing'
        assert doc.versions.count() == 2

        new_version = doc.versions.get(version_number=2)
        assert new_version.is_primary is True
        assert initial_version.is_primary is False

        mock_task_delay.assert_called_once_with(new_version.id)

    @patch('documents.services.generate_pdf_pages_task.delay')
    def test_upload_version_for_other_user_doc_permission_denied(self, mock_task_delay, api_client, user2):
        """Test a user cannot upload a new version to another user's document."""
        doc_by_user2 = Document.objects.create(
            organization=user2.organization,
            created_by=user2,
            name="user2_doc.pdf",
            status='ready'
        )
        DocumentVersion.objects.create(document=doc_by_user2, version_number=1, is_primary=True)

        dummy_file = SimpleUploadedFile("v2.pdf", b"new_content", "application/pdf")

        # api_client (logged in as user) tries to upload a new version
        response = api_client.post(
            f'/api/v1/documents/{doc_by_user2.id}/versions/',
            {'file': dummy_file},
            format='multipart'
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        doc_by_user2.refresh_from_db()
        assert doc_by_user2.versions.count() == 1
        mock_task_delay.assert_not_called()

    def test_upload_version_for_other_org_doc(self, api_client):
        """Test uploading a version for a document in another organization."""
        other_org = Organization.objects.create(name="Other Corp")
        other_user = User.objects.create_user(
            username='other@example.com', organization=other_org
        )
        doc_other_org = Document.objects.create(
            organization=other_org, created_by=other_user
        )
        dummy_file = SimpleUploadedFile("v2.pdf", b"new_content", "application/pdf")

        response = api_client.post(
            f'/api/v1/documents/{doc_other_org.id}/versions/',
            {'file': dummy_file},
            format='multipart'
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_upload_version_for_non_existent_doc(self, api_client):
        """Test uploading a version for a document that does not exist."""
        dummy_file = SimpleUploadedFile("v2.pdf", b"new_content", "application/pdf")
        non_existent_id = 'doc_00000000000000000000000000'
        response = api_client.post(
            f'/api/v1/documents/{non_existent_id}/versions/',
            {'file': dummy_file},
            format='multipart'
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_upload_version_no_file(self, api_client, document_with_version):
        """Test uploading a new version without providing a file."""
        doc, _ = document_with_version
        response = api_client.post(
            f'/api/v1/documents/{doc.id}/versions/',
            {},
            format='multipart'
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestShareLinkPreview:
    """Tests for the Share Link Preview functionality."""

    def test_create_preview_session_for_share_link(self, api_client, share_link):
        """
        Verify that a preview session can be created for a share link.
        """
        url = f'/api/v1/share-links/{share_link.id}/preview/'
        response = api_client.post(url)

        assert response.status_code == status.HTTP_201_CREATED
        assert 'previewToken' in response.data
        assert PreviewSession.objects.filter(share_link=share_link).exists()

    def test_preview_token_bypasses_share_link_security(self, api_client, share_link_with_password, public_client):
        """
        Verify that a valid preview token bypasses share link security (e.g., password)
        and is single-use.
        """
        # 1. Create a preview session as the owner
        url_create = f'/api/v1/share-links/{share_link_with_password.id}/preview/'
        response_create = api_client.post(url_create)
        assert response_create.status_code == status.HTTP_201_CREATED
        token = response_create.data['previewToken']
        assert PreviewSession.objects.count() == 1

        # 2. Use the token to view the data - should succeed and consume the token
        url_view = f'/api/v1/links/{share_link_with_password.slug}/view-data/?previewToken={token}'
        response_view = public_client.get(url_view)

        assert response_view.status_code == status.HTTP_200_OK
        assert response_view.data['id'] == str(share_link_with_password.document.id)
        assert PreviewSession.objects.count() == 0  # Token should be deleted

        # 3. Try to use the token again - should fail (revert to password protection)
        response_view_2 = public_client.get(url_view)
        assert response_view_2.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestShareLinkPasswordProtection:
    """Tests for password-protected share links."""

    def test_view_data_requires_password(self, public_client, share_link_with_password):
        """Accessing data for a password-protected link should fail with 401."""
        url = f'/api/v1/links/{share_link_with_password.slug}/view-data/'
        response = public_client.get(url)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.json()['protectionType'] == 'password'

    def test_verify_password_wrong_password(self, public_client, share_link_with_password):
        """Submitting an incorrect password should fail."""
        url = f'/api/v1/links/{share_link_with_password.slug}/verify-password/'
        response = public_client.post(url, {'password': 'wrong-password'})

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert 'Invalid password' in response.json()['message']

    def test_verify_password_and_view_data_success(self, public_client, share_link_with_password):
        """
        Submitting the correct password should grant access for subsequent requests
        within the same session.
        """
        # Step 1: Verify the password
        verify_url = f'/api/v1/links/{share_link_with_password.slug}/verify-password/'
        response_verify = public_client.post(verify_url, {'password': 'password123'})

        assert response_verify.status_code == status.HTTP_200_OK
        assert 'verified successfully' in response_verify.json()['message']

        # Step 2: Access the data with the authorized session
        view_data_url = f'/api/v1/links/{share_link_with_password.slug}/view-data/'
        response_view = public_client.get(view_data_url)

        assert response_view.status_code == status.HTTP_200_OK
        assert 'id' in response_view.json()
        assert response_view.json()['id'] == str(share_link_with_password.document.id)

    def test_verify_password_for_non_protected_link(self, public_client, share_link):
        """Attempting to verify a password for a non-protected link should fail."""
        url = f'/api/v1/links/{share_link.slug}/verify-password/'
        response = public_client.post(url, {'password': 'any-password'})

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'not password protected' in response.json()['message']

    def test_password_verification_is_rate_limited(self, public_client, share_link_with_password):
        """Test that the password verification endpoint is rate-limited."""
        url = f'/api/v1/links/{share_link_with_password.slug}/verify-password/'
        data = {'password': 'wrong-password'}

        # The rate limit is 10/min.
        for i in range(10):
            response = public_client.post(url, data)
            # The first 10 attempts should be unauthorized but not rate-limited.
            assert response.status_code == status.HTTP_401_UNAUTHORIZED

        # The 11th attempt should be rate-limited.
        response = public_client.post(url, data)
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS


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
class TestRecordPageView:
    def test_record_page_view_success(self, public_client, share_link):
        """Test that a page view is recorded successfully."""
        # 1. Create a View session
        view_session = ViewSession.objects.create(share_link=share_link, duration_seconds=10)
        assert PageView.objects.count() == 0

        # 2. Send tracking data
        data = {
            'view_session': view_session.id,
            'page_number': 1,
            'duration_seconds': 5
        }
        response = public_client.post('/api/v1/page-views/record/', data)

        # 3. Assertions
        assert response.status_code == status.HTTP_200_OK
        assert PageView.objects.count() == 1

        page_view = PageView.objects.first()
        assert page_view.view_session == view_session
        assert page_view.page_number == 1
        assert page_view.duration_seconds == 5

        view_session.refresh_from_db()
        assert view_session.duration_seconds == 15  # 10 + 5

    def test_record_page_view_invalid_view_id(self, public_client):
        """Test that recording a page view with an invalid view ID fails."""
        data = {
            'view_session': '01J4Z7YJ8ZJ4Z7YJ8ZJ4Z7YJ8Z', # A valid but non-existent ULID
            'page_number': 1,
            'duration_seconds': 5
        }
        response = public_client.post('/api/v1/page-views/record/', data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        # It's a validation error because the view does not exist.
        assert 'view_session' in response.data
        assert PageView.objects.count() == 0

    def test_record_page_view_missing_data(self, public_client, share_link):
        """Test that recording a page view with missing data fails."""
        view_session = ViewSession.objects.create(share_link=share_link)
        data = {
            'view_session': view_session.id,
            # 'page_number' is missing
            'duration_seconds': 5
        }
        response = public_client.post('/api/v1/page-views/record/', data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'page_number' in response.data
        assert PageView.objects.count() == 0

    def test_record_page_view_updates_completion_rate(self, public_client, document, share_link):
        """
        Test that recording page views correctly updates the parent ViewSession's
        completion rate.
        """
        # Set the total number of pages on the document
        document.num_pages = 4
        document.save()

        view_session = ViewSession.objects.create(share_link=share_link)
        assert view_session.completion_rate == 0.0

        # View page 1
        public_client.post('/api/v1/page-views/record/', {
            'view_session': view_session.id, 'page_number': 1, 'duration_seconds': 5
        })
        view_session.refresh_from_db()
        assert view_session.completion_rate == 0.25  # 1 of 4 pages viewed

        # View page 2
        public_client.post('/api/v1/page-views/record/', {
            'view_session': view_session.id, 'page_number': 2, 'duration_seconds': 5
        })
        view_session.refresh_from_db()
        assert view_session.completion_rate == 0.50  # 2 of 4 pages viewed

        # View page 1 again (should not increase completion rate)
        public_client.post('/api/v1/page-views/record/', {
            'view_session': view_session.id, 'page_number': 1, 'duration_seconds': 10
        })
        view_session.refresh_from_db()
        assert view_session.completion_rate == 0.50  # Still 2 unique pages viewed

        # View page 4
        public_client.post('/api/v1/page-views/record/', {
            'view_session': view_session.id, 'page_number': 4, 'duration_seconds': 8
        })
        view_session.refresh_from_db()
        assert view_session.completion_rate == 0.75  # 3 of 4 pages viewed


@pytest.mark.django_db
class TestViewSessionViewSet:
    @patch('documents.views.settings.GEOIP')
    def test_create_view_records_ip_and_user_agent(self, mock_geoip, public_client, share_link):
        """Test that creating a view session records the IP, User-Agent, and location."""
        # Mock the GeoIP2 lookup
        mock_city_data = {
            'city': 'Mountain View',
            'country_name': 'United States',
            'latitude': 37.422,
            'longitude': -122.084,
        }
        mock_geoip.city.return_value = mock_city_data
        assert ViewSession.objects.count() == 0

        user_agent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36"

        response = public_client.post(
            '/api/v1/view-sessions/',
            {'share_link': share_link.id},
            HTTP_USER_AGENT=user_agent,
            REMOTE_ADDR='98.137.11.155'  # Example public IP for Yahoo
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert ViewSession.objects.count() == 1

        view_session = ViewSession.objects.first()
        assert view_session.share_link == share_link
        assert view_session.ip_address == '98.137.11.155'
        assert view_session.user_agent == user_agent
        assert view_session.city == 'Mountain View'
        assert view_session.country == 'United States'
        assert view_session.latitude == 37.422
        assert view_session.longitude == -122.084

    def test_record_download(self, public_client, share_link):
        """Test that a download can be recorded for a view session."""
        # 1. Create a View session
        view_session = ViewSession.objects.create(share_link=share_link)
        assert view_session.downloaded_at is None

        # 2. Record the download
        url = f'/api/v1/view-sessions/{view_session.id}/record-download/'
        response = public_client.post(url)
        assert response.status_code == status.HTTP_200_OK

        # 3. Verify the timestamp is set
        view_session.refresh_from_db()
        assert view_session.downloaded_at is not None
        first_download_time = view_session.downloaded_at

        # 4. Try to record again - timestamp should not change
        response_2 = public_client.post(url)
        assert response_2.status_code == status.HTTP_200_OK
        view_session.refresh_from_db()
        assert view_session.downloaded_at == first_download_time

    def test_record_download_for_non_existent_session(self, public_client):
        """Test that recording a download for a non-existent session returns 404."""
        non_existent_id = '01J4Z7YJ8ZJ4Z7YJ8ZJ4Z7YJ8Z'
        url = f'/api/v1/view-sessions/{non_existent_id}/record-download/'
        response = public_client.post(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestShareLinkEmailProtection:
    """Tests for email-protected share links."""

    def test_view_data_requires_email(self, public_client, share_link_requires_email):
        """Accessing data for an email-protected link should fail with 401."""
        url = f'/api/v1/links/{share_link_requires_email.slug}/view-data/'
        response = public_client.get(url)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        assert response.json()['protectionType'] == 'email'

    def test_request_access_for_non_protected_link(self, public_client, share_link):
        """Attempting to request access for a non-protected link should fail."""
        url = f'/api/v1/links/{share_link.slug}/request-access/'
        response = public_client.post(url, {'email': 'viewer@example.com'})

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'does not require an email' in response.json()['message']

    def test_request_access_no_verification_success(self, public_client, share_link_requires_email):
        """
        Requesting access for a link that requires email (but not verification)
        should grant access immediately.
        """
        # Step 1: Request access
        request_url = f'/api/v1/links/{share_link_requires_email.slug}/request-access/'
        response_request = public_client.post(request_url, {'email': 'viewer@example.com'})

        assert response_request.status_code == status.HTTP_200_OK
        assert response_request.json()['verification_required'] is False

        # Step 2: Access the data with the authorized session
        view_data_url = f'/api/v1/links/{share_link_requires_email.slug}/view-data/'
        response_view = public_client.get(view_data_url)

        assert response_view.status_code == status.HTTP_200_OK
        assert 'id' in response_view.json()

    @patch('documents.views.send_mail')
    def test_request_access_with_verification_success(self, mock_send_mail, public_client, share_link_requires_email_verification):
        """
        Requesting access for a link that requires email verification should
        trigger an email and not grant immediate access.
        """
        request_url = f'/api/v1/links/{share_link_requires_email_verification.slug}/request-access/'
        response_request = public_client.post(request_url, {'email': 'viewer@example.com'})

        assert response_request.status_code == status.HTTP_200_OK
        assert response_request.json()['verification_required'] is True
        
        # Check that an email was sent and a token was created
        mock_send_mail.assert_called_once()
        assert EmailVerificationToken.objects.count() == 1
        
        # Check that immediate access is not granted
        view_data_url = f'/api/v1/links/{share_link_requires_email_verification.slug}/view-data/'
        response_view = public_client.get(view_data_url)
        assert response_view.status_code == status.HTTP_401_UNAUTHORIZED

    def test_view_data_with_valid_access_token(self, public_client, share_link_requires_email_verification):
        """
        Using a valid access token from an email magic link should grant access.
        """
        # Step 1: Create a token manually (as if an email was sent)
        token = EmailVerificationToken.objects.create(
            share_link=share_link_requires_email_verification,
            email='viewer@example.com'
        )
        assert EmailVerificationToken.objects.count() == 1

        # Step 2: Access the data with the token
        view_data_url = f'/api/v1/links/{share_link_requires_email_verification.slug}/view-data/?accessToken={token.token}'
        response_view = public_client.get(view_data_url)

        assert response_view.status_code == status.HTTP_200_OK
        assert 'id' in response_view.json()
        
        # Step 3: Verify the token was single-use and deleted
        assert EmailVerificationToken.objects.count() == 0

        # Step 4: Subsequent access without the token should be allowed due to session
        response_view_2 = public_client.get(f'/api/v1/links/{share_link_requires_email_verification.slug}/view-data/')
        assert response_view_2.status_code == status.HTTP_200_OK

    def test_view_data_with_expired_access_token(self, public_client, share_link_requires_email_verification):
        """An expired access token should not grant access."""
        # Create an expired token
        expired_time = timezone.now() - timedelta(minutes=30)
        token = EmailVerificationToken.objects.create(
            share_link=share_link_requires_email_verification,
            email='viewer@example.com',
            expires_at=expired_time
        )

        view_data_url = f'/api/v1/links/{share_link_requires_email_verification.slug}/view-data/?accessToken={token.token}'
        response_view = public_client.get(view_data_url)

        assert response_view.status_code == status.HTTP_401_UNAUTHORIZED
        assert 'protectionType' in response_view.json()
        assert response_view.json()['protectionType'] == 'email'


@pytest.mark.django_db
class TestOwnerPreviewFlag:

    def test_owner_preview_is_flagged_in_view_sessions(self, api_client, public_client, user, document):
        """
        Verify that a view session created from an owner's preview is correctly
        flagged as 'is_owner_view' in the analytics.
        """
        # 1. User (owner) creates a share link.
        share_link = ShareLink.objects.create(document=document, created_by=user)

        # 2. User creates a preview session for the link.
        preview_url = f'/api/v1/share-links/{share_link.id}/preview/'
        response_preview = api_client.post(preview_url)
        assert response_preview.status_code == status.HTTP_201_CREATED
        preview_token = response_preview.data['previewToken']

        # 3. User "views" the document using the preview token with the public client.
        # This simulates a browser session that will be used to create the view.
        view_data_url = f'/api/v1/links/{share_link.slug}/view-data/?previewToken={preview_token}'
        response_view_data = public_client.get(view_data_url)
        assert response_view_data.status_code == status.HTTP_200_OK

        # 4. The frontend would then create a ViewSession. We simulate this.
        # The public_client now has the 'preview_owner_email' in its session.
        response_create_view = public_client.post(
            '/api/v1/view-sessions/',
            {'share_link': share_link.id}
        )
        assert response_create_view.status_code == status.HTTP_201_CREATED
        view_session = ViewSession.objects.get(id=response_create_view.data['id'])
        assert view_session.viewer_email == user.email

        # 5. As the authenticated owner, fetch the view sessions for the document.
        sessions_url = f'/api/v1/documents/{document.id}/view-sessions/'
        response_sessions = api_client.get(sessions_url)
        assert response_sessions.status_code == status.HTTP_200_OK

        # 6. Verify the 'is_owner_view' flag is true.
        results = response_sessions.json()['results']
        assert len(results) == 1
        assert results[0]['is_owner_view'] is True
        assert results[0]['viewer_email'] == user.email

    def test_non_owner_view_is_not_flagged(self, api_client, public_client, user, document):
        """
        Verify that a view session from a regular viewer is not flagged as 'is_owner_view'.
        """
        # 1. User (owner) creates a share link that requires email.
        share_link = ShareLink.objects.create(
            document=document,
            created_by=user,
            requires_email=True,
            requires_email_verification=False  # for simplicity
        )

        # 2. A different person requests access to the link.
        viewer_email = "random.viewer@example.com"
        request_access_url = f'/api/v1/links/{share_link.slug}/request-access/'
        response_access = public_client.post(request_access_url, {'email': viewer_email})
        assert response_access.status_code == status.HTTP_200_OK

        # 3. Frontend creates a ViewSession with the now-authorized public_client.
        response_create_view = public_client.post(
            '/api/v1/view-sessions/',
            {'share_link': share_link.id}
        )
        assert response_create_view.status_code == status.HTTP_201_CREATED

        # 4. As the authenticated owner, fetch the view sessions.
        sessions_url = f'/api/v1/documents/{document.id}/view-sessions/'
        response_sessions = api_client.get(sessions_url)
        assert response_sessions.status_code == status.HTTP_200_OK

        # 5. Verify the 'is_owner_view' flag is false for this external viewer.
        results = response_sessions.json()['results']
        assert len(results) == 1
        assert results[0]['is_owner_view'] is False
        assert results[0]['viewer_email'] == viewer_email


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
class TestWatermarkingViews:
    """Tests for the dynamic watermarking endpoints."""

    @pytest.fixture
    def document_with_page(self, document):
        """Fixture for a document that has one page."""
        version = document.versions.get(is_primary=True)
        version.has_pages = True
        version.num_pages = 1
        version.original_storage_key = "path/to/original.pdf"
        version.save()
        DocumentPage.objects.create(
            document_version=version, page_number=1, storage_key="pages/page_1.png"
        )
        document.num_pages = 1
        document.type = 'pdf'
        document.save()
        return document

    @pytest.fixture
    def watermarked_link(self, share_link_with_watermark, document_with_page):
        """Connects the watermarked link to the document with a page."""
        share_link_with_watermark.document = document_with_page
        share_link_with_watermark.save()
        return share_link_with_watermark

    @patch('django.core.files.storage.default_storage.open')
    def test_render_watermarked_page_success(self, mock_storage_open, public_client, watermarked_link):
        """Test that a watermarked page image is rendered successfully."""
        # Create a dummy image in memory to be returned by storage
        img = Image.new('RGB', (100, 100), color='white')
        buffer = BytesIO()
        img.save(buffer, 'JPEG')
        buffer.seek(0)
        mock_storage_open.return_value = buffer

        url = f'/api/v1/links/{watermarked_link.slug}/render-page/1/'
        response = public_client.get(url, REMOTE_ADDR='192.168.1.1')

        assert response.status_code == status.HTTP_200_OK
        assert response.get('Content-Type') == 'image/jpeg'

        # Verify the mock was called correctly
        page = DocumentPage.objects.get(page_number=1)
        mock_storage_open.assert_called_once_with(page.storage_key, 'rb')

    @patch('django.core.files.storage.default_storage.open')
    def test_download_watermarked_file_success(self, mock_storage_open, public_client, watermarked_link):
        """Test that a watermarked PDF file is generated and served for download."""
        # Create a dummy PDF in memory. A simple bytestring is enough for pypdf to read.
        pdf_content = b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000059 00000 n \n0000000112 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF'
        pdf_buffer = BytesIO(pdf_content)
        mock_storage_open.return_value = pdf_buffer
        
        url = f'/api/v1/links/{watermarked_link.slug}/download/'
        response = public_client.get(url, REMOTE_ADDR='192.168.1.1')
        
        assert response.status_code == status.HTTP_200_OK
        assert response.get('Content-Type') == 'application/pdf'
        assert 'attachment; filename=' in response.get('Content-Disposition')
        
        # Check that the file content is a PDF and is larger than the original (due to watermark)
        assert response.content.startswith(b'%PDF-')
        assert len(response.content) > len(pdf_content)

        # Verify the mock was called correctly
        version = watermarked_link.document.versions.get(is_primary=True)
        mock_storage_open.assert_called_once_with(version.original_storage_key, 'rb')

    def test_download_watermarked_file_not_allowed(self, public_client, watermarked_link):
        """Test that downloading is forbidden if allow_download is false."""
        watermarked_link.allow_download = False
        watermarked_link.save()

        url = f'/api/v1/links/{watermarked_link.slug}/download/'
        response = public_client.get(url)

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_render_page_for_link_without_watermark_fails(self, public_client, share_link):
        """Test that the render endpoint fails if watermarking is not enabled."""
        url = f'/api/v1/links/{share_link.slug}/render-page/1/'
        response = public_client.get(url)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'Watermarking is not enabled' in response.data['message']

    @patch('django.core.files.storage.default_storage.open')
    def test_render_watermarked_page_returns_caching_headers(self, mock_storage_open, public_client, watermarked_link):
        """Test that the initial response for a watermarked page includes ETag and Cache-Control headers."""
        img = Image.new('RGB', (100, 100), color='white')
        buffer = BytesIO()
        img.save(buffer, 'JPEG')
        buffer.seek(0)
        mock_storage_open.return_value = buffer

        url = f'/api/v1/links/{watermarked_link.slug}/render-page/1/'
        response = public_client.get(url, REMOTE_ADDR='192.168.1.1')

        assert response.status_code == status.HTTP_200_OK
        assert 'ETag' in response
        assert response['ETag'] is not None
        assert 'Cache-Control' in response
        assert response['Cache-Control'] == 'public, max-age=60, must-revalidate'

    @patch('django.core.files.storage.default_storage.open')
    def test_render_watermarked_page_with_etag_returns_304(self, mock_storage_open, public_client, watermarked_link):
        """Test that sending a valid ETag in If-None-Match returns a 304 Not Modified."""
        img = Image.new('RGB', (100, 100), color='white')
        buffer = BytesIO()
        img.save(buffer, 'JPEG')
        buffer.seek(0)
        mock_storage_open.return_value = buffer

        # First request to get the ETag
        url = f'/api/v1/links/{watermarked_link.slug}/render-page/1/'
        response1 = public_client.get(url, REMOTE_ADDR='192.168.1.1')
        assert response1.status_code == status.HTTP_200_OK
        etag = response1['ETag']

        # Second request with the ETag
        response2 = public_client.get(url, REMOTE_ADDR='192.168.1.1', HTTP_IF_NONE_MATCH=etag)
        assert response2.status_code == status.HTTP_304_NOT_MODIFIED

        # Ensure the storage was only accessed once
        mock_storage_open.assert_called_once()

    @patch('django.core.files.storage.default_storage.open')
    def test_render_watermarked_page_with_changed_link_returns_200(self, mock_storage_open, public_client, watermarked_link):
        """
        Test that ETag validation fails and returns a new 200 response if the
        link's watermark text has changed.
        """
        def create_mock_image_file(*args, **kwargs):
            img = Image.new('RGB', (100, 100), color='white')
            buffer = BytesIO()
            img.save(buffer, 'JPEG')
            buffer.seek(0)
            return buffer
        mock_storage_open.side_effect = create_mock_image_file

        # First request to get the ETag
        url = f'/api/v1/links/{watermarked_link.slug}/render-page/1/'
        response1 = public_client.get(url, REMOTE_ADDR='192.168.1.1')
        assert response1.status_code == status.HTTP_200_OK
        etag1 = response1['ETag']

        # Change the watermark text, which should invalidate the ETag
        watermarked_link.watermark_text = "New Watermark"
        watermarked_link.save()

        # Second request with the old ETag
        response2 = public_client.get(url, REMOTE_ADDR='192.168.1.1', HTTP_IF_NONE_MATCH=etag1)
        assert response2.status_code == status.HTTP_200_OK
        etag2 = response2['ETag']

        assert etag1 != etag2
        # Ensure storage was accessed twice (once for each render)
        assert mock_storage_open.call_count == 2

    @patch('django.core.files.storage.default_storage.open')
    def test_render_watermarked_page_etag_varies_by_email(self, mock_storage_open, public_client, watermarked_link):
        """
        Test that the ETag for a watermarked page is different for different
        viewers when the {{email}} variable is used.
        """
        watermarked_link.requires_email = True
        watermarked_link.watermark_text = "Viewed by {{email}}"
        watermarked_link.save()

        def create_mock_image_file(*args, **kwargs):
            img = Image.new('RGB', (100, 100), color='white')
            buffer = BytesIO()
            img.save(buffer, 'JPEG')
            buffer.seek(0)
            return buffer
        mock_storage_open.side_effect = create_mock_image_file

        # --- Viewer 1 ---
        # Authorize viewer 1
        request_url = f'/api/v1/links/{watermarked_link.slug}/request-access/'
        public_client.post(request_url, {'email': 'viewer1@example.com'})

        # Get ETag for viewer 1
        render_url = f'/api/v1/links/{watermarked_link.slug}/render-page/1/'
        response1 = public_client.get(render_url, REMOTE_ADDR='192.168.1.1')
        assert response1.status_code == status.HTTP_200_OK
        etag1 = response1['ETag']

        # --- Viewer 2 ---
        # Use a new client to simulate a new viewer with a clean session
        client2 = APIClient()
        request_url = f'/api/v1/links/{watermarked_link.slug}/request-access/'
        client2.post(request_url, {'email': 'viewer2@example.com'})

        # Get ETag for viewer 2
        response2 = client2.get(render_url, REMOTE_ADDR='192.168.1.1')
        assert response2.status_code == status.HTTP_200_OK
        etag2 = response2['ETag']
        
        assert etag1 is not None
        assert etag2 is not None
        assert etag1 != etag2
