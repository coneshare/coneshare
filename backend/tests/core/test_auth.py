import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status

from core.models import AppConfiguration, LoginActivity, Organization
from core.tokens import signup_activation_token_generator

User = get_user_model()


def _set_public_signup(enabled: bool):
    AppConfiguration.objects.update_or_create(
        key='ENABLE_PUBLIC_SIGNUP',
        defaults={
            'value': 'true' if enabled else 'false',
            'description': 'Enable public signup with email verification.',
        }
    )
    cache.delete('app_config:ENABLE_PUBLIC_SIGNUP')
    cache.clear()


# @pytest.mark.django_db
# def test_user_registration(public_client):
#     """
#     Test that a new user can be registered via the API.
#     The new user should be automatically assigned to the default organization.
#     """
#     register_data = {
#         'email': 'newuser@coneshare.com',
#         'password': 'newpassword123',
#         'first_name': 'New',
#         'last_name': 'User',
#     }
#     url = reverse('register')
#     response = public_client.post(url, register_data)
#     assert response.status_code == status.HTTP_201_CREATED
#     assert response.data['email'] == register_data['email']
#     # Verify user exists in DB and is assigned to the default organization.
#     # The `post_migrate` signal creates the "Default Organization".
#     assert User.objects.filter(email=register_data['email']).exists()
#     new_user = User.objects.get(email=register_data['email'])
#     assert new_user.organization is not None
#     assert new_user.organization.name == "Default Organization"


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


@pytest.mark.django_db
def test_create_superuser_via_manager():
    """
    Test that the custom UserManager's `create_superuser` method successfully
    creates a superuser and assigns the default organization.
    This test directly invokes the manager method to reproduce the `createsuperuser`
    command failure if the manager is misconfigured.
    """
    email = 'superuser@coneshare.com'
    username = 'superuser'
    password = 'superpassword123'

    # This call will fail with an IntegrityError if the organization is not set.
    user = User.objects.create_superuser(
        email=email,
        username=username,
        password=password
    )

    # Verify standard superuser attributes
    assert user.email == email
    assert user.username == username
    assert user.is_staff is True
    assert user.is_superuser is True
    assert user.check_password(password) is True

    # Verify custom attributes set by the manager
    assert user.organization is not None
    assert user.organization.name == "Default Organization"
    assert user.role == 'admin'


@pytest.mark.django_db
class TestLoginActivitySignal:
    def test_login_creates_activity_record(self, public_client, user):
        """
        Tests that a successful login via the token endpoint creates a LoginActivity record.
        """
        assert LoginActivity.objects.count() == 0

        login_data = {
            'email': user.email,
            'password': 'password'
        }
        url = reverse('token_obtain_pair')

        public_client.post(
            url,
            login_data,
            HTTP_USER_AGENT='Test Browser',
            REMOTE_ADDR='192.168.1.1'
        )

        assert LoginActivity.objects.count() == 1
        activity = LoginActivity.objects.first()
        assert activity.user == user
        assert activity.ip_address == '192.168.1.1'
        assert activity.user_agent == 'Test Browser'

    def test_failed_login_does_not_create_activity_record(self, public_client, user):
        """
        Tests that a failed login attempt does not create a LoginActivity record.
        """
        assert LoginActivity.objects.count() == 0

        login_data = {
            'email': user.email,
            'password': 'wrongpassword'
        }
        url = reverse('token_obtain_pair')
        public_client.post(url, login_data)

        assert LoginActivity.objects.count() == 0


