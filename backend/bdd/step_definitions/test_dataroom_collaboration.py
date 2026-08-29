import pytest
from pytest_bdd import parsers, scenario, given, when, then
from rest_framework import status
from rest_framework.test import APIClient

from core.models import User
from datarooms.models import Dataroom, DataroomCollaborator, DataroomFolder
from sharelinks.models import ShareLink

pytest_plugins = "bdd.step_definitions.common_steps"


# Scenarios
@pytest.mark.django_db
@scenario('../features/dataroom_collaboration.feature', 'Dataroom owner invites an internal collaborator')
def test_owner_invites_collaborator():
    pass


@pytest.mark.django_db
@scenario('../features/dataroom_collaboration.feature', 'Collaborator creates a folder and views dataroom content')
def test_collaborator_creates_folder():
    pass


@pytest.mark.django_db
@scenario('../features/dataroom_collaboration.feature', 'Collaborator creates a share link for the co-managed dataroom')
def test_collaborator_creates_share_link():
    pass


@pytest.mark.django_db
@scenario('../features/dataroom_collaboration.feature', "Collaborator cannot edit or delete another member's share link")
def test_collaborator_cannot_edit_other_share_link():
    pass


@pytest.mark.django_db
@scenario('../features/dataroom_collaboration.feature', 'Dataroom owner transfers ownership to a collaborator')
def test_owner_transfers_ownership():
    pass


@pytest.mark.django_db
@scenario('../features/dataroom_collaboration.feature', 'Collaborator leaves a co-managed dataroom')
def test_collaborator_leaves():
    pass


@pytest.mark.django_db
@scenario('../features/dataroom_collaboration.feature', 'Collaborator cannot delete the co-managed dataroom')
def test_collaborator_cannot_delete_dataroom():
    pass


# Step Definitions
@given(parsers.parse('a team member "{email}" exists in my organization'), target_fixture="collab_user")
def collab_user(user_context, email):
    owner = user_context['user']
    user, _ = User.objects.get_or_create(
        email=email,
        defaults={
            'username': email,
            'organization': owner.organization,
            'name': 'Collab Member'
        }
    )
    user.set_password('password123')
    user.save()
    user_context['collab_user'] = user
    return user


@given(parsers.parse('I have a dataroom named "{name}"'), target_fixture="dataroom")
def dataroom(user_context, name):
    owner = user_context['user']
    room, _ = Dataroom.objects.get_or_create(
        name=name,
        organization=owner.organization,
        defaults={'created_by': owner}
    )
    user_context['dataroom'] = room
    return room


@given(parsers.parse('"{email}" is a collaborator in "{dataroom_name}"'))
def add_collab_precondition(user_context, email, dataroom_name):
    collab = user_context['collab_user']
    room = user_context['dataroom']
    DataroomCollaborator.objects.get_or_create(
        dataroom=room,
        user=collab,
        defaults={'invited_by': user_context['user']}
    )


@given(parsers.parse('I have created a share link named "{link_name}" for "{dataroom_name}"'), target_fixture="owner_link")
def owner_share_link(user_context, link_name, dataroom_name):
    room = user_context['dataroom']
    owner = user_context['user']
    link = ShareLink.objects.create(
        dataroom=room,
        created_by=owner,
        name=link_name
    )
    user_context['owner_link'] = link
    return link


@when(parsers.parse('I invite "{email}" as a collaborator to "{dataroom_name}"'))
def invite_collaborator(user_context, email, dataroom_name):
    api_client = user_context['api_client']
    room = user_context['dataroom']
    target_user = user_context['collab_user']

    response = api_client.post(
        f'/api/v1/datarooms/{room.id}/collaborators/',
        {'user_ids': [str(target_user.id)]},
        format='json'
    )
    assert response.status_code == status.HTTP_201_CREATED
    user_context['last_response'] = response


@then(parsers.parse('"{email}" should be in the collaborators list for "{dataroom_name}"'))
def verify_collaborator_in_list(user_context, email, dataroom_name):
    api_client = user_context['api_client']
    room = user_context['dataroom']
    response = api_client.get(f'/api/v1/datarooms/{room.id}/collaborators/')
    assert response.status_code == status.HTTP_200_OK

    collab_emails = [c['user']['email'] for c in response.data['collaborators']]
    assert email in collab_emails


