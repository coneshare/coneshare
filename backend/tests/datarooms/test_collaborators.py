import pytest
from rest_framework import status

from core.models import User, Organization
from datarooms.models import Dataroom, DataroomCollaborator, DataroomFolder, DataroomDocument
from sharelinks.models import ShareLink

pytestmark = pytest.mark.django_db


class TestDataroomCollaborators:
    def test_list_collaborators(self, api_client, dataroom, user, organization):
        collab_user = User.objects.create_user(
            email="collab@test.com", username="collab@test.com", password="password", organization=organization, name="Collab User"
        )
        DataroomCollaborator.objects.create(
            dataroom=dataroom, user=collab_user, invited_by=user, role=DataroomCollaborator.ROLE_COLLABORATOR
        )

        response = api_client.get(f'/api/v1/datarooms/{dataroom.id}/collaborators/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['owner']['id'] == str(user.id)
        assert response.data['total_count'] == 1
        assert len(response.data['collaborators']) == 1
        assert response.data['collaborators'][0]['user']['email'] == "collab@test.com"

    def test_add_collaborators_by_user_ids(self, api_client, dataroom, organization):
        collab1 = User.objects.create_user(email="c1@test.com", username="c1@test.com", password="password", organization=organization)
        collab2 = User.objects.create_user(email="c2@test.com", username="c2@test.com", password="password", organization=organization)

        payload = {"user_ids": [str(collab1.id), str(collab2.id)]}
        response = api_client.post(f'/api/v1/datarooms/{dataroom.id}/collaborators/', payload, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert DataroomCollaborator.objects.filter(dataroom=dataroom).count() == 2
        assert len(response.data['collaborators']) == 2

    def test_add_collaborator_by_email(self, api_client, dataroom, organization):
        collab = User.objects.create_user(email="by_email@test.com", username="by_email@test.com", password="password", organization=organization)

        payload = {"email": "by_email@test.com"}
        response = api_client.post(f'/api/v1/datarooms/{dataroom.id}/collaborators/', payload, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert DataroomCollaborator.objects.filter(dataroom=dataroom, user=collab).exists()

    def test_add_collaborator_from_other_org_fails(self, api_client, dataroom):
        other_org = Organization.objects.create(name="Other Org")
        foreign_user = User.objects.create_user(email="foreign@other.com", username="foreign@other.com", password="password", organization=other_org)

        payload = {"user_ids": [str(foreign_user.id)]}
        response = api_client.post(f'/api/v1/datarooms/{dataroom.id}/collaborators/', payload, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_add_owner_as_collaborator_fails(self, api_client, dataroom, user):
        payload = {"user_ids": [str(user.id)]}
        response = api_client.post(f'/api/v1/datarooms/{dataroom.id}/collaborators/', payload, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_collaborator_cannot_add_other_collaborators(self, api_client, dataroom, user, organization):
        collab_user = User.objects.create_user(email="collab1@test.com", username="collab1@test.com", password="password", organization=organization)
        target_user = User.objects.create_user(email="target@test.com", username="target@test.com", password="password", organization=organization)
        DataroomCollaborator.objects.create(dataroom=dataroom, user=collab_user, invited_by=user)

        api_client.force_authenticate(user=collab_user)
        response = api_client.post(f'/api/v1/datarooms/{dataroom.id}/collaborators/', {"user_ids": [str(target_user.id)]}, format='json')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_org_admin_can_add_collaborator_to_any_dataroom(self, api_client, dataroom, organization):
        admin_user = User.objects.create_user(email="admin@test.com", username="admin@test.com", password="password", organization=organization, role='admin')
        target_user = User.objects.create_user(email="target@test.com", username="target@test.com", password="password", organization=organization)

        api_client.force_authenticate(user=admin_user)
        response = api_client.post(f'/api/v1/datarooms/{dataroom.id}/collaborators/', {"user_ids": [str(target_user.id)]}, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert DataroomCollaborator.objects.filter(dataroom=dataroom, user=target_user).exists()

    def test_remove_collaborator_as_owner(self, api_client, dataroom, user, organization):
        collab_user = User.objects.create_user(email="collab@test.com", username="collab@test.com", password="password", organization=organization)
        DataroomCollaborator.objects.create(dataroom=dataroom, user=collab_user, invited_by=user)

        api_client.force_authenticate(user=user)
        response = api_client.delete(f'/api/v1/datarooms/{dataroom.id}/collaborators/{collab_user.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert not DataroomCollaborator.objects.filter(dataroom=dataroom, user=collab_user).exists()

    def test_collaborator_can_leave_dataroom(self, api_client, dataroom, user, organization):
        collab_user = User.objects.create_user(email="collab@test.com", username="collab@test.com", password="password", organization=organization)
        DataroomCollaborator.objects.create(dataroom=dataroom, user=collab_user, invited_by=user)

        api_client.force_authenticate(user=collab_user)
        response = api_client.delete(f'/api/v1/datarooms/{dataroom.id}/collaborators/{collab_user.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert not DataroomCollaborator.objects.filter(dataroom=dataroom, user=collab_user).exists()

    def test_collaborator_cannot_remove_peer_collaborator(self, api_client, dataroom, user, organization):
        collab1 = User.objects.create_user(email="c1@test.com", username="c1@test.com", password="password", organization=organization)
        collab2 = User.objects.create_user(email="c2@test.com", username="c2@test.com", password="password", organization=organization)
        DataroomCollaborator.objects.create(dataroom=dataroom, user=collab1, invited_by=user)
        DataroomCollaborator.objects.create(dataroom=dataroom, user=collab2, invited_by=user)

        api_client.force_authenticate(user=collab1)
        response = api_client.delete(f'/api/v1/datarooms/{dataroom.id}/collaborators/{collab2.id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert DataroomCollaborator.objects.filter(dataroom=dataroom, user=collab2).exists()

    def test_transfer_ownership_success(self, api_client, dataroom, user, organization):
        collab_user = User.objects.create_user(email="new_owner@test.com", username="new_owner@test.com", password="password", organization=organization)
        DataroomCollaborator.objects.create(dataroom=dataroom, user=collab_user, invited_by=user)

        api_client.force_authenticate(user=user)
        response = api_client.post(f'/api/v1/datarooms/{dataroom.id}/transfer-ownership/', {"new_owner_id": str(collab_user.id)}, format='json')
        assert response.status_code == status.HTTP_200_OK

        dataroom.refresh_from_db()
        assert dataroom.created_by == collab_user
        # The previous owner is now a collaborator
        assert DataroomCollaborator.objects.filter(dataroom=dataroom, user=user).exists()
        # The new owner is no longer in collaborators table
        assert not DataroomCollaborator.objects.filter(dataroom=dataroom, user=collab_user).exists()

    def test_transfer_ownership_permission_denied_for_collaborator(self, api_client, dataroom, user, organization):
        collab1 = User.objects.create_user(email="c1@test.com", username="c1@test.com", password="password", organization=organization)
        collab2 = User.objects.create_user(email="c2@test.com", username="c2@test.com", password="password", organization=organization)
        DataroomCollaborator.objects.create(dataroom=dataroom, user=collab1, invited_by=user)

        api_client.force_authenticate(user=collab1)
        response = api_client.post(f'/api/v1/datarooms/{dataroom.id}/transfer-ownership/', {"new_owner_id": str(collab2.id)}, format='json')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_eligible_collaborators_list_and_search(self, api_client, dataroom, user, organization):
        u1 = User.objects.create_user(email="alice@test.com", username="alice@test.com", password="password", organization=organization, name="Alice Walker")
        u2 = User.objects.create_user(email="bob@test.com", username="bob@test.com", password="password", organization=organization, name="Bob Smith")
        collab = User.objects.create_user(email="charlie@test.com", username="charlie@test.com", password="password", organization=organization, name="Charlie Brown")
        DataroomCollaborator.objects.create(dataroom=dataroom, user=collab, invited_by=user)

        api_client.force_authenticate(user=user)
        # List all eligible (should contain Alice and Bob, exclude owner and Charlie)
        response = api_client.get(f'/api/v1/datarooms/{dataroom.id}/eligible-collaborators/')
        assert response.status_code == status.HTTP_200_OK
        emails = [u['email'] for u in response.data]
        assert "alice@test.com" in emails
        assert "bob@test.com" in emails
        assert "charlie@test.com" not in emails
        assert user.email not in emails

        # Search query
        response = api_client.get(f'/api/v1/datarooms/{dataroom.id}/eligible-collaborators/?q=Alice')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['email'] == "alice@test.com"

    def test_collaborator_can_view_and_manage_dataroom(self, api_client, dataroom, user, organization):
        collab_user = User.objects.create_user(email="collab@test.com", username="collab@test.com", password="password", organization=organization)
        DataroomCollaborator.objects.create(dataroom=dataroom, user=collab_user, invited_by=user)

        api_client.force_authenticate(user=collab_user)

        # List datarooms (should see shared dataroom)
        response = api_client.get('/api/v1/datarooms/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['id'] == str(dataroom.id)
        assert response.data[0]['current_user_role'] == 'collaborator'

        # Retrieve detail
        response = api_client.get(f'/api/v1/datarooms/{dataroom.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['current_user_role'] == 'collaborator'

        # Create folder as collaborator
        response = api_client.post('/api/v1/dataroom-folders/', {
            'name': 'Collaborator Folder',
            'dataroom': str(dataroom.id)
        }, format='json')
        assert response.status_code == status.HTTP_201_CREATED

        # Collaborator cannot delete dataroom
        del_response = api_client.delete(f'/api/v1/datarooms/{dataroom.id}/')
        assert del_response.status_code == status.HTTP_403_FORBIDDEN
        assert Dataroom.objects.filter(id=dataroom.id).exists()

    def test_scope_filters_on_dataroom_list(self, api_client, user, organization):
        other_user = User.objects.create_user(email="other@test.com", username="other@test.com", password="password", organization=organization)
        owned_room = Dataroom.objects.create(name="Owned Room", organization=organization, created_by=user)
        shared_room = Dataroom.objects.create(name="Shared Room", organization=organization, created_by=other_user)
        DataroomCollaborator.objects.create(dataroom=shared_room, user=user, invited_by=other_user)

        api_client.force_authenticate(user=user)

        # Scope: created_by_me
        r1 = api_client.get('/api/v1/datarooms/?scope=created_by_me')
        assert len(r1.data) == 1
        assert r1.data[0]['name'] == "Owned Room"

        # Scope: shared_with_me
        r2 = api_client.get('/api/v1/datarooms/?scope=shared_with_me')
        assert len(r2.data) == 1
        assert r2.data[0]['name'] == "Shared Room"

        # All accessible
        r3 = api_client.get('/api/v1/datarooms/')
        assert len(r3.data) == 2

    def test_collaborator_share_link_co_management(self, api_client, dataroom, user, organization):
        collab1 = User.objects.create_user(email="c1@test.com", username="c1@test.com", password="password", organization=organization)
        collab2 = User.objects.create_user(email="c2@test.com", username="c2@test.com", password="password", organization=organization)
        DataroomCollaborator.objects.create(dataroom=dataroom, user=collab1, invited_by=user)
        DataroomCollaborator.objects.create(dataroom=dataroom, user=collab2, invited_by=user)

        # Collab 1 creates a share link for the dataroom
        api_client.force_authenticate(user=collab1)
        res = api_client.post('/api/v1/share-links/', {
            'dataroom': str(dataroom.id),
            'name': 'Collab1 Link',
        }, format='json')
        assert res.status_code == status.HTTP_201_CREATED
        link1_id = res.data['id']

        # Collab 2 can view all share links for this dataroom
        api_client.force_authenticate(user=collab2)
        res_list = api_client.get(f'/api/v1/share-links/?dataroom_id={dataroom.id}')
        assert res_list.status_code == status.HTTP_200_OK
        assert len(res_list.data) == 1
        assert res_list.data[0]['id'] == link1_id

        # Collab 2 cannot edit or delete Collab 1's share link
        res_edit = api_client.patch(f'/api/v1/share-links/{link1_id}/', {'name': 'Hacked Name'}, format='json')
        assert res_edit.status_code == status.HTTP_403_FORBIDDEN

        res_del = api_client.delete(f'/api/v1/share-links/{link1_id}/')
        assert res_del.status_code == status.HTTP_403_FORBIDDEN

        # Dataroom Owner can edit and delete any link in their dataroom
        api_client.force_authenticate(user=user)
        res_owner_edit = api_client.patch(f'/api/v1/share-links/{link1_id}/', {'name': 'Owner Renamed Link'}, format='json')
        assert res_owner_edit.status_code == status.HTTP_200_OK
        assert ShareLink.objects.get(id=link1_id).name == 'Owner Renamed Link'

        res_owner_del = api_client.delete(f'/api/v1/share-links/{link1_id}/')
        assert res_owner_del.status_code == status.HTTP_204_NO_CONTENT
        assert not ShareLink.objects.filter(id=link1_id).exists()

    def test_collaborator_folder_creation_sets_created_by(self, api_client, dataroom, user, organization):
        collab = User.objects.create_user(
            email="folder_collab@test.com", username="folder_collab@test.com", password="password", organization=organization, name="Folder Collab"
        )
        DataroomCollaborator.objects.create(dataroom=dataroom, user=collab, invited_by=user)

        api_client.force_authenticate(user=collab)
        res = api_client.post('/api/v1/dataroom-folders/', {
            'dataroom': str(dataroom.id),
            'name': 'Collab Financials',
        }, format='json')

        assert res.status_code == status.HTTP_201_CREATED
        assert res.data['name'] == 'Collab Financials'
        assert res.data['created_by']['id'] == str(collab.id)
        assert res.data['created_by']['email'] == 'folder_collab@test.com'

        # Fetch dataroom items and verify folder created_by is serialized
        res_dr = api_client.get(f'/api/v1/datarooms/{dataroom.id}/')
        assert res_dr.status_code == status.HTTP_200_OK
        folder_item = next(i for i in res_dr.data['items'] if i['id'] == res.data['id'])
        assert folder_item['created_by']['id'] == str(collab.id)
        assert folder_item['created_by']['email'] == 'folder_collab@test.com'
