import pytest
from rest_framework import status
from rest_framework.test import APIClient
from django.urls import reverse
from core.models import APIKey, User
from core.authentication import generate_raw_api_key
from datarooms.models import Dataroom, DataroomCollaborator, DataroomDocument
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
def test_read_only_api_key_perm_on_datarooms(user):
    client = _create_client_with_api_key(user, 'read_only')
    dataroom = Dataroom.objects.create(name='Test Room', created_by=user, organization=user.organization)

    # 1. GET -> Allowed (200)
    list_resp = client.get(reverse('dataroom-list'))
    assert list_resp.status_code == status.HTTP_200_OK

    # 2. POST -> Blocked (403)
    create_resp = client.post(reverse('dataroom-list'), {'name': 'New Room'}, format='json')
    assert create_resp.status_code == status.HTTP_403_FORBIDDEN
    assert "read_only" in str(create_resp.data['detail'])

    # 3. DELETE -> Blocked (403)
    delete_resp = client.delete(reverse('dataroom-detail', args=[dataroom.id]))
    assert delete_resp.status_code == status.HTTP_403_FORBIDDEN
    assert "read_only" in str(delete_resp.data['detail'])


@pytest.mark.django_db
def test_read_write_api_key_perm_on_datarooms(user):
    client = _create_client_with_api_key(user, 'read_write')
    dataroom = Dataroom.objects.create(name='Test Room', created_by=user, organization=user.organization)

    # 1. POST -> Allowed (201)
    create_resp = client.post(reverse('dataroom-list'), {'name': 'New Write Room'}, format='json')
    assert create_resp.status_code == status.HTTP_201_CREATED

    # 2. DELETE -> Blocked (403)
    delete_resp = client.delete(reverse('dataroom-detail', args=[dataroom.id]))
    assert delete_resp.status_code == status.HTTP_403_FORBIDDEN
    assert "read_write" in str(delete_resp.data['detail'])


@pytest.mark.django_db
def test_full_access_api_key_perm_on_datarooms(user):
    client = _create_client_with_api_key(user, 'full_access')
    dataroom = Dataroom.objects.create(name='Test Room', created_by=user, organization=user.organization)

    # DELETE -> Allowed (204)
    delete_resp = client.delete(reverse('dataroom-detail', args=[dataroom.id]))
    assert delete_resp.status_code == status.HTTP_204_NO_CONTENT


@pytest.mark.django_db
def test_read_only_api_key_blocked_on_dataroom_full_access_actions(user):
    ro_client = _create_client_with_api_key(user, 'read_only')
    root_folder = Folder.objects.get_root_for_org(user.organization)
    dataroom = Dataroom.objects.create(
        name='ReadOnly Guarded Room',
        created_by=user,
        organization=user.organization,
        storage_version=2,
    )
    doc = Document.objects.create(
        name='ReadOnlyDoc.pdf',
        folder=root_folder,
        created_by=user,
        organization=user.organization,
    )
    DataroomDocument.objects.create(dataroom=dataroom, document=doc, name=doc.name, is_direct_upload=False)

    collab_user = User.objects.create_user(
        username='collab_ro@example.com',
        email='collab_ro@example.com',
        password='password123',
        organization=user.organization,
    )
    DataroomCollaborator.objects.create(dataroom=dataroom, user=collab_user, invited_by=user)

    remove_resp = ro_client.post(
        reverse('dataroom-remove-content', args=[dataroom.id]),
        {'dataroom_document_ids': [str(doc.id)]},
        format='json',
    )
    assert remove_resp.status_code == status.HTTP_403_FORBIDDEN
    assert "read_only" in str(remove_resp.data['detail'])

    remove_collab_post_resp = ro_client.post(
        reverse('dataroom-remove-collaborator', args=[dataroom.id, collab_user.id]),
    )
    assert remove_collab_post_resp.status_code == status.HTTP_403_FORBIDDEN
    assert "read_only" in str(remove_collab_post_resp.data['detail'])

    remove_collab_del_resp = ro_client.delete(
        reverse('dataroom-remove-collaborator', args=[dataroom.id, collab_user.id]),
    )
    assert remove_collab_del_resp.status_code == status.HTTP_403_FORBIDDEN
    assert "read_only" in str(remove_collab_del_resp.data['detail'])

    transfer_resp = ro_client.post(
        reverse('dataroom-transfer-ownership', args=[dataroom.id]),
        {'new_owner_id': str(collab_user.id)},
        format='json',
    )
    assert transfer_resp.status_code == status.HTTP_403_FORBIDDEN
    assert "read_only" in str(transfer_resp.data['detail'])


