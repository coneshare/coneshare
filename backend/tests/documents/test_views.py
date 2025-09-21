import pytest
from unittest.mock import patch
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework import status

from core.models import Organization
from documents.models import Document, Folder, ShareLink, DocumentVersion, DocumentPage

User = get_user_model()


@pytest.fixture
def user2(db, organization):
    """Fixture to create a second user in the same organization."""
    return User.objects.create_user(
        username='user2@example.com',
        email='user2@example.com',
        password='password123',
        organization=organization,
        role='member'
    )


@pytest.mark.django_db
def test_list_folders(api_client, user, user2, organization):
    """Test retrieving a list of folders is scoped to the user and only returns root folders."""
    root_folder = Folder.objects.create(
        name="My Root Folder", organization=organization, created_by=user
    )
    Folder.objects.create(
        name="My Subfolder", organization=organization, created_by=user, parent=root_folder
    )
    Folder.objects.create(
        name="Other's Folder", organization=organization, created_by=user2
    )
    response = api_client.get('/api/v1/folders/')
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]['name'] == "My Root Folder"


@pytest.mark.django_db
def test_create_folder(api_client, user, organization):
    """Test creating a new folder."""
    data = {'name': 'New API Folder'}
    response = api_client.post('/api/v1/folders/', data)
    assert response.status_code == status.HTTP_201_CREATED
    assert response.data['name'] == 'New API Folder'
    assert Folder.objects.count() == 1
    folder = Folder.objects.get()
    assert folder.organization == organization
    assert folder.created_by == user


@pytest.mark.django_db
def test_create_folder_from_path(api_client, user):
    """Test creating a nested folder structure from a path string."""
    path_data = {'path': 'Top/Middle/Bottom'}
    response = api_client.post('/api/v1/folders/from_path/', path_data)

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data['name'] == 'Bottom'
    assert Folder.objects.count() == 3

    bottom = Folder.objects.get(name='Bottom')
    middle = bottom.parent
    top = middle.parent

    assert bottom.created_by == user
    assert middle.name == 'Middle'
    assert middle.created_by == user
    assert top.name == 'Top'
    assert top.created_by == user
    assert top.parent is None


@pytest.mark.django_db
def test_create_folder_from_path_idempotent(api_client, user):
    """Test that calling from_path multiple times has no adverse effect."""
    Folder.objects.create(name="Top", created_by=user, organization=user.organization)

    path_data = {'path': 'Top/Middle/Bottom'}
    response1 = api_client.post('/api/v1/folders/from_path/', path_data)
    assert response1.status_code == status.HTTP_201_CREATED
    assert Folder.objects.count() == 3

    response2 = api_client.post('/api/v1/folders/from_path/', path_data)
    assert response2.status_code == status.HTTP_201_CREATED
    assert Folder.objects.count() == 3  # No new folders created


@pytest.mark.django_db
def test_create_folder_from_path_permission_denied(api_client, user, user2):
    """Test a user cannot create a subfolder inside another user's folder."""
    # user2 creates a root folder
    Folder.objects.create(
        name="User2's Root",
        organization=user2.organization,
        created_by=user2
    )

    # user (via api_client) tries to create a nested folder inside user2's folder
    path_data = {'path': "User2's Root/My Subfolder"}
    response = api_client.post('/api/v1/folders/from_path/', path_data)

    assert response.status_code == status.HTTP_403_FORBIDDEN
    # Ensure no new folders were created by 'user'
    assert not Folder.objects.filter(created_by=user).exists()
    # The original folder should still exist
    assert Folder.objects.count() == 1


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
    assert Folder.objects.count() == 3

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
    assert doc.folder.parent.parent.parent is None


