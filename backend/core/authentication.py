import hashlib
import hmac
import secrets
from django.conf import settings
from django.utils import timezone
from rest_framework import authentication, exceptions

from core.models import APIKey


def hash_api_key(raw_key: str) -> str:
    """
    Computes an HMAC-SHA256 hash of the raw API key using settings.SECRET_KEY.
    Provides one-way storage with zero database leak exposure.
    """
    secret = getattr(settings, 'SECRET_KEY', 'default_secret_key')
    return hmac.new(secret.encode('utf-8'), raw_key.encode('utf-8'), hashlib.sha256).hexdigest()


def generate_raw_api_key() -> tuple[str, str, str]:
    """
    Generates a raw API key, display prefix, and HMAC-SHA256 hash.
    Format: cs_live_<32 hex chars> (128 bits entropy)
    Prefix: cs_live_XXXX (12 chars - limits entropy leakage to 16 bits)
    """
    random_part = secrets.token_hex(16)
    raw_key = f"cs_live_{random_part}"
    prefix = raw_key[:12]
    hashed_key = hash_api_key(raw_key)
    return raw_key, prefix, hashed_key


class APIKeyAuthentication(authentication.BaseAuthentication):
    """
    Authenticates requests bearing an API Key header: Authorization: Bearer cs_live_...
    Validates HMAC hash match and key expiration in O(1) time.
    """

    def authenticate_header(self, request):
        """
        Returns WWW-Authenticate header challenge string.
        CRITICAL: DRF's APIView.handle_exception checks the first authenticator's
        get_authenticate_header(). If this method is missing or returns None,
        DRF coercively changes HTTP 401 Unauthorized responses into 403 Forbidden.
        Providing 'Bearer realm="api"' guarantees DRF retains HTTP 401 status, which
        allows frontend clients to catch 401s and automatically refresh JWT tokens.
        """
        return 'Bearer realm="api"'

    def authenticate(self, request):
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return None

        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != 'bearer':
            return None

        raw_key = parts[1]
        if not raw_key.startswith('cs_live_'):
            return None

        prefix = raw_key[:12]
        try:
            api_key = APIKey.objects.get(prefix=prefix)
        except APIKey.DoesNotExist:
            raise exceptions.AuthenticationFailed('Invalid API key.')

        computed_hash = hash_api_key(raw_key)
        if not hmac.compare_digest(api_key.hashed_key, computed_hash):
            raise exceptions.AuthenticationFailed('Invalid API key.')

        if api_key.expires_at and api_key.expires_at < timezone.now():
            raise exceptions.AuthenticationFailed('API key has expired.')

        # Update last_used_at timestamp asynchronously/efficiently
        APIKey.objects.filter(id=api_key.id).update(last_used_at=timezone.now())

        return (api_key.user, api_key)
