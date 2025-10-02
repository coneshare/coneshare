import pytest
from pytest_bdd import scenario, given, when, then, parsers

from documents.models import Document, ShareLink, View, PageView

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


@when('a viewer creates a view session for the share link', target_fixture="view_session")
def create_view_session(share_link):
    """Simulates creating a view session, similar to what the frontend would do."""
    # In a real frontend flow, this would be a POST to /api/v1/views/
    # For simplicity in this test, we create it directly.
    return View.objects.create(share_link=share_link)


@when(parsers.parse('the viewer spends {duration:d} seconds on page {page:d}'))
def viewer_spends_time_on_page(public_client, view_session, duration, page):
    """Simulates the frontend sending a page view tracking request."""
    data = {
        'view': view_session.id,
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
        view=view_session,
        page_number=page,
        duration_seconds=duration
    ).exists()


@then(parsers.parse('the total view duration for the session should be {total_duration:d} seconds'))
def total_view_duration_is_updated(view_session, total_duration):
    """Checks that the parent View's total duration has been updated."""
    assert view_session.duration_seconds == total_duration
