import pytest
from pytest_bdd import given, parsers, scenario, then, when
from rest_framework import status

from documents.models import Document, ShareLink, ViewSession, Viewer

pytest_plugins = "bdd.step_definitions.common_steps"


@pytest.mark.django_db
@scenario('../features/share_link_analytics.feature', 'A viewer accesses a document through a share link')
def test_share_link_view_tracking():
    pass


@given(parsers.parse('I have a document named "{filename}"'), target_fixture="document")
def document(user_context, filename):
    """Creates a document owned by the authenticated user."""
    doc = Document.objects.create(
        name=filename,
        organization=user_context["user"].organization,
        created_by=user_context["user"]
    )
    user_context["document"] = doc
    return doc


@when("I create a share link for that document")
def create_share_link(user_context, document):
    """Creates a share link for the document."""
    api_client = user_context["api_client"]
    response = api_client.post('/api/v1/share-links/', {
        'document': document.id,
        'name': 'Test Share Link'
    })
    assert response.status_code == status.HTTP_201_CREATED, response.data
    user_context["share_link_id"] = response.data["id"]


@when(parsers.parse('an external viewer with email "{email}" views the document via the share link'))
def external_viewer_accesses_link(user_context, email):
    """Simulates a view being created for the share link."""
    api_client = user_context["api_client"]
    share_link_id = user_context["share_link_id"]
    response = api_client.post('/api/v1/views/', {
        'share_link': share_link_id,
        'viewer_email': email,
        'duration_seconds': 120,
        'completion_rate': 0.95
    })
    assert response.status_code == status.HTTP_201_CREATED, response.data


@then(parsers.parse('a "Viewer" record should exist for "{email}"'))
def viewer_record_exists(user_context, email):
    """Checks that a Viewer record was created."""
    organization = user_context["user"].organization
    assert Viewer.objects.filter(
        organization=organization, email=email
    ).exists()


@then("a \"ViewSession\" record should exist, linking the viewer and the share link")
def view_record_links_entities(user_context):
    """Checks that the ViewSession connects the ShareLink and the Viewer."""
    share_link = ShareLink.objects.get(id=user_context["share_link_id"])
    viewer = Viewer.objects.get(email="viewer@example.com")
    assert ViewSession.objects.filter(share_link=share_link, viewer=viewer).exists()
