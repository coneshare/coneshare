import pytest
from django.utils import timezone
from datetime import timedelta
from rest_framework import status

from core.models import Organization, User
from documents.models import Document
from sharelinks.models import ShareLink, ViewSession


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
