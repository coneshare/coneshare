import pytest
from unittest.mock import patch
from rest_framework import status

from sharelinks.models import ShareLink, ViewSession, PageView

pytestmark = pytest.mark.django_db


@pytest.mark.django_db
class TestRecordPageView:
    def test_record_page_view_success(self, public_client, share_link):
        """Test that a page view is recorded successfully."""
        # 1. Create a View session
        view_session = ViewSession.objects.create(share_link=share_link, duration_seconds=10)
        assert PageView.objects.count() == 0

        # 2. Send tracking data
        data = {
            'view_session': view_session.id,
            'page_number': 1,
            'duration_seconds': 5
        }
        response = public_client.post('/api/v1/page-views/record/', data)

        # 3. Assertions
        assert response.status_code == status.HTTP_200_OK
        assert PageView.objects.count() == 1

        page_view = PageView.objects.first()
        assert page_view.view_session == view_session
        assert page_view.page_number == 1
        assert page_view.duration_seconds == 5

        view_session.refresh_from_db()
        assert view_session.duration_seconds == 15  # 10 + 5

    def test_record_page_view_invalid_view_id(self, public_client):
        """Test that recording a page view with an invalid view ID fails."""
        data = {
            'view_session': '01J4Z7YJ8ZJ4Z7YJ8ZJ4Z7YJ8Z',  # A valid but non-existent ULID
            'page_number': 1,
            'duration_seconds': 5
        }
        response = public_client.post('/api/v1/page-views/record/', data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        # It's a validation error because the view does not exist.
        assert 'view_session' in response.data
        assert PageView.objects.count() == 0

    def test_record_page_view_missing_data(self, public_client, share_link):
        """Test that recording a page view with missing data fails."""
        view_session = ViewSession.objects.create(share_link=share_link)
        data = {
            'view_session': view_session.id,
            # 'page_number' is missing
            'duration_seconds': 5
        }
        response = public_client.post('/api/v1/page-views/record/', data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'page_number' in response.data
        assert PageView.objects.count() == 0

    def test_record_page_view_updates_completion_rate(self, public_client, document, share_link):
        """
        Test that recording page views correctly updates the parent ViewSession's
        completion rate.
        """
        # Set the total number of pages on the document
        document.num_pages = 4
        document.save()

        view_session = ViewSession.objects.create(share_link=share_link)
        assert view_session.completion_rate == 0.0

        # View page 1
        public_client.post('/api/v1/page-views/record/', {
            'view_session': view_session.id, 'page_number': 1, 'duration_seconds': 5
        })
        view_session.refresh_from_db()
        assert view_session.completion_rate == 0.25  # 1 of 4 pages viewed

        # View page 2
        public_client.post('/api/v1/page-views/record/', {
            'view_session': view_session.id, 'page_number': 2, 'duration_seconds': 5
        })
        view_session.refresh_from_db()
        assert view_session.completion_rate == 0.50  # 2 of 4 pages viewed

        # View page 1 again (should not increase completion rate)
        public_client.post('/api/v1/page-views/record/', {
            'view_session': view_session.id, 'page_number': 1, 'duration_seconds': 10
        })
        view_session.refresh_from_db()
        assert view_session.completion_rate == 0.50  # Still 2 unique pages viewed

        # View page 4
        public_client.post('/api/v1/page-views/record/', {
            'view_session': view_session.id, 'page_number': 4, 'duration_seconds': 8
        })
        view_session.refresh_from_db()
        assert view_session.completion_rate == 0.75  # 3 of 4 pages viewed


@pytest.mark.django_db
class TestViewSessionViewSet:
    @patch('sharelinks.views.settings.GEOIP')
    def test_create_view_records_ip_and_user_agent(self, mock_geoip, public_client, share_link):
        """Test that creating a view session records the IP, User-Agent, and location."""
        # Mock the GeoIP2 lookup
        mock_city_data = {
            'city': 'Mountain View',
            'country_name': 'United States',
            'latitude': 37.422,
            'longitude': -122.084,
        }
        mock_geoip.city.return_value = mock_city_data
        assert ViewSession.objects.count() == 0

        user_agent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36"

        response = public_client.post(
            '/api/v1/view-sessions/',
            {'share_link': share_link.id},
            HTTP_USER_AGENT=user_agent,
            REMOTE_ADDR='98.137.11.155'  # Example public IP for Yahoo
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert ViewSession.objects.count() == 1

        view_session = ViewSession.objects.first()
        assert view_session.share_link == share_link
        assert view_session.ip_address == '98.137.11.155'
        assert view_session.user_agent == user_agent
        assert view_session.city == 'Mountain View'
        assert view_session.country == 'United States'
        assert view_session.latitude == 37.422
        assert view_session.longitude == -122.084

    def test_record_download(self, public_client, share_link):
        """Test that a download can be recorded for a view session."""
        # 1. Create a View session
        view_session = ViewSession.objects.create(share_link=share_link)
        assert view_session.downloaded_at is None

        # 2. Record the download
        url = f'/api/v1/view-sessions/{view_session.id}/record-download/'
        response = public_client.post(url)
        assert response.status_code == status.HTTP_200_OK

        # 3. Verify the timestamp is set
        view_session.refresh_from_db()
        assert view_session.downloaded_at is not None
        first_download_time = view_session.downloaded_at

        # 4. Try to record again - timestamp should not change
        response_2 = public_client.post(url)
        assert response_2.status_code == status.HTTP_200_OK
        view_session.refresh_from_db()
        assert view_session.downloaded_at == first_download_time

    def test_create_view_session_for_dataroom_link(self, public_client, dataroom, user):
        """Test that creating a view session for a dataroom link works."""
        link = ShareLink.objects.create(dataroom=dataroom, created_by=user)
        assert ViewSession.objects.count() == 0

        response = public_client.post(
            '/api/v1/view-sessions/',
            {'share_link': link.id},
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert ViewSession.objects.count() == 1
        vs = ViewSession.objects.first()
        assert vs.share_link == link

    def test_record_download_for_non_existent_session(self, public_client):
        """Test that recording a download for a non-existent session returns 404."""
        non_existent_id = '01J4Z7YJ8ZJ4Z7YJ8ZJ4Z7YJ8Z'
        url = f'/api/v1/view-sessions/{non_existent_id}/record-download/'
        response = public_client.post(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND
