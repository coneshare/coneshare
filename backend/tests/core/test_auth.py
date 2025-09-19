import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status

User = get_user_model()


@pytest.mark.django_db
def test_user_registration(public_client):
    """
    Test that a new user can be registered via the API.
    The new user should be automatically assigned to the default organization.
    """
    register_data = {
        'email': 'newuser@coneshare.com',
        'password': 'newpassword123',
        'first_name': 'New',
        'last_name': 'User',
    }
    url = reverse('register')
    response = public_client.post(url, register_data)

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data['email'] == register_data['email']

    # Verify user exists in DB and is assigned to the default organization.
    # The `post_migrate` signal creates the "Default Organization".
    assert User.objects.filter(email=register_data['email']).exists()
    new_user = User.objects.get(email=register_data['email'])
    assert new_user.organization is not None
    assert new_user.organization.name == "Default Organization"


@pytest.mark.django_db
def test_login_success(public_client, user):
    """
    Test that a user can successfully log in and receive access and refresh tokens.
    """
    # The user fixture creates a user with password 'password'
    login_data = {
        'email': user.email,
        'password': 'password'
    }
    url = reverse('token_obtain_pair')
    response = public_client.post(url, login_data)

    assert response.status_code == status.HTTP_200_OK
    assert 'access' in response.data
    assert 'refresh' in response.data


@pytest.mark.django_db
def test_login_failure_wrong_password(public_client, user):
    """
    Test that a login attempt with an incorrect password fails.
    """
    login_data = {
        'email': user.email,
        'password': 'wrongpassword'
    }
    url = reverse('token_obtain_pair')
    response = public_client.post(url, login_data)

    assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_token_refresh(public_client, user):
    """
    Test that a valid refresh token can be used to obtain a new access token.
    """
    # First, log in to get a refresh token
    login_data = {'email': user.email, 'password': 'password'}
    login_url = reverse('token_obtain_pair')
    login_response = public_client.post(login_url, login_data)
    refresh_token = login_response.data['refresh']

    # Now, use the refresh token to get a new access token
    refresh_url = reverse('token_refresh')
    refresh_response = public_client.post(refresh_url, {'refresh': refresh_token})

    assert refresh_response.status_code == status.HTTP_200_OK
    assert 'access' in refresh_response.data


@pytest.mark.django_db
def test_logout(public_client, user):
    """
    Test that a user can log out, which blacklists their refresh token,
    preventing it from being used for subsequent token refreshes.
    """
    # Step 1: Log in to get valid access and refresh tokens
    login_data = {'email': user.email, 'password': 'password'}
    login_url = reverse('token_obtain_pair')
    login_response = public_client.post(login_url, login_data)
    assert login_response.status_code == status.HTTP_200_OK
    refresh_token = login_response.data['refresh']
    access_token = login_response.data['access']

    # Step 2: Use the access token to authenticate the logout request
    public_client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
    logout_url = reverse('logout')
    logout_response = public_client.post(logout_url, {'refresh': refresh_token})

    assert logout_response.status_code == status.HTTP_205_RESET_CONTENT

    # Step 3: Verify the refresh token is now blacklisted and cannot be used
    public_client.credentials()  # Clear auth header
    refresh_url = reverse('token_refresh')
    refresh_response = public_client.post(refresh_url, {'refresh': refresh_token})

    assert refresh_response.status_code == status.HTTP_401_UNAUTHORIZED
    assert 'token_not_valid' in refresh_response.data.get('code', '')
