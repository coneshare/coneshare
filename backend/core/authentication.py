import hashlib
import hmac
import secrets
from django.conf import settings
from django.utils import timezone
from oauth2_provider.contrib.rest_framework import OAuth2Authentication
from oauth2_provider.oauth2_validators import validate_resource_as_url_prefix
from rest_framework import authentication, exceptions
from drf_spectacular.extensions import OpenApiAuthenticationExtension

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
            api_key = APIKey.objects.select_related('user').get(prefix=prefix)
        except APIKey.DoesNotExist:
            raise exceptions.AuthenticationFailed('Invalid API key.')

        computed_hash = hash_api_key(raw_key)
        if not hmac.compare_digest(api_key.hashed_key, computed_hash):
            raise exceptions.AuthenticationFailed('Invalid API key.')

        if not api_key.user.is_active:
            raise exceptions.AuthenticationFailed('User inactive or deleted.')

        if api_key.expires_at and api_key.expires_at < timezone.now():
            raise exceptions.AuthenticationFailed('API key has expired.')

        # Update last_used_at timestamp asynchronously/efficiently
        APIKey.objects.filter(id=api_key.id).update(last_used_at=timezone.now())

        return (api_key.user, api_key)


class APIKeyScheme(OpenApiAuthenticationExtension):
    target_class = 'core.authentication.APIKeyAuthentication'
    name = 'apiKeyAuth'

    def get_security_definition(self, auto_schema):
        return {
            'type': 'http',
            'scheme': 'bearer',
            'bearerFormat': 'API Key (cs_live_...)',
            'description': 'API Key authentication using Bearer cs_live_<key>',
        }


def get_expected_mcp_resource_urls() -> list[str]:
    """Return configured ConeShare MCP protected-resource URIs for RFC 8707 audience checks."""
    urls: list[str] = []
    explicit = (getattr(settings, 'MCP_RESOURCE_URL', '') or '').strip()
    if explicit:
        urls.append(explicit)

    mcp_path = getattr(settings, 'MCP_PATH', '/mcp/sse') or '/mcp/sse'
    for base in (
        getattr(settings, 'MCP_PUBLIC_URL', ''),
        getattr(settings, 'OAUTH_ISSUER', ''),
        getattr(settings, 'SITE_DOMAIN', ''),
    ):
        clean_base = (base or '').strip().rstrip('/')
        if clean_base:
            candidate = f"{clean_base}{mcp_path}"
            if candidate not in urls:
                urls.append(candidate)
    return urls


def validate_coneshare_resource(request_uri: str, audiences: list[str]) -> bool:
    """
    RFC 8707 resource validator for ConeShare.
    Accepts tokens whose audience matches either the REST API URI directly
    or ConeShare's configured MCP resource URI, while rejecting foreign audiences.
    """
    if not audiences:
        return True
    if validate_resource_as_url_prefix(request_uri, audiences):
        return True
    for mcp_uri in get_expected_mcp_resource_urls():
        if validate_resource_as_url_prefix(mcp_uri, audiences):
            return True
    return False


class ActiveUserOAuth2Authentication(OAuth2Authentication):
    """
    OAuth2 authentication wrapper enforcing that deactivated/deleted users cannot authenticate
    with an existing AccessToken.
    """

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None
        user, token = result
        if not user or not user.is_active:
            raise exceptions.AuthenticationFailed('User inactive or deleted.')
        return (user, token)


class OAuth2Scheme(OpenApiAuthenticationExtension):
    target_class = 'core.authentication.ActiveUserOAuth2Authentication'
    name = 'oauth2Auth'

    def get_security_definition(self, auto_schema):
        return {
            'type': 'http',
            'scheme': 'bearer',
            'bearerFormat': 'OAuth 2.1 Access Token',
            'description': 'OAuth 2.1 Bearer token issued via Authorization Code + PKCE (S256)',
        }
