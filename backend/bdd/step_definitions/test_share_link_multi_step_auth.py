import pytest
from pytest_bdd import scenario, given, when, then, parsers

from documents.models import Document, DocumentVersion, ShareLink

pytest_plugins = "bdd.step_definitions.common_steps"


@pytest.mark.django_db
@scenario('../features/share_link_multi_step_auth.feature', 'A viewer successfully navigates a password and email flow')
def test_multi_step_auth():
    pass


@given("I have a document with a share link that requires a password and email", target_fixture="context")
def share_link_with_password_and_email(user_context, share_link_with_password_and_email):
    # The fixtures do all the work. We just need to return them.
    return {'share_link': share_link_with_password_and_email}


@when("a viewer first accesses the link", target_fixture="context")
def access_link_first_time(context, public_client):
    share_link = context['share_link']
    url = f'/api/v1/links/{share_link.slug}/view-data/'
    response = public_client.get(url)
    context['response'] = response
    return context


@then("they should be prompted for a password")
def check_prompted_for_password(context):
    response = context['response']
    assert response.status_code == 401
    assert response.json()['protectionType'] == 'password'


@when(parsers.parse('they submit the correct password "{password}"'), target_fixture="context")
def submit_correct_password(context, public_client, password):
    share_link = context['share_link']
    verify_url = f'/api/v1/links/{share_link.slug}/verify-password/'
    response = public_client.post(verify_url, {'password': password})
    assert response.status_code == 200

    # Now, re-fetch the view data to see the next prompt
    view_url = f'/api/v1/links/{share_link.slug}/view-data/'
    view_response = public_client.get(view_url)
    context['response'] = view_response
    return context


@then("they should be prompted for an email")
def check_prompted_for_email(context):
    response = context['response']
    assert response.status_code == 401
    assert response.json()['protectionType'] == 'email'


@when(parsers.parse('they submit the email "{email}"'), target_fixture="context")
def submit_email(context, public_client, email):
    share_link = context['share_link']
    request_url = f'/api/v1/links/{share_link.slug}/request-access/'
    response = public_client.post(request_url, {'email': email})
    assert response.status_code == 200

    # Finally, re-fetch the view data to gain access
    view_url = f'/api/v1/links/{share_link.slug}/view-data/'
    view_response = public_client.get(view_url)
    context['response'] = view_response
    return context


@then("they should be granted access to the document")
def check_access_granted(context):
    response = context['response']
    assert response.status_code == 200
    assert 'id' in response.json()