@pytest.mark.django_db
def test_signup_request_rejected_when_disabled(public_client):
    _set_public_signup(False)
    response = public_client.post(reverse('signup_request'), {
        'email': 'newuser@example.com',
        'password': 'StrongPassword123!',
        'name': 'New User',
    })
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_signup_request_creates_inactive_user_and_sends_email(public_client, monkeypatch):
    _set_public_signup(True)
    calls = {'count': 0}

    def _fake_delay(*args, **kwargs):
        calls['count'] += 1
        return None

    monkeypatch.setattr('core.views.transaction.on_commit', lambda fn: fn())
    monkeypatch.setattr('core.views.send_signup_verification_email_task.delay', _fake_delay)

    response = public_client.post(reverse('signup_request'), {
        'email': 'newuser@example.com',
        'password': 'StrongPassword123!',
        'name': 'New User',
    })

    assert response.status_code == status.HTTP_202_ACCEPTED
    created_user = User.objects.get(email='newuser@example.com')
    assert created_user.is_active is False
    assert created_user.organization is not None
    assert calls['count'] == 1


@pytest.mark.django_db
def test_signup_request_refreshes_existing_inactive_user(public_client):
    _set_public_signup(True)
    org = Organization.objects.first()
    user = User.objects.create_user(
        email='verifyme@example.com',
        username='verifyme@example.com',
        organization=org,
        password='StrongPassword123!',
        name='Old Name',
        is_active=False,
    )
    old_password_hash = user.password

    response = public_client.post(reverse('signup_request'), {
        'email': 'verifyme@example.com',
        'password': 'NewStrongPassword123!',
        'name': 'Verify Me',
    })
    assert response.status_code == status.HTTP_202_ACCEPTED
    user.refresh_from_db()
    assert user.name == 'Verify Me'
    assert user.password != old_password_hash
    assert user.check_password('NewStrongPassword123!')


@pytest.mark.django_db
def test_signup_verify_activates_user_and_returns_jwt(public_client):
    _set_public_signup(True)
    org = Organization.objects.first()
    user = User.objects.create_user(
        email='verifyme@example.com',
        username='verifyme@example.com',
        organization=org,
        password='StrongPassword123!',
        name='Verify Me',
        is_active=False,
    )
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = signup_activation_token_generator.make_token(user)

    response = public_client.post(reverse('signup_verify'), {'uid': uid, 'token': token})
    assert response.status_code == status.HTTP_200_OK
    user.refresh_from_db()
    assert user.is_active is True
    assert 'access' in response.data
    assert 'refresh' in response.data


@pytest.mark.django_db
def test_signup_verify_rejects_invalid_token(public_client):
    _set_public_signup(True)
    org = Organization.objects.first()
    user = User.objects.create_user(
        email='expired@example.com',
        username='expired@example.com',
        organization=org,
        password='StrongPassword123!',
        is_active=False,
    )
    uid = urlsafe_base64_encode(force_bytes(user.pk))

    response = public_client.post(reverse('signup_verify'), {'uid': uid, 'token': 'invalid-token'})
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'invalid' in response.data['detail'].lower()


@pytest.mark.django_db
def test_signup_verify_rejects_reused_token(public_client):
    _set_public_signup(True)
    org = Organization.objects.first()
    user = User.objects.create_user(
        email='reused@example.com',
        username='reused@example.com',
        organization=org,
        password='StrongPassword123!',
        is_active=False,
    )
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = signup_activation_token_generator.make_token(user)

    first_response = public_client.post(reverse('signup_verify'), {'uid': uid, 'token': token})
    assert first_response.status_code == status.HTTP_200_OK

    second_response = public_client.post(reverse('signup_verify'), {'uid': uid, 'token': token})
    assert second_response.status_code == status.HTTP_400_BAD_REQUEST
    assert 'already verified' in second_response.data['detail'].lower()


@pytest.mark.django_db
def test_public_settings_returns_signup_toggle(public_client):
    _set_public_signup(False)
    response = public_client.get(reverse('public_settings'))
    assert response.status_code == status.HTTP_200_OK
    assert response.data['enable_public_signup'] is False

    _set_public_signup(True)
    response = public_client.get(reverse('public_settings'))
    assert response.status_code == status.HTTP_200_OK
    assert response.data['enable_public_signup'] is True
