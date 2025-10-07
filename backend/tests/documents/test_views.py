import pytest
from unittest.mock import patch
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework import status

from core.models import Organization
from documents.models import Document, Folder, ShareLink, DocumentVersion, DocumentPage, PreviewSession, ViewSession, PageView, EmailVerificationToken

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
def test_create_duplicate_root_folder_fails(api_client):
    """Test that creating a folder with a duplicate name at the root level fails."""
    data = {'name': 'Duplicate Folder'}
    response1 = api_client.post('/api/v1/folders/', data)
    assert response1.status_code == status.HTTP_201_CREATED

    response2 = api_client.post('/api/v1/folders/', data)
    assert response2.status_code == status.HTTP_400_BAD_REQUEST
    assert 'non_field_errors' in response2.data
    assert 'already exists' in str(response2.data['non_field_errors'][0])


@pytest.mark.django_db
def test_create_duplicate_subfolder_fails(api_client, user, organization):
    """Test that creating a subfolder with a duplicate name within the same parent fails."""
    # Create a parent folder via API
    parent_data = {'name': 'Parent'}
    parent_response = api_client.post('/api/v1/folders/', parent_data)
    assert parent_response.status_code == status.HTTP_201_CREATED
    parent_id = parent_response.data['id']

    # Create a subfolder
    subfolder_data = {'name': 'Duplicate Subfolder', 'parent': parent_id}
    response1 = api_client.post('/api/v1/folders/', subfolder_data)
    assert response1.status_code == status.HTTP_201_CREATED

    # Attempt to create another subfolder with the same name and parent
    response2 = api_client.post('/api/v1/folders/', subfolder_data)
    assert response2.status_code == status.HTTP_400_BAD_REQUEST
    assert 'non_field_errors' in response2.data
    assert 'already exists' in str(response2.data['non_field_errors'][0])


@pytest.mark.django_db
def test_create_folder_from_path(api_client, user):
    """Test creating a nested folder structure from a path string."""
    # __root__ folder exists
    assert Folder.objects.count() == 1

    path_data = {'path': 'Top/Middle/Bottom'}
    response = api_client.post('/api/v1/folders/from_path/', path_data)

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data['name'] == 'Bottom'
    assert Folder.objects.count() == 4

    bottom = Folder.objects.get(name='Bottom')
    middle = bottom.parent
    top = middle.parent
    root = top.parent

    assert bottom.created_by == user
    assert middle.name == 'Middle'
    assert middle.created_by == user
    assert top.name == 'Top'
    assert top.created_by == user
    assert root.name == '__root__'
    assert root.parent is None


@pytest.mark.django_db
def test_create_folder_from_path_idempotent(api_client, user):
    """Test that calling from_path multiple times has no adverse effect."""
    root_folder = Folder.objects.get(name='__root__', parent=None)
    Folder.objects.create(name="Top", created_by=user, organization=user.organization, parent=root_folder)
    # Total folders: __root__, Top
    assert Folder.objects.count() == 2

    path_data = {'path': 'Top/Middle/Bottom'}
    response1 = api_client.post('/api/v1/folders/from_path/', path_data)
    assert response1.status_code == status.HTTP_201_CREATED
    # Total folders: __root__, Top, Middle, Bottom
    assert Folder.objects.count() == 4

    response2 = api_client.post('/api/v1/folders/from_path/', path_data)
    assert response2.status_code == status.HTTP_201_CREATED
    assert Folder.objects.count() == 4  # No new folders created


@pytest.mark.django_db
def test_create_folder_from_path_permission_denied(api_client, user, user2):
    """Test a user cannot create a subfolder inside another user's folder."""
    root_folder = Folder.objects.get(name='__root__', parent=None, organization=user2.organization)
    # user2 creates a root folder
    Folder.objects.create(
        name="User2's Root",
        organization=user2.organization,
        created_by=user2,
        parent=root_folder
    )
    # Total folders: __root__, User2's Root
    assert Folder.objects.count() == 2

    # user (via api_client) tries to create a nested folder inside user2's folder
    path_data = {'path': "User2's Root/My Subfolder"}
    response = api_client.post('/api/v1/folders/from_path/', path_data)

    assert response.status_code == status.HTTP_403_FORBIDDEN
    # Ensure no new folders were created by 'user'
    assert not Folder.objects.filter(created_by=user).exists()
    # The original folder should still exist, and no new ones created
    assert Folder.objects.count() == 2


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
    path_data = {'path': 'Client Reports/Q4/Final'}
    response = api_client.post('/api/v1/folders/from_path/', path_data)
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
    assert data['numPages'] == 1
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
    assert data['numPages'] == 1
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
        assert len(data['pages']) == 1
        assert data['pages'][0]['url'] == "http://test.com/shared_page.png"
        assert data['linkSettings']['allowDownload'] == share_link.allow_download

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
        assert data['numPages'] == 1
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
