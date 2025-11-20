import pytest
from pytest_bdd import given, parsers, scenario, then, when
from rest_framework import status

from documents.models import Document
from sharelinks.models import ShareLink, ViewSession, Viewer

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
    """Creates a share link for the document that requires email."""
    api_client = user_context["api_client"]
    response = api_client.post('/api/v1/share-links/', {
        'document': document.id,
        'name': 'Test Share Link',
        'requires_email': True,
        'requires_email_verification': False  # For simplicity in this test
    })
    assert response.status_code == status.HTTP_201_CREATED, response.data
    user_context["share_link_id"] = response.data["id"]


@when(parsers.parse('an external viewer with email "{email}" views the document via the share link'))
def external_viewer_accesses_link(public_client, user_context, email):
    """
    Simulates a viewer's full flow: requesting access with an email and then
    creating a view session.
    """
    share_link = ShareLink.objects.get(id=user_context["share_link_id"])

    # Step 1: Viewer provides email to satisfy the link's requirement, which
    # authorizes their session.
    request_access_url = f'/api/v1/links/{share_link.slug}/request-access/'
    access_response = public_client.post(request_access_url, {'email': email})
    assert access_response.status_code == status.HTTP_200_OK, access_response.json()

    # Step 2: The viewer's client creates a view session. The backend will now
    # find the email in the authorized session.
    response = public_client.post('/api/v1/view-sessions/', {
        'share_link': share_link.id,
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
