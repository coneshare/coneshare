import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from datetime import timedelta
from rest_framework import status

from core.models import Organization, User
from datarooms.models import Dataroom, DataroomDocument
from documents.models import Document, DocumentPage
from sharelinks.models import DataroomVisit, PageView, QnAThread, ShareLink, ViewSession


@pytest.mark.django_db
class TestDashboardAnalyticsViews:
    """Tests for the dashboard analytics API endpoints."""

    def test_dashboard_summary_view(self, api_client, user, user2, document):
        """
        Test that the dashboard summary returns the correct recent views and links,
        scoped to the user's data, not the whole organization.
        """
        # 1. Create data for the logged-in user
        link1 = ShareLink.objects.create(document=document, created_by=user, name="Link 1")
        link2 = ShareLink.objects.create(document=document, created_by=user, name="Link 2")

        # Create 12 view sessions to test the limit of 10
        for i in range(12):
            ViewSession.objects.create(
                share_link=link1,
                viewed_at=timezone.now() - timedelta(minutes=i)
            )
        # Create a view for the second link to make it "active"
        ViewSession.objects.create(share_link=link2, viewed_at=timezone.now() - timedelta(hours=1))

        # 2. Create data for another user in the SAME organization that should NOT appear
        doc2 = Document.objects.create(
            name="Doc 2", organization=user.organization, created_by=user2
        )
        link3 = ShareLink.objects.create(document=doc2, created_by=user2, name="Link 3")
        ViewSession.objects.create(share_link=link3)

        # 3. Create data for another user in a different org that should NOT appear
        other_org = Organization.objects.create(name="Other Org")
        other_user = User.objects.create_user(
            username="other@example.com", organization=other_org
        )
        other_doc = Document.objects.create(
            name="Other Doc", organization=other_org, created_by=other_user
        )
        other_link = ShareLink.objects.create(document=other_doc, created_by=other_user)
        ViewSession.objects.create(share_link=other_link)

        # 4. Call the API
        response = api_client.get('/api/v1/analytics/dashboard/')
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        # 5. Assertions
        assert 'recent_views' in data
        assert 'recent_links' in data
        # Should only include views from link1 and link2 (user1), not link3 (user2)
        assert len(data['recent_views']) == 10  # Capped at 10 from link1
        # Should only include links from user1
        assert len(data['recent_links']) == 2

        # Check ordering
        assert data['recent_views'][0]['share_link_name'] == "Link 1"
        assert data['recent_links'][0]['name'] == "Link 1"  # most recent view
        assert data['recent_links'][1]['name'] == "Link 2"

    def test_dashboard_summary_view_scoped_for_admin_user(self, api_client, user, user2, document):
        """
        Verify that even for an organization admin, the personal dashboard summary
        is strictly scoped to their own links, not colleagues' document or dataroom links in the same org.
        """
        user.role = 'admin'
        user.save()

        # user (admin) creates link1
        link1 = ShareLink.objects.create(document=document, created_by=user, name="Admin Link")
        ViewSession.objects.create(share_link=link1)

        # user2 (colleague in same org) creates document link2
        doc2 = Document.objects.create(name="Colleague Doc", organization=user.organization, created_by=user2)
        link2 = ShareLink.objects.create(document=doc2, created_by=user2, name="Colleague Link")
        ViewSession.objects.create(share_link=link2)

        # user2 creates a dataroom and dataroom link3 (admin is NOT an owner or collaborator)
        dr = Dataroom.objects.create(name="Colleague Room", organization=user.organization, created_by=user2)
        link3 = ShareLink.objects.create(dataroom=dr, created_by=user2, name="Colleague Room Link")
        ViewSession.objects.create(share_link=link3)

        api_client.force_authenticate(user=user)
        response = api_client.get('/api/v1/analytics/dashboard/')
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        # Admin only sees their own link and view
        assert len(data['recent_links']) == 1
        assert data['recent_links'][0]['name'] == "Admin Link"
        assert len(data['recent_views']) == 1
        assert data['recent_views'][0]['share_link_name'] == "Admin Link"

    def test_dashboard_summary_does_not_expose_link_password(self, api_client, user, document):
        """
        Test that recent_links in dashboard summary does NOT expose raw/decrypted password,
        while maintaining has_password=True.
        """
        link = ShareLink.objects.create(
            document=document,
            created_by=user,
            name="Protected Link",
            password="mysecretpassword123"
        )
        ViewSession.objects.create(share_link=link, viewed_at=timezone.now())

        response = api_client.get('/api/v1/analytics/dashboard/')
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data['recent_links']) >= 1
        link_data = data['recent_links'][0]
        assert link_data['name'] == "Protected Link"
        assert link_data['has_password'] is True
        assert 'password' not in link_data

    def test_dashboard_summary_no_n_plus_one_queries(self, api_client, user, document, django_assert_num_queries):
        """
        Test that dashboard summary executes a bounded number of queries and does not
        trigger deferred attribute loads (N+1) when sessions have viewers, ip_address,
        and geo coordinates.
        """
        from sharelinks.models import Viewer
        viewer1 = Viewer.objects.create(organization=user.organization, email="v1@example.com")
        viewer2 = Viewer.objects.create(organization=user.organization, email="v2@example.com")

        link = ShareLink.objects.create(document=document, created_by=user, name="Query Link")
        for i in range(5):
            ViewSession.objects.create(
                share_link=link,
                viewer=viewer1 if i % 2 == 0 else viewer2,
                viewer_email=f"v{i}@example.com",
                ip_address="192.168.1.1",
                latitude=37.7749,
                longitude=-122.4194,
                duration_seconds=10 * i,
                completion_rate=0.5,
                viewed_at=timezone.now() - timedelta(minutes=i)
            )

        # With proper eager-loading, query count is constant:
        # 1. recent_views query
        # 2. recent_links query
        # 3. dataroom_settings prefetch
        # 4. view_sessions prefetch
        with django_assert_num_queries(4):
            response = api_client.get('/api/v1/analytics/dashboard/')
            assert response.status_code == status.HTTP_200_OK
            data = response.json()
            assert len(data['recent_views']) == 5
            assert len(data['recent_links']) == 1
            assert len(data['recent_links'][0]['recent_view_sessions']) == 5

    def test_dashboard_summary_includes_email_verification_method(self, api_client, user, document):
        """
        Test that dashboard summary returns email_verification_method in recent_views
        and recent_links[].recent_view_sessions for badge display in UI.
        """
        link = ShareLink.objects.create(document=document, created_by=user, name="Badge Link")
        vs_verified = ViewSession.objects.create(
            share_link=link,
            viewer_email="verified@example.com",
            email_verification_method="verified",
            viewed_at=timezone.now() - timedelta(minutes=1),
        )
        vs_self_reported = ViewSession.objects.create(
            share_link=link,
            viewer_email="self@example.com",
            email_verification_method="self_reported",
            viewed_at=timezone.now() - timedelta(minutes=2),
        )

        response = api_client.get('/api/v1/analytics/dashboard/')
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        views = data['recent_views']
        assert len(views) == 2
        assert views[0]['id'] == str(vs_verified.id)
        assert views[0]['email_verification_method'] == 'verified'
        assert views[1]['id'] == str(vs_self_reported.id)
        assert views[1]['email_verification_method'] == 'self_reported'

        link_sessions = data['recent_links'][0]['recent_view_sessions']
        assert len(link_sessions) == 2
        assert link_sessions[0]['email_verification_method'] == 'verified'
        assert link_sessions[1]['email_verification_method'] == 'self_reported'


    def test_daily_visits_view(self, api_client, share_link, user2):
        """
        Test that daily visits are aggregated correctly for the user's links only.
        """
        # user is logged in via api_client fixture
        user = share_link.created_by

        # 1. Create view data for the logged-in user
        ViewSession.objects.create(share_link=share_link, viewed_at=timezone.now() - timedelta(days=1))
        ViewSession.objects.create(share_link=share_link, viewed_at=timezone.now() - timedelta(days=1))
        ViewSession.objects.create(share_link=share_link, viewed_at=timezone.now() - timedelta(days=5))
        ViewSession.objects.create(share_link=share_link, viewed_at=timezone.now() - timedelta(days=35))  # Should be excluded by date

        # 2. Create view data for another user in the same org, which should be excluded
        other_doc = Document.objects.create(
            name="Other Doc", organization=user.organization, created_by=user2
        )
        other_link = ShareLink.objects.create(document=other_doc, created_by=user2)
        ViewSession.objects.create(share_link=other_link, viewed_at=timezone.now() - timedelta(days=1))

        # 3. Call the API
        response = api_client.get('/api/v1/analytics/daily-visits/')
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert len(data) == 31  # Today + last 30 days

        # Find the data for yesterday
        yesterday_str = (timezone.now().date() - timedelta(days=1)).strftime('%Y-%m-%d')
        yesterday_data = next((item for item in data if item['date'] == yesterday_str), None)
        assert yesterday_data is not None
        assert yesterday_data['visits'] == 2

        # Find the data for 5 days ago
        five_days_ago_str = (timezone.now().date() - timedelta(days=5)).strftime('%Y-%m-%d')
        five_days_ago_data = next((item for item in data if item['date'] == five_days_ago_str), None)
        assert five_days_ago_data is not None
        assert five_days_ago_data['visits'] == 1

        # Check a day with no visits
        two_days_ago_str = (timezone.now().date() - timedelta(days=2)).strftime('%Y-%m-%d')
        two_days_ago_data = next((item for item in data if item['date'] == two_days_ago_str), None)
        assert two_days_ago_data is not None
        assert two_days_ago_data['visits'] == 0

    def test_all_links_view(self, api_client, document, user, user2):
        """Test the paginated list of all active links for the current user only."""
        # Create 12 links for the logged-in user, but only 11 are active
        for i in range(12):
            link = ShareLink.objects.create(document=document, created_by=user, name=f"User 1 Link {i}")
            if i < 11:
                ViewSession.objects.create(share_link=link, viewed_at=timezone.now() - timedelta(hours=i))

        # Create an active link for another user in the same org, which should not appear
        other_doc = Document.objects.create(name="Other Doc", organization=user.organization, created_by=user2)
        other_link = ShareLink.objects.create(document=other_doc, created_by=user2, name="Other User Link")
        ViewSession.objects.create(share_link=other_link, viewed_at=timezone.now())

        # Page 1
        response = api_client.get('/api/v1/analytics/links/')
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert data['count'] == 11
        assert len(data['results']) == 10
        assert data['results'][0]['name'] == "User 1 Link 0"  # Most recent view
        assert data['next'] is not None

        # Page 2
        response2 = api_client.get(data['next'])
        assert response2.status_code == status.HTTP_200_OK
        data2 = response2.json()

        assert data2['count'] == 11
        assert len(data2['results']) == 1
        assert data2['results'][0]['name'] == "User 1 Link 10"

    def test_all_view_sessions_view(self, api_client, share_link, user2):
        """Test the paginated list of all view sessions for the current user's links."""
        user = share_link.created_by
        for i in range(15):
            ViewSession.objects.create(share_link=share_link)

        # Create a view session for another user in the same org, which should not appear
        other_doc = Document.objects.create(name="Other Doc", organization=user.organization, created_by=user2)
        other_link = ShareLink.objects.create(document=other_doc, created_by=user2)
        ViewSession.objects.create(share_link=other_link)

        response = api_client.get('/api/v1/analytics/view-sessions/')
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert data['count'] == 15
        assert len(data['results']) == 10
        assert data['next'] is not None

    def test_all_view_sessions_filters(self, api_client, document, share_link, user):
        """Test filtering view sessions by document_id, share_link_id, and viewer_email."""
        link2 = ShareLink.objects.create(document=document, created_by=user, name="Link 2")

        session1 = ViewSession.objects.create(share_link=share_link, viewer_email="alice@example.com")
        session2 = ViewSession.objects.create(share_link=link2, viewer_email="bob@example.com")

        # Filter by document_id
        res_doc = api_client.get(f'/api/v1/analytics/view-sessions/?document_id={document.id}')
        assert res_doc.status_code == status.HTTP_200_OK
        assert res_doc.json()['count'] == 2

        # Filter by share_link_id
        res_link = api_client.get(f'/api/v1/analytics/view-sessions/?share_link_id={share_link.id}')
        assert res_link.status_code == status.HTTP_200_OK
        assert res_link.json()['count'] == 1
        assert res_link.json()['results'][0]['id'] == str(session1.id)

        # Filter by viewer_email
        res_email = api_client.get('/api/v1/analytics/view-sessions/?viewer_email=bob@example.com')
        assert res_email.status_code == status.HTTP_200_OK
        assert res_email.json()['count'] == 1
        assert res_email.json()['results'][0]['id'] == str(session2.id)

    def test_view_session_detail_view(self, api_client, share_link):
        """Test retrieving single view session details by ID."""
        session = ViewSession.objects.create(
            share_link=share_link,
            viewer_email="viewer@example.com",
            country="US",
            city="San Francisco",
            duration_seconds=120
        )

        response = api_client.get(f'/api/v1/analytics/view-sessions/{session.id}/')
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data['id'] == str(session.id)
        assert data['viewer_email'] == "viewer@example.com"
        assert data['country'] == "US"
        assert data['duration_seconds'] == 120

    def test_admin_can_retrieve_view_session_detail_on_colleague_link(self, api_client, admin_user, user, document):
        """
        Verify that an organization admin can retrieve session details for a colleague's
        link within their organization, even if the admin did not create the link.
        """
        colleague_link = ShareLink.objects.create(document=document, created_by=user, name="Colleague Link")
        session = ViewSession.objects.create(
            share_link=colleague_link,
            viewer_email="investor@fund.com",
            duration_seconds=90
        )

        api_client.force_authenticate(user=admin_user)
        response = api_client.get(f'/api/v1/analytics/view-sessions/{session.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.json()['id'] == str(session.id)

    def test_admin_cannot_retrieve_view_session_of_other_org(self, api_client, admin_user):
        """
        Verify that an organization admin cannot access session details for documents
        or datarooms belonging to another organization.
        """
        other_org = Organization.objects.create(name="Foreign Org Corp")
        other_user = User.objects.create_user(username="foreignadmin@example.com", organization=other_org)

        # Foreign document link & session
        foreign_doc = Document.objects.create(name="Foreign Doc", organization=other_org, created_by=other_user)
        doc_link = ShareLink.objects.create(document=foreign_doc, created_by=other_user, name="Foreign Doc Link")
        doc_session = ViewSession.objects.create(share_link=doc_link, viewer_email="foreign_viewer@example.com")

        # Foreign dataroom link & session
        foreign_room = Dataroom.objects.create(name="Foreign Room", organization=other_org, created_by=other_user)
        room_link = ShareLink.objects.create(dataroom=foreign_room, created_by=other_user, name="Foreign Room Link")
        room_session = ViewSession.objects.create(share_link=room_link, viewer_email="foreign_room_viewer@example.com")

        api_client.force_authenticate(user=admin_user)

        res_doc = api_client.get(f'/api/v1/analytics/view-sessions/{doc_session.id}/')
        assert res_doc.status_code == status.HTTP_404_NOT_FOUND

        res_room = api_client.get(f'/api/v1/analytics/view-sessions/{room_session.id}/')
        assert res_room.status_code == status.HTTP_404_NOT_FOUND

    def test_view_sessions_dataroom_page_views_bounded_queries_no_n_plus_one(
        self, api_client, user, dataroom, document, django_assert_num_queries
    ):
        """
        Verify that analytics view sessions list and detail endpoints execute bounded queries
        when serializing dataroom sessions with multiple page views (no N+1 per page view on dataroom_visit).
        """
        primary_version = document.versions.filter(is_primary=True).first()
        for p in range(1, 10):
            DocumentPage.objects.create(
                document_version=primary_version,
                page_number=p,
                storage_key=f"test/pages/page_{p}.png"
            )

        ddoc = DataroomDocument.objects.create(dataroom=dataroom, document=document)
        room_link = ShareLink.objects.create(dataroom=dataroom, created_by=user, name="Dataroom Link")
        session = ViewSession.objects.create(share_link=room_link, viewer_email="investor@example.com")
        visit = DataroomVisit.objects.create(
            view_session=session,
            dataroom_document=ddoc,
            item_type='document',
            item_name=document.name
        )

        # Baseline: 1 page view
        pv1 = PageView.objects.create(
            view_session=session,
            dataroom_visit=visit,
            page_number=1,
            duration_seconds=30
        )

        # Measure query counts with 1 page view
        with CaptureQueriesContext(connection) as ctx_list_1:
            resp_list_1 = api_client.get('/api/v1/analytics/view-sessions/')
        assert resp_list_1.status_code == status.HTTP_200_OK
        q_count_list_1 = len(ctx_list_1)

        with CaptureQueriesContext(connection) as ctx_detail_1:
            resp_detail_1 = api_client.get(f'/api/v1/analytics/view-sessions/{session.id}/')
        assert resp_detail_1.status_code == status.HTTP_200_OK
        q_count_detail_1 = len(ctx_detail_1)

        # Add 5 more page views (6 total)
        for p in range(2, 7):
            PageView.objects.create(
                view_session=session,
                dataroom_visit=visit,
                page_number=p,
                duration_seconds=15
            )

        # Assert query counts remain identical (bounded, no N+1 on visit per page view)
        with django_assert_num_queries(q_count_list_1):
            resp_list_6 = api_client.get('/api/v1/analytics/view-sessions/')
        assert resp_list_6.status_code == status.HTTP_200_OK

        with django_assert_num_queries(q_count_detail_1):
            resp_detail_6 = api_client.get(f'/api/v1/analytics/view-sessions/{session.id}/')
        assert resp_detail_6.status_code == status.HTTP_200_OK

    def test_dashboard_summary_and_all_links_include_qna_thread_counts(self, api_client, user, document):
        """
        Verify that recent_links in dashboard summary and all-links endpoint return
        qna_enabled, qna_total_threads, and qna_unresolved_threads.
        """
        link = ShareLink.objects.create(document=document, created_by=user, name="QnA Link", enable_qna=True)
        ViewSession.objects.create(share_link=link, viewed_at=timezone.now())

        # Create 1 open thread and 1 closed thread
        QnAThread.objects.create(
            organization=user.organization,
            share_link=link,
            document=document,
            subject="Question 1 (Open)",
            status=QnAThread.STATUS_OPEN,
            created_by_user=user,
        )
        QnAThread.objects.create(
            organization=user.organization,
            share_link=link,
            document=document,
            subject="Question 2 (Closed)",
            status=QnAThread.STATUS_CLOSED,
            created_by_user=user,
        )

        # 1. Test Dashboard Summary
        res_dash = api_client.get('/api/v1/analytics/dashboard/')
        assert res_dash.status_code == status.HTTP_200_OK
        dash_link = res_dash.json()['recent_links'][0]
        assert dash_link['id'] == str(link.id)
        assert dash_link['qna_enabled'] is True
        assert dash_link['qna_total_threads'] == 2
        assert dash_link['qna_unresolved_threads'] == 1

        # 2. Test All Links
        res_all = api_client.get('/api/v1/analytics/links/')
        assert res_all.status_code == status.HTTP_200_OK
        all_link = res_all.json()['results'][0]
        assert all_link['id'] == str(link.id)
        assert all_link['qna_enabled'] is True
        assert all_link['qna_total_threads'] == 2
        assert all_link['qna_unresolved_threads'] == 1

