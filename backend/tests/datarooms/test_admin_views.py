import pytest
from rest_framework import status

from core.models import Organization, User
from datarooms.models import Dataroom, DataroomCollaborator

pytestmark = pytest.mark.django_db


class TestAdminDataroomViewSet:
    def test_admin_can_list_all_org_datarooms(self, admin_api_client, admin_user, user, user2):
        org = admin_user.organization
        other_org = Organization.objects.create(name="Other Corp")

        # Datarooms in same org
        d1 = Dataroom.objects.create(name="Room 1 (User)", organization=org, created_by=user, storage_version=2)
        d2 = Dataroom.objects.create(name="Room 2 (User2)", organization=org, created_by=user2, storage_version=2)
        # Dataroom in different org
        d_other = Dataroom.objects.create(name="Room 3 (Other Org)", organization=other_org, storage_version=2)

        response = admin_api_client.get('/api/v1/admin/datarooms/')
        assert response.status_code == status.HTTP_200_OK
        data = response.data
        assert 'results' in data
        assert 'metrics' in data
        assert data['metrics']['total_rooms'] >= 2
        ids = [item['id'] for item in data['results']]
        assert str(d1.id) in ids
        assert str(d2.id) in ids
        assert str(d_other.id) not in ids

    def test_non_admin_forbidden_from_admin_datarooms(self, api_client, user):
        response = api_client.get('/api/v1/admin/datarooms/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_can_update_storage_quota(self, admin_api_client, admin_user, user):
        org = admin_user.organization
        room = Dataroom.objects.create(name="Test Room", organization=org, created_by=user, storage_quota_mb=0, storage_version=2)

        response = admin_api_client.patch(f'/api/v1/admin/datarooms/{room.id}/', {
            'storage_quota_mb': 1024
        })
        assert response.status_code == status.HTTP_200_OK
        room.refresh_from_db()
        assert room.storage_quota_mb == 1024

    def test_admin_can_transfer_ownership(self, admin_api_client, admin_user, user, user2):
        org = admin_user.organization
        room = Dataroom.objects.create(name="Deal Room", organization=org, created_by=user, storage_version=2)

        response = admin_api_client.post(f'/api/v1/admin/datarooms/{room.id}/transfer-ownership/', {
            'new_owner_id': str(user2.id)
        })
        assert response.status_code == status.HTTP_200_OK
        room.refresh_from_db()
        assert room.created_by == user2
        # Previous owner becomes a collaborator
        assert DataroomCollaborator.objects.filter(dataroom=room, user=user).exists()

    def test_admin_can_upgrade_storage_v1_to_v2(self, admin_api_client, admin_user, user):
        org = admin_user.organization
        room = Dataroom.objects.create(name="Legacy Room", organization=org, created_by=user, storage_version=1)

        response = admin_api_client.post(f'/api/v1/admin/datarooms/{room.id}/upgrade-storage/')
        assert response.status_code == status.HTTP_200_OK
        room.refresh_from_db()
        assert room.storage_version == 2

    def test_admin_can_manage_collaborators(self, admin_api_client, admin_user, user, user2):
        org = admin_user.organization
        room = Dataroom.objects.create(name="Collab Room", organization=org, created_by=user, storage_version=2)

        # Add collaborator
        add_res = admin_api_client.post(f'/api/v1/admin/datarooms/{room.id}/collaborators/', {
            'user_ids': [str(user2.id)]
        })
        assert add_res.status_code == status.HTTP_201_CREATED
        assert DataroomCollaborator.objects.filter(dataroom=room, user=user2).exists()

        # List collaborators
        list_res = admin_api_client.get(f'/api/v1/admin/datarooms/{room.id}/collaborators/')
        assert list_res.status_code == status.HTTP_200_OK
        assert list_res.data['total_count'] == 1

        # Remove collaborator via POST should be rejected (405 Method Not Allowed)
        post_res = admin_api_client.post(f'/api/v1/admin/datarooms/{room.id}/collaborators/{user2.id}/')
        assert post_res.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

        # Remove collaborator via DELETE
        del_res = admin_api_client.delete(f'/api/v1/admin/datarooms/{room.id}/collaborators/{user2.id}/')
        assert del_res.status_code == status.HTTP_200_OK
        assert not DataroomCollaborator.objects.filter(dataroom=room, user=user2).exists()

    def test_eligible_collaborators_is_bounded_to_50(self, admin_api_client, admin_user, user):
        org = admin_user.organization
        room = Dataroom.objects.create(name="Collab Room", organization=org, created_by=user, storage_version=2)
        # Create 60 active users in the org
        User.objects.bulk_create([
            User(
                username=f"test_user_{i}@example.com",
                email=f"test_user_{i}@example.com",
                name=f"Test User {i:02d}",
                organization=org,
                is_active=True,
            )
            for i in range(60)
        ])

        res = admin_api_client.get(f'/api/v1/admin/datarooms/{room.id}/eligible-collaborators/')
        assert res.status_code == status.HTTP_200_OK
        assert len(res.data) == 50

    def test_admin_can_delete_dataroom(self, admin_api_client, admin_user, user):
        org = admin_user.organization
        room = Dataroom.objects.create(name="Delete Me", organization=org, created_by=user, storage_version=2)

        del_res = admin_api_client.delete(f'/api/v1/admin/datarooms/{room.id}/')
        assert del_res.status_code == status.HTTP_204_NO_CONTENT
        assert not Dataroom.objects.filter(id=room.id).exists()

    def test_workspace_list_vs_admin_list_scoping(self, admin_api_client, admin_user, user, user2):
        org = admin_user.organization
        # Room created by admin
        d_admin = Dataroom.objects.create(name="Admin's Personal Room", organization=org, created_by=admin_user, storage_version=2)
        # Room created by user (admin is NOT a member/collaborator)
        d_user = Dataroom.objects.create(name="User's Private Room", organization=org, created_by=user, storage_version=2)

        # 1. Standard Workspace listing (/api/v1/datarooms/): Admin only sees their own rooms
        ws_res = admin_api_client.get('/api/v1/datarooms/')
        assert ws_res.status_code == status.HTTP_200_OK
        ws_ids = [item['id'] for item in ws_res.data]
        assert str(d_admin.id) in ws_ids
        assert str(d_user.id) not in ws_ids

        # 2. Admin Governance listing (/api/v1/admin/datarooms/): Admin sees ALL organization rooms
        admin_res = admin_api_client.get('/api/v1/admin/datarooms/')
        assert admin_res.status_code == status.HTTP_200_OK
        admin_ids = [item['id'] for item in admin_res.data['results']]
        assert str(d_admin.id) in admin_ids
        assert str(d_user.id) in admin_ids

    def test_admin_datarooms_sorting_and_filtering(self, admin_api_client, admin_user, user):
        org = admin_user.organization
        room_b = Dataroom.objects.create(name="Beta Room", organization=org, created_by=user, storage_version=1)
        room_a = Dataroom.objects.create(name="Alpha Room", organization=org, created_by=admin_user, storage_version=2)

        # 1. Sort by name asc
        res_asc = admin_api_client.get('/api/v1/admin/datarooms/?ordering=name')
        assert res_asc.status_code == status.HTTP_200_OK
        names_asc = [r['name'] for r in res_asc.data['results']]
        assert names_asc.index("Alpha Room") < names_asc.index("Beta Room")

        # 2. Sort by name desc
        res_desc = admin_api_client.get('/api/v1/admin/datarooms/?ordering=-name')
        assert res_desc.status_code == status.HTTP_200_OK
        names_desc = [r['name'] for r in res_desc.data['results']]
        assert names_desc.index("Beta Room") < names_desc.index("Alpha Room")

        # 3. Filter by search
        res_search = admin_api_client.get('/api/v1/admin/datarooms/?search=Alpha')
        assert res_search.status_code == status.HTTP_200_OK
        search_names = [r['name'] for r in res_search.data['results']]
        assert "Alpha Room" in search_names
        assert "Beta Room" not in search_names

        # 4. Filter by status legacy_v1
        res_legacy = admin_api_client.get('/api/v1/admin/datarooms/?status=legacy_v1')
        assert res_legacy.status_code == status.HTTP_200_OK
        legacy_names = [r['name'] for r in res_legacy.data['results']]
        assert "Beta Room" in legacy_names
        assert "Alpha Room" not in legacy_names

    def test_workspace_list_does_not_execute_n_plus_one_metric_queries(self, api_client, user):
        from django.test.utils import CaptureQueriesContext
        from django.db import connection
        org = user.organization
        for i in range(5):
            Dataroom.objects.create(name=f"Room {i}", organization=org, created_by=user, storage_version=2)

        with CaptureQueriesContext(connection) as ctx:
            res = api_client.get('/api/v1/datarooms/')
            assert res.status_code == status.HTTP_200_OK

        share_link_queries = [q for q in ctx.captured_queries if 'sharelink' in q['sql'].lower()]
        assert len(share_link_queries) == 0, f"Expected 0 sharelink queries in workspace list, got {len(share_link_queries)}"

    def test_workspace_list_does_not_allow_scope_org_escape_hatch(self, admin_api_client, admin_user, user):
        org = admin_user.organization
        admin_room = Dataroom.objects.create(name="Admin Room", organization=org, created_by=admin_user, storage_version=2)
        other_user_room = Dataroom.objects.create(name="Other User Room", organization=org, created_by=user, storage_version=2)

        # Standard workspace endpoint with scope=org should NOT return non-participating rooms
        res = admin_api_client.get('/api/v1/datarooms/?scope=org')
        assert res.status_code == status.HTTP_200_OK
        room_ids = [r['id'] for r in res.data['results']] if 'results' in res.data else [r['id'] for r in res.data]
        assert str(admin_room.id) in room_ids
        assert str(other_user_room.id) not in room_ids

