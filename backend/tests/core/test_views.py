import io
import pytest
from PIL import Image
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from core.models import APIKey, Organization, UserGroup
from core.authentication import generate_raw_api_key
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


@pytest.fixture
def admin_user(db, organization):
    """Fixture for a user with staff and superuser privileges."""
    return User.objects.create_user(
        username="admin@example.com",
        email="admin@example.com",
        password="password123",
        organization=organization,
        is_staff=True,
        is_superuser=True,
        role="admin",
    )


@pytest.fixture
def admin_client(admin_user):
    """Fixture for an API client authenticated as the admin user."""
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def other_org_user(db):
    """Fixture to create a user in a different organization."""
    other_org = Organization.objects.create(name="Other Org")
    return User.objects.create_user(
        username='other@example.com',
        email='other@example.com',
        password='password123',
        organization=other_org,
        role='member'
    )


@pytest.mark.django_db
def test_list_organizations(admin_client, organization):
    """Ensure we can list organizations."""
    url = reverse('organization-list')
    response = admin_client.get(url, format='json')
    assert response.status_code == status.HTTP_200_OK
    assert len(response.data) == 1
    assert response.data[0]['name'] == organization.name


@pytest.mark.django_db
def test_list_users(admin_client, admin_user, organization):
    """Ensure we can list users."""
    User.objects.create_user(
        username='user2@example.com',
        email='user2@example.com',
        organization=organization
    )
    url = reverse('admin-user-list')
    response = admin_client.get(url, format='json')
    assert response.status_code == status.HTTP_200_OK
    assert response.data['count'] == 2
    emails = {user['email'] for user in response.data['results']}
    assert admin_user.email in emails
    assert 'user2@example.com' in emails


# @pytest.mark.django_db
# def test_create_user(admin_client):
#     """Ensure we can create a new user."""
#     url = reverse('user-list')
#     data = {
#         'email': 'newuser@example.com',
#         'password': 'password456'
#     }
#     response = admin_client.post(url, data, format='json')
#     assert response.status_code == status.HTTP_201_CREATED
#     assert User.objects.count() == 2
#     assert 'password' not in response.data


