import pytest
from unittest.mock import patch
from pytest_bdd import scenario, given, when, then, parsers

from documents.models import Document, DocumentVersion
from sharelinks.models import ShareLink, EmailVerificationToken, ViewSession

pytest_plugins = "bdd.step_definitions.common_steps"


@pytest.mark.django_db
@scenario('../features/share_link_email_protection.feature', 'A viewer accesses a link that requires email but no verification')
def test_email_required_no_verification():
    pass


@pytest.mark.django_db
@scenario('../features/share_link_email_protection.feature', 'A viewer accesses a link that requires email verification')
def test_email_required_with_verification():
    pass


@pytest.mark.django_db
@scenario('../features/share_link_email_protection.feature', 'A viewer uses a valid magic link to access a document')
def test_viewer_uses_magic_link():
    pass


@pytest.mark.django_db
@scenario('../features/share_link_email_protection.feature', "A viewer's email is recorded for a link that requires email")
def test_viewer_email_is_recorded():
    pass


@given("I have a document with a share link that requires email", target_fixture="share_link_context")
def share_link_requires_email(user_context):
    user = user_context['user']
    doc = Document.objects.create(
        name="Test Doc.pdf", organization=user.organization, created_by=user, status='ready'
    )
    DocumentVersion.objects.create(document=doc, version_number=1, is_primary=True)
    share_link = ShareLink.objects.create(
        document=doc, created_by=user, requires_email=True
    )
    return {'share_link': share_link}


@given("I have a document with a share link that requires email verification", target_fixture="share_link_context")
def share_link_requires_email_verification(user_context):
    user = user_context['user']
    doc = Document.objects.create(
        name="Secure Doc.pdf", organization=user.organization, created_by=user, status='ready'
    )
    DocumentVersion.objects.create(document=doc, version_number=1, is_primary=True)
    share_link = ShareLink.objects.create(
        document=doc, created_by=user, requires_email=True, requires_email_verification=True
    )
    return {'share_link': share_link}


@when(parsers.parse('an anonymous viewer requests access with the email "{email}"'), target_fixture="api_response_context")
def request_access(public_client, share_link_context, email):
    share_link = share_link_context['share_link']
    url = f'/api/v1/links/{share_link.slug}/request-access/'
    
    # Use patch context manager if the step might trigger an email
    with patch('documents.views.send_mail') as mock_send_mail:
        response = public_client.post(url, {'email': email})
        return {'response': response, 'mock_send_mail': mock_send_mail}


@then("they should be granted immediate access")
def check_immediate_access(public_client, share_link_context, api_response_context):
    response = api_response_context['response']
    assert response.status_code == 200
    assert response.json()['verification_required'] is False

    # Verify that the session is now authorized to view the data
    share_link = share_link_context['share_link']
    view_url = f'/api/v1/links/{share_link.slug}/view-data/'
    view_response = public_client.get(view_url)
    assert view_response.status_code == 200


@when("they create a view session for the share link", target_fixture="view_session")
def create_view_session(public_client, share_link_context):
    share_link = share_link_context['share_link']
    response = public_client.post('/api/v1/view-sessions/', {'share_link': share_link.id})
    assert response.status_code == 201
    return ViewSession.objects.get(id=response.data['id'])


@then(parsers.parse('the view session should be associated with the email "{email}"'))
def check_view_session_email(view_session, email):
    assert view_session.viewer is not None
    assert view_session.viewer.email == email
    assert view_session.viewer_email == email


@then(parsers.parse('a verification email should be sent to "{email}"'))
def check_email_sent(api_response_context, email):
    response = api_response_context['response']
    mock_send_mail = api_response_context['mock_send_mail']
    assert response.status_code == 200
    assert response.json()['verification_required'] is True
    mock_send_mail.assert_called_once()
    # Check recipient list of the call
    call_args, call_kwargs = mock_send_mail.call_args
    assert email in call_kwargs['recipient_list']


@then("they should not be granted immediate access")
def check_no_immediate_access(public_client, share_link_context):
    # Verify that the session is NOT authorized
    share_link = share_link_context['share_link']
    view_url = f'/api/v1/links/{share_link.slug}/view-data/'
    view_response = public_client.get(view_url)
    assert view_response.status_code == 401


@given(parsers.parse('a verification token exists for the email "{email}"'), target_fixture="verification_token")
def verification_token(share_link_context, email):
    share_link = share_link_context['share_link']
    return EmailVerificationToken.objects.create(share_link=share_link, email=email)


@when("the viewer accesses the link with the valid verification token", target_fixture="view_response")
def access_with_token(public_client, share_link_context, verification_token):
    share_link = share_link_context['share_link']
    url = f'/api/v1/links/{share_link.slug}/view-data/?accessToken={verification_token.token}'
    return public_client.get(url)


@then("they should be granted access to the document")
def check_access_granted_with_token(view_response):
    assert view_response.status_code == 200
    assert 'id' in view_response.json()


@then("the verification token should be consumed")
def check_token_consumed(verification_token):
    assert not EmailVerificationToken.objects.filter(id=verification_token.id).exists()