@then(parsers.parse('"{dataroom_name}" should appear in "{email}"\'s accessible datarooms'))
def verify_accessible_to_collab(user_context, email, dataroom_name):
    collab = user_context['collab_user']
    collab_client = APIClient()
    collab_client.force_authenticate(user=collab)

    response = collab_client.get('/api/v1/datarooms/')
    assert response.status_code == status.HTTP_200_OK
    names = [d['name'] for d in response.data]
    assert dataroom_name in names


@when(parsers.parse('"{email}" creates a folder named "{folder_name}" in "{dataroom_name}"'))
def collab_creates_folder(user_context, email, folder_name, dataroom_name):
    collab = user_context['collab_user']
    room = user_context['dataroom']
    collab_client = APIClient()
    collab_client.force_authenticate(user=collab)

    response = collab_client.post(
        '/api/v1/dataroom-folders/',
        {'name': folder_name, 'dataroom': str(room.id)},
        format='json'
    )
    assert response.status_code == status.HTTP_201_CREATED
    user_context['created_folder_id'] = response.data['id']


@then(parsers.parse('the folder "{folder_name}" should exist inside "{dataroom_name}"'))
def verify_folder_exists(user_context, folder_name, dataroom_name):
    room = user_context['dataroom']
    assert DataroomFolder.objects.filter(dataroom=room, name=folder_name).exists()


@then(parsers.parse('the folder "{folder_name}" should be visible to both the owner and "{email}"'))
def verify_folder_visibility(user_context, folder_name, email):
    room = user_context['dataroom']
    owner_client = user_context['api_client']
    collab_client = APIClient()
    collab_client.force_authenticate(user=user_context['collab_user'])

    # Owner retrieve
    r1 = owner_client.get(f'/api/v1/datarooms/{room.id}/')
    assert r1.status_code == status.HTTP_200_OK
    folder_names_owner = [item['name'] for item in r1.data.get('items', []) if item.get('type') == 'folder']
    assert folder_name in folder_names_owner

    # Collab retrieve
    r2 = collab_client.get(f'/api/v1/datarooms/{room.id}/')
    assert r2.status_code == status.HTTP_200_OK
    folder_names_collab = [item['name'] for item in r2.data.get('items', []) if item.get('type') == 'folder']
    assert folder_name in folder_names_collab


@when(parsers.parse('"{email}" creates a share link named "{link_name}" for "{dataroom_name}"'))
def collab_creates_share_link(user_context, email, link_name, dataroom_name):
    collab = user_context['collab_user']
    room = user_context['dataroom']
    collab_client = APIClient()
    collab_client.force_authenticate(user=collab)

    response = collab_client.post(
        '/api/v1/share-links/',
        {'dataroom': str(room.id), 'name': link_name},
        format='json'
    )
    assert response.status_code == status.HTTP_201_CREATED
    user_context['collab_link_id'] = response.data['id']


@then(parsers.parse('the share link "{link_name}" should exist'))
def verify_share_link_exists(user_context, link_name):
    room = user_context['dataroom']
    assert ShareLink.objects.filter(dataroom=room, name=link_name).exists()


@then(parsers.parse('both the owner and "{email}" should see "{link_name}" in the dataroom share links'))
def verify_share_links_visible(user_context, email, link_name):
    room = user_context['dataroom']
    owner_client = user_context['api_client']
    collab_client = APIClient()
    collab_client.force_authenticate(user=user_context['collab_user'])

    r1 = owner_client.get(f'/api/v1/share-links/?dataroom_id={room.id}')
    assert r1.status_code == status.HTTP_200_OK
    names1 = [l['name'] for l in r1.data]
    assert link_name in names1

    r2 = collab_client.get(f'/api/v1/share-links/?dataroom_id={room.id}')
    assert r2.status_code == status.HTTP_200_OK
    names2 = [l['name'] for l in r2.data]
    assert link_name in names2