@pytest.mark.django_db
@patch('django.core.files.storage.default_storage.url')
def test_get_document_preview_data_success(mock_storage_url, api_client, user):
    """Test successfully retrieving document preview data."""
    # Setup
    mock_storage_url.return_value = "http://test.com/page.png"
    doc = Document.objects.create(
        organization=user.organization,
        created_by=user,
        name="preview.pdf",
        status='ready'
    )
    version = DocumentVersion.objects.create(
        document=doc,
        version_number=1,
        is_primary=True,
        has_pages=True,
        num_pages=2
    )
    DocumentPage.objects.create(
        document_version=version, page_number=1, storage_key="pages/1.png"
    )
    DocumentPage.objects.create(
        document_version=version, page_number=2, storage_key="pages/2.png"
    )

    # Action
    response = api_client.get(f'/api/v1/documents/{doc.id}/preview-data/')

    # Assertions
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data['id'] == str(doc.id)
    assert data['name'] == "preview.pdf"
    assert data['numPages'] == 2
    assert len(data['pages']) == 2
    assert data['pages'][0]['page_number'] == 1
    assert data['pages'][0]['url'] == "http://test.com/page.png"
    assert mock_storage_url.call_count == 2


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

    @pytest.fixture(autouse=True)
    def setup(self, user):
        """Set up the necessary objects for the tests."""
        self.doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="shared_doc.pdf",
            status='ready'
        )
        version = DocumentVersion.objects.create(
            document=self.doc,
            version_number=1,
            is_primary=True,
            has_pages=True,
            num_pages=1
        )
        DocumentPage.objects.create(
            document_version=version, page_number=1, storage_key="pages/shared_1.png"
        )
        self.link = ShareLink.objects.create(
            document=self.doc,
            created_by=user,
            name="Public Link"
        )

    @patch('django.core.files.storage.default_storage.url')
    def test_get_share_link_data_success(self, mock_storage_url, public_client):
        """Test successful retrieval of public share link data."""
        mock_storage_url.return_value = "http://test.com/shared_page.png"
        response = public_client.get(f'/api/v1/links/{self.link.slug}/view-data/')

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data['id'] == str(self.doc.id)
        assert data['name'] == "shared_doc.pdf"
        assert len(data['pages']) == 1
        assert data['pages'][0]['url'] == "http://test.com/shared_page.png"
        assert data['linkSettings']['allowDownload'] == self.link.allow_download

    def test_get_share_link_data_not_found(self, public_client):
        """Test getting a link with a non-existent slug returns 404."""
        response = public_client.get('/api/v1/links/non-existent-slug/view-data/')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_share_link_data_archived(self, public_client):
        """Test that an archived link returns 404."""
        self.link.is_archived = True
        self.link.save()
        response = public_client.get(f'/api/v1/links/{self.link.slug}/view-data/')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_share_link_data_expired(self, public_client):
        """Test that an expired link returns 410 Gone."""
        self.link.expires_at = timezone.now() - timedelta(days=1)
        self.link.save()
        response = public_client.get(f'/api/v1/links/{self.link.slug}/view-data/')
        assert response.status_code == status.HTTP_410_GONE

    def test_get_share_link_data_password_protected(self, public_client):
        """Test that a password-protected link returns 401 Unauthorized."""
        self.link.password_hash = "some_hash"
        self.link.save()
        response = public_client.get(f'/api/v1/links/{self.link.slug}/view-data/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_share_link_data_document_not_ready(self, public_client):
        """Test link for a document that isn't ready returns 400."""
        self.doc.status = 'processing'
        self.doc.save()
        response = public_client.get(f'/api/v1/links/{self.link.slug}/view-data/')
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestDocumentVersionUploadView:
    """Tests for the DocumentVersionUploadView endpoint."""

    @pytest.fixture(autouse=True)
    def setup(self, user):
        """Set up a document with one version."""
        self.doc = Document.objects.create(
            organization=user.organization,
            created_by=user,
            name="initial_doc.pdf",
            status='ready'
        )
        self.initial_version = DocumentVersion.objects.create(
            document=self.doc,
            version_number=1,
            is_primary=True
        )

    @patch('documents.services.generate_pdf_pages_task.delay')
    def test_upload_new_version_success(self, mock_task_delay, api_client):
        """Test successfully uploading a new version of a document."""
        dummy_file = SimpleUploadedFile("v2.pdf", b"new_content", "application/pdf")

        response = api_client.post(
            f'/api/v1/documents/{self.doc.id}/versions/',
            {'file': dummy_file},
            format='multipart'
        )

        assert response.status_code == status.HTTP_202_ACCEPTED

        self.doc.refresh_from_db()
        self.initial_version.refresh_from_db()

        assert self.doc.status == 'processing'
        assert self.doc.versions.count() == 2

        new_version = self.doc.versions.get(version_number=2)
        assert new_version.is_primary is True
        assert self.initial_version.is_primary is False

        mock_task_delay.assert_called_once_with(new_version.id)

    @patch('documents.services.generate_pdf_pages_task.delay')
    def test_upload_version_for_other_user_doc_same_org(self, mock_task_delay, api_client, user2):
        """Test a user can upload a version to another user's doc in the same org."""
        doc_by_user2 = Document.objects.create(
            organization=user2.organization,
            created_by=user2,
            name="user2_doc.pdf",
            status='ready'
        )
        DocumentVersion.objects.create(document=doc_by_user2, version_number=1, is_primary=True)

        dummy_file = SimpleUploadedFile("v2.pdf", b"new_content", "application/pdf")

        response = api_client.post(
            f'/api/v1/documents/{doc_by_user2.id}/versions/',
            {'file': dummy_file},
            format='multipart'
        )

        assert response.status_code == status.HTTP_202_ACCEPTED
        doc_by_user2.refresh_from_db()
        assert doc_by_user2.versions.count() == 2
        mock_task_delay.assert_called_once()

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

    def test_upload_version_no_file(self, api_client):
        """Test uploading a new version without providing a file."""
        response = api_client.post(
            f'/api/v1/documents/{self.doc.id}/versions/',
            {},
            format='multipart'
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
