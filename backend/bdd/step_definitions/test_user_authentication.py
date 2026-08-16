import re
from urllib.parse import urlparse, parse_qs
import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.urls import reverse
from pytest_bdd import scenario, given, when, then, parsers
from rest_framework import status

from core.models import AppConfiguration

User = get_user_model()


@pytest.mark.django_db
@scenario('../features/user_authentication.feature', 'Successful Login')
def test_successful_login():
    """Test user can log in with correct credentials."""
    pass


@pytest.mark.django_db
@scenario('../features/user_authentication.feature', 'Failed Login with incorrect password')
def test_failed_login():
    """Test user cannot log in with incorrect credentials."""
    pass


@pytest.mark.django_db
@scenario('../features/user_authentication.feature', 'Successful Logout')
def test_successful_logout():
    """Test user can log out and invalidate their token."""
    pass


@pytest.mark.django_db
@scenario('../features/user_authentication.feature', 'Public signup in Chinese language sends Chinese verification email and activates account with Chinese preference')
def test_signup_chinese_verification_and_activation():
    """Test public signup in Chinese sends Chinese email and activates account with Chinese preference."""
    pass


@given("a registered user exists", target_fixture="user_context")
def registered_user(user, public_client):
    """
    Provides a user instance created by a fixture and a public (unauthenticated) API client.
    The `user` fixture creates a user with the default password 'password'.
    """
    return {
        'user': user,
        'client': public_client,
        'response': None,
        'tokens': None,
    }


@when("I log in with the correct credentials")
def login_with_correct_credentials(user_context):
    """Attempt to log in with the user's correct email and password."""
    user = user_context['user']
    client = user_context['client']
    login_data = {'email': user.email, 'password': 'password123'}
    url = reverse('token_obtain_pair')
    response = client.post(url, login_data)
    user_context['response'] = response
    if response.status_code == status.HTTP_200_OK:
        user_context['tokens'] = response.data


@then("I should receive an access and refresh token")
def check_for_tokens(user_context):
    """Verify the login was successful and tokens were returned."""
    response = user_context['response']
    assert response.status_code == status.HTTP_200_OK
    assert 'access' in response.data
    assert 'refresh' in response.data


@when("I log in with an incorrect password")
def login_with_incorrect_password(user_context):
    """Attempt to log in with the user's email and a wrong password."""
    user = user_context['user']
    client = user_context['client']
    login_data = {'email': user.email, 'password': 'wrongpassword'}
    url = reverse('token_obtain_pair')
    response = client.post(url, login_data)
    user_context['response'] = response


@then("the login attempt should fail with an unauthorized error")
def check_for_unauthorized_error(user_context):
    """Verify the server responded with a 401 Unauthorized status."""
    response = user_context['response']
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@given("I am logged in")
def i_am_logged_in(user_context):
    """Log the user in and store their tokens in the context."""
    login_with_correct_credentials(user_context)
    check_for_tokens(user_context)  # This asserts a successful login
    assert user_context['tokens'] is not None


@when("I log out")
def i_log_out(user_context):
    """Send a logout request using the user's tokens to blacklist the refresh token."""
    client = user_context['client']
    tokens = user_context['tokens']

    # Authenticate the request for logout
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {tokens["access"]}')

    logout_url = reverse('logout')
    logout_data = {'refresh': tokens['refresh']}
    response = client.post(logout_url, logout_data)
    user_context['response'] = response


@then("my refresh token should be invalidated")
def check_refresh_token_invalidated(user_context):
    """Verify the logout was successful and the refresh token can no longer be used."""
    assert user_context['response'].status_code == status.HTTP_205_RESET_CONTENT

    client = user_context['client']
    tokens = user_context['tokens']

    # Clear authentication for the next request
    client.credentials()

    refresh_url = reverse('token_refresh')
    refresh_data = {'refresh': tokens['refresh']}
    response = client.post(refresh_url, refresh_data)

    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert 'token_not_valid' in response.data.get('code', '')


@given("public signup is enabled")
def public_signup_enabled():
    """Ensure public signup configuration is enabled."""
    AppConfiguration.objects.update_or_create(
        key='ENABLE_PUBLIC_SIGNUP',
        defaults={'value': 'true', 'description': 'Enable public signup.'}
    )
    cache.clear()
    yield
    cache.clear()


@when(parsers.parse('I request signup in Chinese language with name "{name}", email "{email}", and password "{password}"'), target_fixture="signup_context")
def request_signup_in_chinese(public_client, monkeypatch, mailoutbox, name, email, password):
    """Submit a signup request with Accept-Language set to Chinese."""
    mailoutbox.clear()

    # Synchronously execute celery tasks queued in on_commit
    monkeypatch.setattr('core.views.transaction.on_commit', lambda fn: fn())

    url = reverse('signup_request')
    response = public_client.post(
        url,
        {'name': name, 'email': email, 'password': password},
        HTTP_ACCEPT_LANGUAGE='zh-CN,zh;q=0.9,zh-hans;q=0.8'
    )
    return {
        'response': response,
        'email': email,
        'client': public_client,
    }


@then(parsers.parse('a verification email in Chinese should be sent to "{email}"'))
def verification_email_sent_in_chinese(signup_context, mailoutbox, email):
    """Verify that a verification email rendered in Chinese was delivered."""
    assert signup_context['response'].status_code == status.HTTP_202_ACCEPTED
    assert len(mailoutbox) >= 1
    msg = [m for m in mailoutbox if email in m.to][0]
    assert msg.subject == "验证您的 Coneshare 账号"
    assert "欢迎使用 Coneshare。" in msg.body
    signup_context['email_message'] = msg


@when("I activate the account using the verification link from the email")
def activate_account_from_email_link(signup_context):
    """Extract uid and token from verification email and submit to signup_verify."""
    msg = signup_context['email_message']
    match = re.search(r'uid=([A-Za-z0-9_\-]+)&(?:amp;)?token=([A-Za-z0-9_\-]+)', msg.body)
    assert match is not None, f"Could not find uid and token in email body:\n{msg.body}"
    uid, token = match.group(1), match.group(2)

    client = signup_context['client']
    verify_url = reverse('signup_verify')
    verify_response = client.post(verify_url, {'uid': uid, 'token': token})
    signup_context['verify_response'] = verify_response


@then("the account should be active with Chinese language preference")
def account_active_with_chinese_preference(signup_context):
    """Verify that account is activated and has Chinese language set in profile response and database."""
    verify_response = signup_context['verify_response']
    assert verify_response.status_code == status.HTTP_200_OK
    assert verify_response.data['user']['language'] == 'zh-hans'
    assert 'access' in verify_response.data
    assert 'refresh' in verify_response.data

    user = User.objects.get(email=signup_context['email'])
    assert user.is_active is True
    assert user.language == 'zh-hans'

