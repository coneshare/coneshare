import pytest
from pytest_bdd import scenario, given, when, then
from rest_framework import status

from documents.models import Document
from sharelinks.models import ShareLink

pytest_plugins = "bdd.step_definitions.common_steps"


@pytest.mark.django_db
@scenario('../features/share_link_nda.feature', 'A viewer accepts the NDA and gains access to the document')
def test_share_link_nda_gate():
    pass


@given("I have a document with a share link that requires NDA", target_fixture="context")
def share_link_requires_nda(user_context):
    user = user_context['user']
    doc = Document.objects.create(
        organization=user.organization,
        created_by=user,
        name="Confidential Plan.pdf",
        status='ready'
    )
    # Create version & page so it's fully viewable
    version = doc.versions.create(
        is_primary=True,
        has_pages=True,
        num_pages=1,
        version_number=1
    )
    version.pages.create(page_number=1, storage_key=f"pages/{doc.id}-1.png")

    link = ShareLink.objects.create(
        document=doc,
        created_by=user,
        require_nda=True,
        nda_text="Please sign this NDA text.",
        nda_version=1
    )
    return {'share_link': link}


@when("an anonymous viewer requests access to the view-data endpoint", target_fixture="context")
def request_access_view_data(context, public_client):
    link = context['share_link']
    url = f'/api/v1/links/{link.slug}/view-data/'
    response = public_client.get(url)
    context['response'] = response
    return context


@then("they should be denied access with an NDA required message")
def check_nda_required(context):
    response = context['response']
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    data = response.json()
    assert data['protectionType'] == 'nda'
    assert data['require_nda'] is True
    assert data['nda_text'] == "Please sign this NDA text."


@when("they submit the NDA acceptance request", target_fixture="context")
def submit_nda_acceptance(context, public_client):
    link = context['share_link']
    url = f'/api/v1/links/{link.slug}/accept-nda/'
    response = public_client.post(url)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert 'view_session_id' in data
    context['view_session_id'] = data['view_session_id']
    return context


@then("they should receive a view session ID")
def check_view_session_id(context):
    assert 'view_session_id' in context
    assert context['view_session_id'] is not None


@then("they should be granted access to the document")
def check_document_access(context, public_client):
    link = context['share_link']
    url = f'/api/v1/links/{link.slug}/view-data/'
    response = public_client.get(url, {'view_session_id': context['view_session_id']})
    assert response.status_code == status.HTTP_200_OK
    assert 'id' in response.json()
