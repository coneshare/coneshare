import pytest
from datetime import timedelta
from django.utils import timezone
from rest_framework import status
from django.urls import reverse
from core.models import APIKey
from core.authentication import generate_raw_api_key


@pytest.mark.django_db
def test_create_api_key(api_client, user):
    url = reverse('api-key-list')
    payload = {
        'name': 'Test Integration Key',
        'tier': 'read_write',
        'expires_in_days': 30,
    }
    response = api_client.post(url, payload, format='json')
    assert response.status_code == status.HTTP_201_CREATED
    data = response.data
    assert data['name'] == 'Test Integration Key'
    assert data['tier'] == 'read_write'
    assert 'raw_key' in data
    assert data['raw_key'].startswith('cs_live_')
    assert APIKey.objects.filter(user=user, name='Test Integration Key').exists()


@pytest.mark.django_db
def test_list_api_keys(api_client, user):
    raw_key, prefix, hashed_key = generate_raw_api_key()
    APIKey.objects.create(
        user=user,
        name='My MCP Key',
        prefix=prefix,
        hashed_key=hashed_key,
        tier='read_only',
    )

    url = reverse('api-key-list')
    response = api_client.get(url)
    assert response.status_code == status.HTTP_200_OK
    results = response.data if isinstance(response.data, list) else response.data.get('results', [])
    assert len(results) >= 1
    key_data = [k for k in results if k['name'] == 'My MCP Key'][0]
    assert key_data['prefix'] == prefix
    assert 'raw_key' not in key_data  # raw key should not be exposed in list


@pytest.mark.django_db
def test_api_key_authentication_read_only_tier(public_client, user):
    raw_key, prefix, hashed_key = generate_raw_api_key()
    APIKey.objects.create(
        user=user,
        name='Read Only Agent Key',
        prefix=prefix,
        hashed_key=hashed_key,
        tier='read_only',
    )

    public_client.credentials(HTTP_AUTHORIZATION=f'Bearer {raw_key}')

    # GET request allowed
    url = reverse('api-key-list')
    response = public_client.get(url)
    assert response.status_code == status.HTTP_200_OK

    # POST request blocked by read_only tier -> 403 Forbidden
    response = public_client.post(url, {'name': 'Illegal Key'}, format='json')
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_api_key_authentication_read_write_tier(public_client, user):
    raw_key, prefix, hashed_key = generate_raw_api_key()
    key_obj = APIKey.objects.create(
        user=user,
        name='Read Write Agent Key',
        prefix=prefix,
        hashed_key=hashed_key,
        tier='read_write',
    )

    public_client.credentials(HTTP_AUTHORIZATION=f'Bearer {raw_key}')

    # GET request allowed
    url = reverse('api-key-list')
    response = public_client.get(url)
    assert response.status_code == status.HTTP_200_OK

    # DELETE request blocked by read_write tier -> 403 Forbidden
    delete_url = reverse('api-key-detail', kwargs={'pk': key_obj.id})
    response = public_client.delete(delete_url)
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
def test_expired_api_key_returns_401_unauthorized(public_client, user):
    raw_key, prefix, hashed_key = generate_raw_api_key()
    past_expiration = timezone.now() - timedelta(days=1)
    APIKey.objects.create(
        user=user,
        name='Expired Key',
        prefix=prefix,
        hashed_key=hashed_key,
        tier='full_access',
        expires_at=past_expiration,
    )

    public_client.credentials(HTTP_AUTHORIZATION=f'Bearer {raw_key}')
    url = reverse('api-key-list')
    response = public_client.get(url)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.headers.get('WWW-Authenticate') == 'Bearer realm="api"'


@pytest.mark.django_db
def test_invalid_api_key_returns_401_unauthorized(public_client):
    url = reverse('api-key-list')
    public_client.credentials(HTTP_AUTHORIZATION='Bearer cs_live_nonexistent_key_1234567890')
    response = public_client.get(url)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.headers.get('WWW-Authenticate') == 'Bearer realm="api"'


@pytest.mark.django_db
def test_invalid_jwt_token_returns_401_unauthorized(public_client):
    url = reverse('api-key-list')
    public_client.credentials(HTTP_AUTHORIZATION='Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidtoken')
    response = public_client.get(url)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.headers.get('WWW-Authenticate') == 'Bearer realm="api"'
