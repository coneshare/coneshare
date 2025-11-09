import pytest
from unittest.mock import patch
from pytest_bdd import scenario, given, when, then, parsers

from documents.models import Document
from sharelinks.models import ShareLink, ViewSession, PageView

pytest_plugins = "bdd.step_definitions.common_steps"


@pytest.mark.django_db
@scenario('../features/view_tracking.feature', "A viewer's activity is tracked for a document")
def test_viewers_activity_is_tracked():
    pass


@given("I have a document with a share link", target_fixture="share_link")
def document_with_share_link(user_context):
    """Creates a document and a share link for it."""
    user = user_context['user']
    doc = Document.objects.create(
        name="Analytics Report.pdf",
        organization=user.organization,
        created_by=user,
        status='ready',
    )
    return ShareLink.objects.create(document=doc, created_by=user)


@when(parsers.parse('a viewer creates a view session for the share link from "{ip}" with user agent "{user_agent}"'), target_fixture="view_session")
def create_view_session(public_client, share_link, ip, user_agent):
    """Simulates creating a view session by calling the API with context."""
    mock_city_data = {'city': 'Mountain View', 'country_name': 'United States', 'latitude': 37.422, 'longitude': -122.084}
    with patch('documents.views.settings.GEOIP') as mock_geoip:
        mock_geoip.city.return_value = mock_city_data
        response = public_client.post(
            '/api/v1/view-sessions/',
            {'share_link': share_link.id},
            REMOTE_ADDR=ip,
            HTTP_USER_AGENT=user_agent
        )
    assert response.status_code == 201
    return ViewSession.objects.get(id=response.data['id'])


@when(parsers.parse('the viewer spends {duration:d} seconds on page {page:d}'))
def viewer_spends_time_on_page(public_client, view_session, duration, page):
    """Simulates the frontend sending a page view tracking request."""
    data = {
        'view_session': view_session.id,
        'page_number': page,
        'duration_seconds': duration,
    }
    response = public_client.post('/api/v1/page-views/record/', data)
    assert response.status_code == 200
    # Refresh the session object to get the updated duration from the database
    view_session.refresh_from_db()


@then(parsers.parse('a page view should be recorded for page {page:d} with a duration of {duration:d} seconds'))
def page_view_is_recorded(view_session, page, duration):
    """Checks that a PageView record was created with the correct data."""
    assert PageView.objects.filter(
        view_session=view_session,
        page_number=page,
        duration_seconds=duration
    ).exists()


@then(parsers.parse('the total view duration for the session should be {total_duration:d} seconds'))
def total_view_duration_is_updated(view_session, total_duration):
    """Checks that the parent View's total duration has been updated."""
    assert view_session.duration_seconds == total_duration


@then(parsers.parse('the view session should have IP "{ip}" and user agent "{user_agent}"'))
def view_session_has_context(view_session, ip, user_agent):
    """Checks that the View has the correct IP and user agent recorded."""
    assert view_session.ip_address == ip
    assert view_session.user_agent == user_agent


@then(parsers.parse('the view session should have location data for "{location}"'))
def view_session_has_location(view_session, location):
    """Checks that the View has the correct location recorded."""
    city, country = [part.strip() for part in location.split(',')]
    assert view_session.city == city
    assert view_session.country == country
