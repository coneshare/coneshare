import pytest
from django.urls import reverse
from pytest_bdd import scenario, given, when, then
from rest_framework import status


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
    login_data = {'email': user.email, 'password': 'password'}
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
