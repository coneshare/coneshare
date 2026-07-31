import pytest
from rest_framework import status
from rest_framework.test import APIClient
from django.urls import reverse
from core.models import APIKey
from core.authentication import generate_raw_api_key
from sharelinks.models import ShareLink
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
def test_read_only_api_key_perm_on_sharelinks(user):
    client = _create_client_with_api_key(user, 'read_only')
    root_folder = Folder.objects.get_root_for_org(user.organization)
    doc = Document.objects.create(name='Doc.pdf', folder=root_folder, created_by=user, organization=user.organization)
    link = ShareLink.objects.create(document=doc, created_by=user)

    # 1. GET -> Allowed (200)
    list_resp = client.get(reverse('sharelink-list'))
    assert list_resp.status_code == status.HTTP_200_OK

    # 2. POST (create link) -> Blocked (403)
    create_resp = client.post(reverse('sharelink-list'), {'document': doc.id, 'name': 'Test Link'}, format='json')
    assert create_resp.status_code == status.HTTP_403_FORBIDDEN
    assert "read_only" in str(create_resp.data['detail'])

    # 3. DELETE -> Blocked (403)
    delete_resp = client.delete(reverse('sharelink-detail', args=[link.id]))
    assert delete_resp.status_code == status.HTTP_403_FORBIDDEN
    assert "read_only" in str(delete_resp.data['detail'])


@pytest.mark.django_db
def test_read_write_api_key_perm_on_sharelinks(user):
    client = _create_client_with_api_key(user, 'read_write')
    root_folder = Folder.objects.get_root_for_org(user.organization)
    doc = Document.objects.create(name='Doc.pdf', folder=root_folder, created_by=user, organization=user.organization)
    link = ShareLink.objects.create(document=doc, created_by=user)

    # 1. POST (create link) -> Allowed (201)
    create_resp = client.post(reverse('sharelink-list'), {'document': doc.id, 'name': 'New Write Link'}, format='json')
    assert create_resp.status_code == status.HTTP_201_CREATED

    # 2. DELETE -> Blocked (403)
    delete_resp = client.delete(reverse('sharelink-detail', args=[link.id]))
    assert delete_resp.status_code == status.HTTP_403_FORBIDDEN
    assert "read_write" in str(delete_resp.data['detail'])


@pytest.mark.django_db
def test_full_access_api_key_perm_on_sharelinks(user):
    client = _create_client_with_api_key(user, 'full_access')
    root_folder = Folder.objects.get_root_for_org(user.organization)
    doc = Document.objects.create(name='Doc.pdf', folder=root_folder, created_by=user, organization=user.organization)
    link = ShareLink.objects.create(document=doc, created_by=user)

    # DELETE -> Allowed (204)
    delete_resp = client.delete(reverse('sharelink-detail', args=[link.id]))
    assert delete_resp.status_code == status.HTTP_204_NO_CONTENT


@pytest.mark.django_db
def test_public_sharelink_views_accessible_without_api_key(user):
    root_folder = Folder.objects.get_root_for_org(user.organization)
    doc = Document.objects.create(name='Doc.pdf', folder=root_folder, created_by=user, organization=user.organization)
    link = ShareLink.objects.create(document=doc, created_by=user)

    anon_client = APIClient()
    public_resp = anon_client.get(reverse('share-link-public-meta', args=[link.slug]))
    assert public_resp.status_code == status.HTTP_200_OK
