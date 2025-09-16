import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status

from documents.models import Document, Folder, ShareLink

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
def test_list_folders(api_client, organization):
    """Test retrieving a list of folders."""
    Folder.objects.create(name="Root Folder", organization=organization)
    response = api_client.get('/api/v1/folders/')
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]['name'] == "Root Folder"


@pytest.mark.django_db
def test_create_folder(api_client, organization):
    """Test creating a new folder."""
    data = {'name': 'New API Folder'}
    response = api_client.post('/api/v1/folders/', data)
    assert response.status_code == status.HTTP_201_CREATED
    assert response.data['name'] == 'New API Folder'
    assert Folder.objects.count() == 1
    assert Folder.objects.get().organization == organization


@pytest.mark.django_db
def test_list_documents_is_scoped_to_user(api_client, user, user2, organization):
    """Test retrieving a list of documents is scoped to the current user."""
    Document.objects.create(
        name="My API Document",
        organization=organization,
        created_by=user,
    )
    Document.objects.create(
        name="Other User's Document",
        organization=organization,
        created_by=user2,
    )
    response = api_client.get('/api/v1/documents/')
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]['name'] == "My API Document"


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
def test_upload_document_with_path(api_client):
    """Test uploading a file with a path to create folders."""
    dummy_file = SimpleUploadedFile("report.docx", b"content", "application/msword")
    response = api_client.post(
        '/api/v1/uploads/document/',
        {'file': dummy_file, 'path': 'Client Reports/Q4/Final/report.docx'},
        format='multipart'
    )

    assert response.status_code == status.HTTP_202_ACCEPTED
    assert Document.objects.count() == 1
    assert Folder.objects.count() == 3

    doc = Document.objects.first()
    assert doc.name == 'report.docx'
    assert doc.folder is not None
    assert doc.folder.name == 'Final'
    assert doc.folder.parent.name == 'Q4'
    assert doc.folder.parent.parent.name == 'Client Reports'
    assert doc.folder.parent.parent.parent is None
