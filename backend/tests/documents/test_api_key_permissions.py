import pytest
from rest_framework import status
from rest_framework.test import APIClient
from django.urls import reverse
from core.models import APIKey
from core.authentication import generate_raw_api_key
from documents.models import Document, Folder


def _create_client_with_api_key(user, tier):
    raw_key, prefix, hashed_key = generate_raw_api_key()
    APIKey.objects.create(
        user=user,
        name=f'{tier} Key',
        prefix=prefix,
        hashed_key=hashed_key,
        tier=tier,
    )
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {raw_key}')
    return client


@pytest.mark.django_db
def test_read_only_api_key_perm_on_documents(user):
    client = _create_client_with_api_key(user, 'read_only')
    root_folder = Folder.objects.get_root_for_org(user.organization)
    doc = Document.objects.create(
        name='Test Doc.pdf',
        folder=root_folder,
        created_by=user,
        organization=user.organization
    )

    # 1. GET -> Allowed (200)
    list_resp = client.get(reverse('document-list'))
    assert list_resp.status_code == status.HTTP_200_OK

    # 2. POST (upload request) -> Blocked (403)
    upload_resp = client.post(reverse('document-upload-request'), {'file_name': 'New.pdf', 'file_size': 100}, format='json')
    assert upload_resp.status_code == status.HTTP_403_FORBIDDEN
    assert "read_only" in str(upload_resp.data['detail'])

    # 3. DELETE -> Blocked (403)
    delete_resp = client.delete(reverse('document-detail', args=[doc.id]))
    assert delete_resp.status_code == status.HTTP_403_FORBIDDEN
    assert "read_only" in str(delete_resp.data['detail'])


@pytest.mark.django_db
def test_read_write_api_key_perm_on_documents(user):
    client = _create_client_with_api_key(user, 'read_write')
    root_folder = Folder.objects.get_root_for_org(user.organization)
    doc = Document.objects.create(
        name='Test Doc.pdf',
        folder=root_folder,
        created_by=user,
        organization=user.organization
    )

    # 1. POST (upload request) -> Allowed (200)
    upload_resp = client.post(reverse('document-upload-request'), {'file_name': 'New.pdf', 'file_size': 100}, format='json')
    assert upload_resp.status_code == status.HTTP_200_OK

    # 2. DELETE -> Blocked (403)
    delete_resp = client.delete(reverse('document-detail', args=[doc.id]))
    assert delete_resp.status_code == status.HTTP_403_FORBIDDEN
    assert "read_write" in str(delete_resp.data['detail'])


@pytest.mark.django_db
def test_full_access_api_key_perm_on_documents(user):
    client = _create_client_with_api_key(user, 'full_access')
    root_folder = Folder.objects.get_root_for_org(user.organization)
    doc = Document.objects.create(
        name='Test Doc.pdf',
        folder=root_folder,
        created_by=user,
        organization=user.organization
    )

    # DELETE -> Allowed (204)
    delete_resp = client.delete(reverse('document-detail', args=[doc.id]))
    assert delete_resp.status_code == status.HTTP_204_NO_CONTENT


@pytest.mark.django_db
def test_read_only_api_key_perm_on_folders(user):
    client = _create_client_with_api_key(user, 'read_only')
    root_folder = Folder.objects.get_root_for_org(user.organization)
    folder = Folder.objects.create(name='SubFolder', parent=root_folder, created_by=user, organization=user.organization)

    # 1. GET -> Allowed (200)
    list_resp = client.get(reverse('folder-list'))
    assert list_resp.status_code == status.HTTP_200_OK

    # 2. POST (create folder) -> Blocked (403)
    create_resp = client.post(reverse('folder-list'), {'name': 'New Sub', 'parent': root_folder.id}, format='json')
    assert create_resp.status_code == status.HTTP_403_FORBIDDEN
    assert "read_only" in str(create_resp.data['detail'])

    # 3. DELETE -> Blocked (403)
    delete_resp = client.delete(reverse('folder-detail', args=[folder.id]))
    assert delete_resp.status_code == status.HTTP_403_FORBIDDEN
    assert "read_only" in str(delete_resp.data['detail'])