@when(parsers.parse('"{email}" attempts to rename share link "{link_name}"'))
def collab_attempts_rename_link(user_context, email, link_name):
    owner_link = user_context['owner_link']
    collab_client = APIClient()
    collab_client.force_authenticate(user=user_context['collab_user'])

    response = collab_client.patch(
        f'/api/v1/share-links/{owner_link.id}/',
        {'name': 'Renamed by Collab'},
        format='json'
    )
    user_context['rename_response'] = response


@then('the rename request should be forbidden')
def verify_rename_forbidden(user_context):
    assert user_context['rename_response'].status_code == status.HTTP_403_FORBIDDEN


@when(parsers.parse('"{email}" attempts to delete share link "{link_name}"'))
def collab_attempts_delete_link(user_context, email, link_name):
    owner_link = user_context['owner_link']
    collab_client = APIClient()
    collab_client.force_authenticate(user=user_context['collab_user'])

    response = collab_client.delete(f'/api/v1/share-links/{owner_link.id}/')
    user_context['delete_response'] = response


@then('the delete request should be forbidden')
def verify_delete_forbidden(user_context):
    assert user_context['delete_response'].status_code == status.HTTP_403_FORBIDDEN


@when(parsers.parse('I transfer ownership of "{dataroom_name}" to "{email}"'))
def transfer_ownership_action(user_context, dataroom_name, email):
    room = user_context['dataroom']
    collab = user_context['collab_user']
    owner_client = user_context['api_client']

    response = owner_client.post(
        f'/api/v1/datarooms/{room.id}/transfer-ownership/',
        {'new_owner_id': str(collab.id)},
        format='json'
    )
    assert response.status_code == status.HTTP_200_OK


@then(parsers.parse('"{email}" should be the owner of "{dataroom_name}"'))
def verify_new_owner(user_context, email, dataroom_name):
    room = user_context['dataroom']
    room.refresh_from_db()
    assert room.created_by == user_context['collab_user']


@then(parsers.parse('I should be listed as a collaborator in "{dataroom_name}"'))
def verify_old_owner_is_collaborator(user_context, dataroom_name):
    room = user_context['dataroom']
    owner = user_context['user']
    assert DataroomCollaborator.objects.filter(dataroom=room, user=owner).exists()


@when(parsers.parse('"{email}" removes themselves from "{dataroom_name}"'))
def collab_leaves_dataroom(user_context, email, dataroom_name):
    room = user_context['dataroom']
    collab = user_context['collab_user']
    collab_client = APIClient()
    collab_client.force_authenticate(user=collab)

    response = collab_client.delete(f'/api/v1/datarooms/{room.id}/collaborators/{collab.id}/')
    assert response.status_code == status.HTTP_200_OK


@then(parsers.parse('"{email}" should no longer be a collaborator in "{dataroom_name}"'))
def verify_collab_removed(user_context, email, dataroom_name):
    room = user_context['dataroom']
    collab = user_context['collab_user']
    assert not DataroomCollaborator.objects.filter(dataroom=room, user=collab).exists()


@then(parsers.parse('"{dataroom_name}" should not appear in "{email}"\'s accessible datarooms'))
def verify_dataroom_not_accessible(user_context, email, dataroom_name):
    collab = user_context['collab_user']
    collab_client = APIClient()
    collab_client.force_authenticate(user=collab)

    response = collab_client.get('/api/v1/datarooms/')
    assert response.status_code == status.HTTP_200_OK
    names = [d['name'] for d in response.data]
    assert dataroom_name not in names


@when(parsers.parse('"{email}" attempts to delete dataroom "{dataroom_name}"'))
def collab_attempts_delete_dataroom(user_context, email, dataroom_name):
    room = user_context['dataroom']
    collab = user_context['collab_user']
    collab_client = APIClient()
    collab_client.force_authenticate(user=collab)

    response = collab_client.delete(f'/api/v1/datarooms/{room.id}/')
    user_context['dataroom_delete_response'] = response


@then('the dataroom delete request should be forbidden')
def verify_dataroom_delete_forbidden(user_context):
    assert user_context['dataroom_delete_response'].status_code == status.HTTP_403_FORBIDDEN


@then(parsers.parse('the dataroom "{dataroom_name}" should still exist'))
def verify_dataroom_still_exists(user_context, dataroom_name):
    room = user_context['dataroom']
    assert Dataroom.objects.filter(id=room.id).exists()