@pytest.mark.django_db
def test_read_write_api_key_blocked_on_dataroom_full_access_actions(user):
    rw_client = _create_client_with_api_key(user, 'read_write')
    root_folder = Folder.objects.get_root_for_org(user.organization)
    dataroom = Dataroom.objects.create(
        name='Protected Room',
        created_by=user,
        organization=user.organization,
        storage_version=1,
    )
    doc = Document.objects.create(
        name='VaultDoc.pdf',
        folder=root_folder,
        created_by=user,
        organization=user.organization,
    )
    doc2 = Document.objects.create(
        name='AddableDoc.pdf',
        folder=root_folder,
        created_by=user,
        organization=user.organization,
    )
    DataroomDocument.objects.create(dataroom=dataroom, document=doc, name=doc.name, is_direct_upload=False)

    collab_user = User.objects.create_user(
        username='collab_guard@example.com',
        email='collab_guard@example.com',
        password='password123',
        organization=user.organization,
    )
    DataroomCollaborator.objects.create(dataroom=dataroom, user=collab_user, invited_by=user)

    # 1. Non-destructive POST action (add-content) -> Allowed (200)
    add_resp = rw_client.post(
        reverse('dataroom-add-content', args=[dataroom.id]),
        {'document_ids': [str(doc2.id)]},
        format='json',
    )
    assert add_resp.status_code == status.HTTP_200_OK
    assert DataroomDocument.objects.filter(dataroom=dataroom).count() == 2

    # 2. upgrade-storage remains allowed for read_write -> (200)
    upgrade_resp = rw_client.post(reverse('dataroom-upgrade-storage', args=[dataroom.id]))
    assert upgrade_resp.status_code == status.HTTP_200_OK
    dataroom.refresh_from_db()
    assert dataroom.storage_version == 2

    # 3. POST remove-content -> Blocked (403)
    remove_resp = rw_client.post(
        reverse('dataroom-remove-content', args=[dataroom.id]),
        {'dataroom_document_ids': [str(doc.id)]},
        format='json',
    )
    assert remove_resp.status_code == status.HTTP_403_FORBIDDEN
    assert "read_write" in str(remove_resp.data['detail'])
    assert "full_access" in str(remove_resp.data['detail'])
    assert DataroomDocument.objects.filter(dataroom=dataroom, document=doc).exists()

    # 4. POST collaborators/{user_id}/ -> Blocked (403)
    remove_collab_post_resp = rw_client.post(
        reverse('dataroom-remove-collaborator', args=[dataroom.id, collab_user.id]),
    )
    assert remove_collab_post_resp.status_code == status.HTTP_403_FORBIDDEN
    assert "read_write" in str(remove_collab_post_resp.data['detail'])
    assert "full_access" in str(remove_collab_post_resp.data['detail'])
    assert DataroomCollaborator.objects.filter(dataroom=dataroom, user=collab_user).exists()

    # 5. DELETE collaborators/{user_id}/ -> Blocked (403)
    remove_collab_del_resp = rw_client.delete(
        reverse('dataroom-remove-collaborator', args=[dataroom.id, collab_user.id]),
    )
    assert remove_collab_del_resp.status_code == status.HTTP_403_FORBIDDEN
    assert DataroomCollaborator.objects.filter(dataroom=dataroom, user=collab_user).exists()

    # 6. POST transfer-ownership -> Blocked (403)
    transfer_resp = rw_client.post(
        reverse('dataroom-transfer-ownership', args=[dataroom.id]),
        {'new_owner_id': str(collab_user.id)},
        format='json',
    )
    assert transfer_resp.status_code == status.HTTP_403_FORBIDDEN
    assert "read_write" in str(transfer_resp.data['detail'])
    assert "full_access" in str(transfer_resp.data['detail'])
    dataroom.refresh_from_db()
    assert dataroom.created_by == user


@pytest.mark.django_db
def test_full_access_api_key_allowed_on_dataroom_full_access_actions(user):
    full_client = _create_client_with_api_key(user, 'full_access')
    root_folder = Folder.objects.get_root_for_org(user.organization)
    dataroom = Dataroom.objects.create(
        name='Full Room',
        created_by=user,
        organization=user.organization,
        storage_version=2,
    )
    doc = Document.objects.create(
        name='Removable.pdf',
        folder=root_folder,
        created_by=user,
        organization=user.organization,
    )
    DataroomDocument.objects.create(dataroom=dataroom, document=doc, name=doc.name, is_direct_upload=False)

    collab_user = User.objects.create_user(
        username='collab_full@example.com',
        email='collab_full@example.com',
        password='password123',
        organization=user.organization,
    )
    DataroomCollaborator.objects.create(dataroom=dataroom, user=collab_user, invited_by=user)

    new_owner = User.objects.create_user(
        username='new_owner_full@example.com',
        email='new_owner_full@example.com',
        password='password123',
        organization=user.organization,
    )

    remove_resp = full_client.post(
        reverse('dataroom-remove-content', args=[dataroom.id]),
        {'dataroom_document_ids': [str(doc.id)]},
        format='json',
    )
    assert remove_resp.status_code == status.HTTP_204_NO_CONTENT
    assert not DataroomDocument.objects.filter(dataroom=dataroom, document=doc).exists()

    remove_collab_resp = full_client.post(
        reverse('dataroom-remove-collaborator', args=[dataroom.id, collab_user.id]),
    )
    assert remove_collab_resp.status_code == status.HTTP_200_OK
    assert not DataroomCollaborator.objects.filter(dataroom=dataroom, user=collab_user).exists()

    transfer_resp = full_client.post(
        reverse('dataroom-transfer-ownership', args=[dataroom.id]),
        {'new_owner_id': str(new_owner.id)},
        format='json',
    )
    assert transfer_resp.status_code == status.HTTP_200_OK
    dataroom.refresh_from_db()
    assert dataroom.created_by == new_owner