@pytest.mark.django_db
def test_groups_endpoint_is_unmounted(admin_client):
    """Ensure the user groups route is unmounted from public API."""
    response = admin_client.get('/api/v1/groups/')
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestUserViewSetPermissions:
    def test_user_can_retrieve_self(self, api_client, user):
        """A regular user can retrieve their own profile."""
        response = api_client.get(f'/api/v1/users/{user.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(user.id)

    def test_user_cannot_retrieve_other_user(self, api_client, user2):
        """A regular user cannot retrieve another user's profile."""
        response = api_client.get(f'/api/v1/users/{user2.id}/')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_user_can_update_self(self, api_client, user):
        """A regular user can update their own profile."""
        data = {'name': 'New Name'}
        response = api_client.patch(f'/api/v1/users/{user.id}/', data)
        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.name == 'New Name'

    def test_user_cannot_escalate_role_via_patch(self, api_client, user):
        """A regular user cannot escalate their role to admin via self-update."""
        assert user.role == 'member'
        response = api_client.patch(f'/api/v1/users/{user.id}/', {'role': 'admin'})
        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.role == 'member'

    def test_user_cannot_manipulate_custom_quota_via_patch(self, api_client, user):
        """A regular user cannot alter their custom file size quota via self-update."""
        assert user.custom_file_size_quota_mb is None
        response = api_client.patch(f'/api/v1/users/{user.id}/', {'custom_file_size_quota_mb': 0})
        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.custom_file_size_quota_mb is None

    def test_user_cannot_manipulate_is_active_via_patch(self, api_client, user):
        """A regular user cannot change is_active status via self-update."""
        assert user.is_active is True
        response = api_client.patch(f'/api/v1/users/{user.id}/', {'is_active': False})
        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.is_active is True

    def test_user_cannot_update_password_via_patch(self, api_client, user):
        """A user cannot update password via self-service PATCH without old_password."""
        response = api_client.patch(f'/api/v1/users/{user.id}/', {'password': 'NewPassword123!'})
        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.check_password('NewPassword123!') is False
        assert user.check_password('password') is True

    def test_user_can_update_profile_with_json(self, api_client, user):
        """UserViewSet supports application/json payloads for profile updates."""
        response = api_client.patch(f'/api/v1/users/{user.id}/', {'name': 'Updated Via JSON'}, format='json')
        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.name == 'Updated Via JSON'

    def test_user_cannot_upload_svg_avatar(self, api_client, user):
        svg_content = b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>'
        svg_file = SimpleUploadedFile("avatar.svg", svg_content, content_type="image/svg+xml")
        response = api_client.patch(f'/api/v1/users/{user.id}/', {'avatar': svg_file}, format='multipart')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'avatar' in response.data

    def test_user_cannot_upload_gif_disguised_as_png_avatar(self, api_client, user):
        buf = io.BytesIO()
        img = Image.new('RGB', (10, 10), color='blue')
        img.save(buf, format='GIF')
        gif_file = SimpleUploadedFile("avatar.png", buf.getvalue(), content_type="image/png")
        response = api_client.patch(f'/api/v1/users/{user.id}/', {'avatar': gif_file}, format='multipart')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'avatar' in response.data

    def test_user_can_upload_valid_png_avatar(self, api_client, user):
        buf = io.BytesIO()
        img = Image.new('RGB', (20, 20), color='green')
        img.save(buf, format='PNG')
        png_file = SimpleUploadedFile("avatar.png", buf.getvalue(), content_type="image/png")
        response = api_client.patch(f'/api/v1/users/{user.id}/', {'avatar': png_file}, format='multipart')
        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.avatar.name.endswith('.png')

    def test_user_cannot_update_other_user(self, api_client, user2):
        """A regular user cannot update another user's profile."""
        data = {'name': 'New Name'}
        response = api_client.patch(f'/api/v1/users/{user2.id}/', data)
        assert response.status_code == status.HTTP_404_NOT_FOUND
        user2.refresh_from_db()
        assert user2.name != 'New Name'

    def test_admin_can_retrieve_other_user_in_org(self, api_client, admin_user, user):
        """An admin can retrieve another user's profile in the same org."""
        api_client.force_authenticate(user=admin_user)
        response = api_client.get(f'/api/v1/admin/users/{user.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(user.id)

    def test_admin_cannot_retrieve_user_in_other_org(self, api_client, admin_user, other_org_user):
        """An admin cannot retrieve a user's profile from another org."""
        api_client.force_authenticate(user=admin_user)
        response = api_client.get(f'/api/v1/admin/users/{other_org_user.id}/')
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_admin_can_update_other_user_in_org(self, api_client, admin_user, user):
        """An admin can update another user's profile in the same org."""
        api_client.force_authenticate(user=admin_user)
        data = {'name': 'Updated by Admin'}
        response = api_client.patch(f'/api/v1/admin/users/{user.id}/', data)
        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.name == 'Updated by Admin'

    def test_admin_cannot_update_user_in_other_org(self, api_client, admin_user, other_org_user):
        """An admin cannot update a user's profile from another org."""
        api_client.force_authenticate(user=admin_user)
        data = {'name': 'Updated by Admin'}
        response = api_client.patch(f'/api/v1/admin/users/{other_org_user.id}/', data)
        assert response.status_code == status.HTTP_404_NOT_FOUND
        other_org_user.refresh_from_db()
        assert other_org_user.name != 'Updated by Admin'


    def test_admin_can_update_custom_quota(self, api_client, admin_user, user):
        """An admin can update another user's custom file size quota in the same org."""
        api_client.force_authenticate(user=admin_user)
        
        # 1. Update custom quota to 123MB
        data = {'custom_file_size_quota_mb': 123}
        response = api_client.patch(f'/api/v1/admin/users/{user.id}/', data, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['custom_file_size_quota_mb'] == 123
        user.refresh_from_db()
        assert user.custom_file_size_quota_mb == 123
        assert user.effective_file_size_quota_mb == 123

        # 2. Reset custom quota to null
        data = {'custom_file_size_quota_mb': None}
        response = api_client.patch(f'/api/v1/admin/users/{user.id}/', data, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['custom_file_size_quota_mb'] is None
        user.refresh_from_db()
        assert user.custom_file_size_quota_mb is None

        # 3. Setting custom quota to empty string resets to null (default quota)
        user.custom_file_size_quota_mb = 123
        user.save()
        data = {'custom_file_size_quota_mb': ''}
        response = api_client.patch(f'/api/v1/admin/users/{user.id}/', data, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['custom_file_size_quota_mb'] is None
        user.refresh_from_db()
        assert user.custom_file_size_quota_mb is None

        # 4. Try to set a negative quota (fails)
        data = {'custom_file_size_quota_mb': -5}
        response = api_client.patch(f'/api/v1/admin/users/{user.id}/', data, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'custom_file_size_quota_mb' in response.data

    def test_admin_can_update_role(self, api_client, admin_user, user):
        """An admin can update another user's role in the same org."""
        api_client.force_authenticate(user=admin_user)
        assert user.role == 'member'
        response = api_client.patch(f'/api/v1/admin/users/{user.id}/', {'role': 'admin'}, format='json')
        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.role == 'admin'

    def test_admin_can_update_is_active(self, api_client, admin_user, user):
        """An admin can deactivate another user in the same org."""
        api_client.force_authenticate(user=admin_user)
        assert user.is_active is True
        response = api_client.patch(f'/api/v1/admin/users/{user.id}/', {'is_active': False}, format='json')
        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.is_active is False


@pytest.mark.django_db
class TestUserViewSetQueryset:
    def test_user_list_only_shows_self(self, api_client, user, user2):
        """A regular user listing users only sees themself."""
        response = api_client.get('/api/v1/users/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['id'] == str(user.id)

    def test_admin_list_shows_all_org_users(self, api_client, admin_user, user, user2, other_org_user):
        """An admin listing users sees all users in their org, but not others."""
        api_client.force_authenticate(user=admin_user)
        response = api_client.get('/api/v1/admin/users/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 3
        ids = {item['id'] for item in response.data['results']}
        assert str(admin_user.id) in ids
        assert str(user.id) in ids
        assert str(user2.id) in ids
        assert str(other_org_user.id) not in ids


@pytest.mark.django_db
def test_public_settings_branding(api_client, organization):
    organization.brand_name = "Public Brand Test"
    organization.brand_website_url = "https://publicbrandtest.com"
    organization.branding_extras = {
        'terms_url': 'https://publicbrandtest.com/terms',
        'privacy_policy_url': 'https://publicbrandtest.com/privacy'
    }
    organization.save()
    
    url = reverse('public_settings')
    response = api_client.get(url)
    assert response.status_code == status.HTTP_200_OK
    assert response.data['brand_name'] == "Public Brand Test"
    assert response.data['brand_website_url'] == "https://publicbrandtest.com"
    assert response.data['terms_url'] == "https://publicbrandtest.com/terms"
    assert response.data['privacy_policy_url'] == "https://publicbrandtest.com/privacy"
    assert 'brand_logo_url' in response.data


@pytest.mark.django_db
class TestOrganizationAccessPermissions:
    @pytest.fixture
    def second_org(self, db):
        return Organization.objects.create(name="Second Organization")

    def test_member_can_query_own_org_but_not_other_org(self, api_client, user, organization, second_org):
        """A user can query their own org info, but other orgs return 404 or are excluded from list."""
        api_client.force_authenticate(user=user)
        # List endpoint returns only own organization
        list_resp = api_client.get('/api/v1/organizations/')
        assert list_resp.status_code == status.HTTP_200_OK
        returned_ids = [item['id'] for item in list_resp.data]
        assert organization.id in returned_ids
        assert second_org.id not in returned_ids

        # Retrieve own org succeeds
        detail_resp = api_client.get(f'/api/v1/organizations/{organization.id}/')
        assert detail_resp.status_code == status.HTTP_200_OK
        assert detail_resp.data['id'] == organization.id

        # Retrieve other org returns 404
        other_resp = api_client.get(f'/api/v1/organizations/{second_org.id}/')
        assert other_resp.status_code == status.HTTP_404_NOT_FOUND

    def test_organization_viewset_is_strictly_read_only(self, api_client, user, organization):
        """OrganizationViewSet strictly rejects mutations with 405 Method Not Allowed."""
        api_client.force_authenticate(user=user)
        patch_resp = api_client.patch(f'/api/v1/organizations/{organization.id}/', {'brand_name': 'Override'}, format='json')
        assert patch_resp.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

        del_resp = api_client.delete(f'/api/v1/organizations/{organization.id}/')
        assert del_resp.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

        post_resp = api_client.post('/api/v1/organizations/', {'name': 'New Org'}, format='json')
        assert post_resp.status_code == status.HTTP_405_METHOD_NOT_ALLOWED


@pytest.mark.django_db
class TestAuthEndpointKeyRejection:
    def test_set_password_rejects_api_key_auth(self, public_client, user):
        """SetPasswordView rejects API key authentication."""
        raw_key, prefix, hashed_key = generate_raw_api_key()
        APIKey.objects.create(
            user=user,
            name='Test Key',
            prefix=prefix,
            hashed_key=hashed_key,
            tier='full_access',
        )
        public_client.credentials(HTTP_AUTHORIZATION=f'Bearer {raw_key}')
        payload = {
            'old_password': 'password',
            'new_password1': 'NewValidPass123!',
            'new_password2': 'NewValidPass123!',
        }
        resp = public_client.post('/api/v1/users/set-password/', payload, format='json')
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_logout_rejects_api_key_auth(self, public_client, user):
        """LogoutView rejects API key authentication."""
        raw_key, prefix, hashed_key = generate_raw_api_key()
        APIKey.objects.create(
            user=user,
            name='Test Key',
            prefix=prefix,
            hashed_key=hashed_key,
            tier='full_access',
        )
        public_client.credentials(HTTP_AUTHORIZATION=f'Bearer {raw_key}')
        resp = public_client.post('/api/v1/logout/', {'refresh': 'fake-token'}, format='json')
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_logout_rejects_other_user_refresh_token(self, api_client, user, user2):
        """LogoutView rejects refresh tokens belonging to a different user."""
        other_refresh = RefreshToken.for_user(user2)
        api_client.force_authenticate(user=user)
        resp = api_client.post('/api/v1/logout/', {'refresh': str(other_refresh)}, format='json')
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_logout_succeeds_with_own_refresh_token(self, api_client, user):
        """LogoutView successfully blacklists the requesting user's refresh token."""
        own_refresh = RefreshToken.for_user(user)
        api_client.force_authenticate(user=user)
        resp = api_client.post('/api/v1/logout/', {'refresh': str(own_refresh)}, format='json')
        assert resp.status_code == status.HTTP_205_RESET_CONTENT


@pytest.mark.django_db
class TestTokenRevocationOnLifecycleEvents:
    def test_password_change_blacklists_prior_refresh_tokens(self, api_client, user):
        """Changing password blacklists prior refresh tokens for that user."""
        prior_refresh = RefreshToken.for_user(user)
        api_client.force_authenticate(user=user)
        payload = {
            'old_password': 'password',
            'new_password1': 'NewStrongPassword123!',
            'new_password2': 'NewStrongPassword123!',
        }
        resp = api_client.post('/api/v1/users/set-password/', payload, format='json')
        assert resp.status_code == status.HTTP_204_NO_CONTENT

        # Attempt to use the prior refresh token should fail with 401 Unauthorized
        refresh_resp = api_client.post('/api/v1/token/refresh/', {'refresh': str(prior_refresh)}, format='json')
        assert refresh_resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_user_deactivation_blacklists_refresh_tokens(self, api_client, admin_user, user):
        """Deactivating a user blacklists their prior refresh tokens."""
        prior_refresh = RefreshToken.for_user(user)
        api_client.force_authenticate(user=admin_user)
        patch_resp = api_client.patch(f'/api/v1/admin/users/{user.id}/', {'is_active': False}, format='json')
        assert patch_resp.status_code == status.HTTP_200_OK

        # Attempt to use the prior refresh token should fail with 401 Unauthorized
        refresh_resp = api_client.post('/api/v1/token/refresh/', {'refresh': str(prior_refresh)}, format='json')
        assert refresh_resp.status_code == status.HTTP_401_UNAUTHORIZED

    def test_user_deletion_blacklists_refresh_tokens(self, api_client, admin_user, user):
        """Deleting a user blacklists their prior refresh tokens."""
        prior_refresh = RefreshToken.for_user(user)
        api_client.force_authenticate(user=admin_user)
        del_resp = api_client.delete(f'/api/v1/admin/users/{user.id}/')
        assert del_resp.status_code == status.HTTP_204_NO_CONTENT

        # Attempt to use the prior refresh token should fail with 401 Unauthorized
        refresh_resp = api_client.post('/api/v1/token/refresh/', {'refresh': str(prior_refresh)}, format='json')
        assert refresh_resp.status_code == status.HTTP_401_UNAUTHORIZED



