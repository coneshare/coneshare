from datetime import timedelta
import pytest
from django.utils import timezone
from rest_framework import status

from core.models import Organization, User
from datarooms.models import Dataroom
from documents.models import Document
from sharelinks.models import ShareLink, ViewSession


@pytest.mark.django_db
class TestAdminShareLinkViewSet:
    def test_non_admin_forbidden(self, api_client, user, share_link):
        api_client.force_authenticate(user=user)
        response = api_client.get('/api/v1/admin/links/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_can_list_all_org_links(self, api_client, admin_user, user, organization, document):
        # Link 1 created by regular member in Org
        link1 = ShareLink.objects.create(document=document, created_by=user, name="Member Doc Link")
        ViewSession.objects.create(share_link=link1)

        # Link 2 created by admin on Dataroom in Org
        room = Dataroom.objects.create(name="Org Room", organization=organization, created_by=admin_user)
        link2 = ShareLink.objects.create(dataroom=room, created_by=admin_user, name="Admin Room Link")

        # Link 3 in different Org (should NOT appear)
        other_org = Organization.objects.create(name="Other Corp")
        other_user = User.objects.create_user(username="other@example.com", organization=other_org)
        other_doc = Document.objects.create(name="Other Doc", organization=other_org, created_by=other_user)
        link3 = ShareLink.objects.create(document=other_doc, created_by=other_user, name="Other Link")

        api_client.force_authenticate(user=admin_user)
        response = api_client.get('/api/v1/admin/links/')
        assert response.status_code == status.HTTP_200_OK

        data = response.json()
        assert data['count'] == 2
        results = data['results']
        link_names = [r['name'] for r in results]
        assert "Member Doc Link" in link_names
        assert "Admin Room Link" in link_names
        assert "Other Link" not in link_names

        # Check metrics payload
        assert 'metrics' in data
        assert data['metrics']['total_links'] == 2
        assert data['metrics']['active_links'] == 2
        assert data['metrics']['dataroom_links'] == 1
        assert data['metrics']['document_links'] == 1

    def test_admin_filtering_and_search(self, api_client, admin_user, user, organization, document):
        now = timezone.now()
        # Active document link
        link1 = ShareLink.objects.create(document=document, created_by=user, name="Alpha Document")

        # Expired dataroom link
        room = Dataroom.objects.create(name="Beta Room", organization=organization, created_by=admin_user)
        link2 = ShareLink.objects.create(
            dataroom=room, created_by=admin_user, name="Beta Dataroom Link",
            expires_at=now - timedelta(days=1)
        )

        # Revoked document link
        link3 = ShareLink.objects.create(
            document=document, created_by=user, name="Gamma Revoked",
            is_active=False
        )

        api_client.force_authenticate(user=admin_user)

        # Search by query
        res_search = api_client.get('/api/v1/admin/links/?search=Alpha')
        assert res_search.json()['count'] == 1
        assert res_search.json()['results'][0]['name'] == "Alpha Document"

        # Search by creator email
        res_creator = api_client.get(f'/api/v1/admin/links/?search={user.email}')
        assert res_creator.json()['count'] == 2  # link1 (Alpha) and link3 (Gamma) were created by user

        # Search by creator name
        user.name = "Alice Wonder"
        user.save()
        res_creator_name = api_client.get('/api/v1/admin/links/?search=Alice')
        assert res_creator_name.json()['count'] == 2

        # Sorting: nullable last_viewed_at with nulls_last=True
        ViewSession.objects.create(share_link=link1)
        res_sort_views = api_client.get('/api/v1/admin/links/?sort=last_viewed_at&direction=desc')
        assert res_sort_views.json()['results'][0]['id'] == str(link1.id)  # link1 has view, others have NULL and must be last

        # Filter by target_type
        res_room = api_client.get('/api/v1/admin/links/?target_type=dataroom')
        assert res_room.json()['count'] == 1
        assert res_room.json()['results'][0]['target_type'] == "dataroom"

        # Filter by status: active, expired, revoked
        res_active = api_client.get('/api/v1/admin/links/?status=active')
        assert res_active.json()['count'] == 1
        assert res_active.json()['results'][0]['name'] == "Alpha Document"

        res_expired = api_client.get('/api/v1/admin/links/?status=expired')
        assert res_expired.json()['count'] == 1
        assert res_expired.json()['results'][0]['name'] == "Beta Dataroom Link"

        res_revoked = api_client.get('/api/v1/admin/links/?status=revoked')
        assert res_revoked.json()['count'] == 1
        assert res_revoked.json()['results'][0]['name'] == "Gamma Revoked"

    def test_admin_retrieve_detail_with_sessions(self, api_client, admin_user, user, document):
        link = ShareLink.objects.create(
            document=document,
            created_by=user,
            name="Audited Link",
            watermark_text="Confidential",
            require_nda=True,
            nda_text="Must agree not to disclose."
        )
        ViewSession.objects.create(
            share_link=link,
            viewer_email="visitor@partner.com",
            ip_address="1.2.3.4",
            country="US",
            city="San Francisco",
            duration_seconds=120
        )

        api_client.force_authenticate(user=admin_user)
        response = api_client.get(f'/api/v1/admin/links/{link.id}/')
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert data['id'] == str(link.id)
        assert data['name'] == "Audited Link"
        assert data['watermark_text'] == "Confidential"
        assert data['require_nda'] is True
        assert len(data['recent_view_sessions']) == 1
        assert data['recent_view_sessions'][0]['viewer_email'] == "visitor@partner.com"
        assert data['recent_view_sessions'][0]['duration_seconds'] == 120

    def test_admin_toggle_active_status(self, api_client, admin_user, user, document):
        link = ShareLink.objects.create(document=document, created_by=user, is_active=True)

        api_client.force_authenticate(user=admin_user)
        # Revoke (deactivate)
        res_patch = api_client.patch(f'/api/v1/admin/links/{link.id}/', {'is_active': False})
        assert res_patch.status_code == status.HTTP_200_OK
        link.refresh_from_db()
        assert link.is_active is False

        # Reactivate
        res_patch2 = api_client.patch(f'/api/v1/admin/links/{link.id}/', {'is_active': True})
        assert res_patch2.status_code == status.HTTP_200_OK
        link.refresh_from_db()
        assert link.is_active is True

    def test_admin_delete_link(self, api_client, admin_user, user, document):
        link = ShareLink.objects.create(document=document, created_by=user)

        api_client.force_authenticate(user=admin_user)
        response = api_client.delete(f'/api/v1/admin/links/{link.id}/')
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not ShareLink.objects.filter(id=link.id).exists()

    def test_non_admin_denied_detail_actions(self, api_client, user, document):
        link = ShareLink.objects.create(document=document, created_by=user, is_active=True)
        api_client.force_authenticate(user=user)

        # GET detail denied
        assert api_client.get(f'/api/v1/admin/links/{link.id}/').status_code == status.HTTP_403_FORBIDDEN

        # PATCH denied and link untouched
        res_patch = api_client.patch(f'/api/v1/admin/links/{link.id}/', {'is_active': False})
        assert res_patch.status_code == status.HTTP_403_FORBIDDEN
        link.refresh_from_db()
        assert link.is_active is True

        # DELETE denied and link still exists
        assert api_client.delete(f'/api/v1/admin/links/{link.id}/').status_code == status.HTTP_403_FORBIDDEN
        assert ShareLink.objects.filter(id=link.id).exists()

    def test_other_org_admin_denied_detail_actions(self, api_client, user, document):
        link = ShareLink.objects.create(document=document, created_by=user, is_active=True)

        other_org = Organization.objects.create(name="Foreign Org")
        other_admin = User.objects.create_user(
            username="otheradmin@foreign.com",
            role="admin",
            organization=other_org
        )
        api_client.force_authenticate(user=other_admin)

        # GET detail returns 404
        assert api_client.get(f'/api/v1/admin/links/{link.id}/').status_code == status.HTTP_404_NOT_FOUND

        # PATCH returns 404 and link untouched
        res_patch = api_client.patch(f'/api/v1/admin/links/{link.id}/', {'is_active': False})
        assert res_patch.status_code == status.HTTP_404_NOT_FOUND
        link.refresh_from_db()
        assert link.is_active is True

        # DELETE returns 404 and link still exists
        assert api_client.delete(f'/api/v1/admin/links/{link.id}/').status_code == status.HTTP_404_NOT_FOUND
        assert ShareLink.objects.filter(id=link.id).exists()

    def test_view_session_viewset_org_admin_access_and_cross_org_denial(self, api_client, admin_user, user, organization, document):
        colleague_link = ShareLink.objects.create(document=document, created_by=user)
        session = ViewSession.objects.create(share_link=colleague_link)

        # Other org link and session
        other_org = Organization.objects.create(name="Foreign Org")
        other_user = User.objects.create_user(username="foreign@example.com", organization=other_org)
        other_doc = Document.objects.create(name="Foreign Doc", organization=other_org, created_by=other_user)
        foreign_link = ShareLink.objects.create(document=other_doc, created_by=other_user)
        foreign_session = ViewSession.objects.create(share_link=foreign_link)

        # Org admin can retrieve session of colleague's link in same org
        api_client.force_authenticate(user=admin_user)
        res_colleague = api_client.get(f'/api/v1/view-sessions/{session.id}/')
        assert res_colleague.status_code == status.HTTP_200_OK

        # Org admin cannot retrieve session of foreign org link
        res_foreign = api_client.get(f'/api/v1/view-sessions/{foreign_session.id}/')
        assert res_foreign.status_code == status.HTTP_404_NOT_FOUND
