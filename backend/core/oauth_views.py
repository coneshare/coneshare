import json
from urllib.parse import urlparse

from django.conf import settings
from django.http import Http404, HttpRequest, HttpResponse, JsonResponse, QueryDict
from django.http.request import validate_host
from django.views.decorators.csrf import csrf_exempt
from oauth2_provider import views as oauth2_views
from oauth2_provider.exceptions import OAuthToolkitError
from oauth2_provider.models import AccessToken, get_application_model
from oauth2_provider.oauth2_validators import is_valid_resource_uri, validate_resource_as_url_prefix
from oauth2_provider.scopes import get_scopes_backend
from oauth2_provider.settings import oauth2_settings
from oauth2_provider.views.metadata import OAuthServerMetadataView
from oauth2_provider.views.mixins import OAuthLibMixin
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from core.authentication import (ActiveUserOAuth2Authentication, APIKeyAuthentication,
                                 get_expected_mcp_resource_urls)
from core.models import APIKey

OAUTH_QUERY_PARAM_KEYS = (
    'client_id',
    'redirect_uri',
    'response_type',
    'scope',
    'state',
    'code_challenge',
    'code_challenge_method',
    'nonce',
    'resource',
)

API_KEY_TIER_SCOPES = {
    'read_only': ['read'],
    'read_write': ['read', 'write'],
    'full_access': ['read', 'write'],
}


def require_oauth_enabled(view_func):
    """Return 404 Not Found for OAuth 2.1 endpoints when CONESHARE_OAUTH_ENABLED is false."""
    @csrf_exempt
    def _wrapped(request, *args, **kwargs):
        if not getattr(settings, 'CONESHARE_OAUTH_ENABLED', False):
            raise Http404("OAuth 2.1 is disabled.")
        return view_func(request, *args, **kwargs)
    return _wrapped


def _build_oauth_http_request(drf_request, params) -> HttpRequest:
    """Build a Django HttpRequest carrying OAuth authorization parameters and authenticated user."""
    query = QueryDict(mutable=True)
    for key in OAUTH_QUERY_PARAM_KEYS:
        if hasattr(params, 'getlist') and key == 'resource':
            values = [str(v) for v in params.getlist(key) if v is not None and str(v) != '']
            if values:
                query.setlist(key, values)
            continue
        val = params.get(key)
        if isinstance(val, list):
            values = [str(v) for v in val if v is not None and str(v) != '']
            if values:
                query.setlist(key, values)
        elif val is not None and str(val) != '':
            query[key] = str(val)

    raw_req = getattr(drf_request, '_request', drf_request)
    oauth_req = HttpRequest()
    oauth_req.method = 'GET'
    oauth_req.path = raw_req.path
    oauth_req.path_info = getattr(raw_req, 'path_info', raw_req.path)
    oauth_req.META = dict(raw_req.META)
    oauth_req.META['QUERY_STRING'] = query.urlencode()
    oauth_req.GET = query
    oauth_req.user = drf_request.user
    return oauth_req


def _oauth_error_payload(error: OAuthToolkitError) -> dict[str, str]:
    oauthlib_err = getattr(error, 'oauthlib_error', None)
    code = getattr(oauthlib_err, 'error', None) or 'invalid_request'
    description = getattr(oauthlib_err, 'description', None) or 'Invalid OAuth authorization request.'
    return {
        'error': str(code),
        'error_description': str(description),
    }


_LOOPBACK_HOSTS = frozenset({'localhost', '127.0.0.1', '::1'})


def _get_allowed_client_domains() -> list[str]:
    """Return normalized Django host patterns allowed for OAuth client redirect URIs."""
    normalized: list[str] = []
    for entry in settings.OAUTH_ALLOWED_CLIENT_DOMAINS:
        if not isinstance(entry, str):
            continue
        cleaned = entry.strip().lower()
        if not cleaned:
            continue
        if cleaned.startswith('*.'):
            cleaned = cleaned[1:]
        normalized.append(cleaned)
    return normalized


def is_trusted_oauth_redirect_uri(uri: str) -> bool:
    """Return True if *uri* targets an allowlisted client domain (or loopback when enabled)."""
    if not isinstance(uri, str):
        return False
    candidate = uri.strip()
    if not candidate or any(ch.isspace() for ch in candidate):
        return False

    parsed = urlparse(candidate)
    scheme = (parsed.scheme or '').lower()
    if scheme not in ('https', 'http') or '\\' in (parsed.netloc or ''):
        return False

    hostname = (parsed.hostname or '').lower()
    if not hostname:
        return False

    if hostname in _LOOPBACK_HOSTS and oauth2_settings.ALLOW_LOCALHOST_LOOPBACK:
        return scheme == 'https' or 'http' in {
            s.lower() for s in oauth2_settings.ALLOWED_REDIRECT_URI_SCHEMES
        }

    if scheme != 'https' and not settings.DEBUG:
        return False

    return validate_host(hostname, _get_allowed_client_domains())


def _validate_dcr_redirect_uris_from_body(body: bytes) -> JsonResponse | None:
    """Reject DCR payloads whose redirect_uris contain untrusted client domains."""
    try:
        data = json.loads(body)
    except (json.JSONDecodeError, ValueError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    redirect_uris = data.get('redirect_uris')
    if not isinstance(redirect_uris, list):
        return None
    for uri in redirect_uris:
        if isinstance(uri, str) and uri.strip() and not is_trusted_oauth_redirect_uri(uri):
            return JsonResponse(
                {
                    'error': 'invalid_client_metadata',
                    'error_description': 'Redirect URI host is not in the trusted client domain allowlist.',
                },
                status=400,
            )
    return None


class ConeshareOAuthServerMetadataView(OAuthServerMetadataView):
    """
    RFC 8414 Authorization Server Metadata endpoint.
    Points authorization_endpoint to the React SPA consent screen (/oauth/authorize).
    """

    def get(self, request, *args, **kwargs):
        response = super().get(request, *args, **kwargs)
        data = json.loads(response.content.decode('utf-8'))

        parsed = urlparse(data['token_endpoint'])
        data['authorization_endpoint'] = f"{parsed.scheme}://{parsed.netloc}/oauth/authorize"

        data['code_challenge_methods_supported'] = ['S256']
        res = JsonResponse(data)
        res['Access-Control-Allow-Origin'] = '*'
        return res


class OAuthConsentView(OAuthLibMixin, APIView):
    """
    SPA-backed OAuth 2.1 consent API protected strictly by interactive JWT auth.
    Validates PKCE / redirect_uri / client_id and issues DOT authorization codes.
    """

    authentication_classes = [JWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def _validate_pkce_consent_request(self, oauth_req):
        """Run DOT authorization validation and enforce OAuth 2.1 PKCE S256."""
        try:
            scopes, credentials = self.validate_authorization_request(oauth_req)
        except OAuthToolkitError as err:
            return None, None, Response(_oauth_error_payload(err), status=status.HTTP_400_BAD_REQUEST)

        if not credentials.get('code_challenge') or credentials.get('code_challenge_method') != 'S256':
            return None, None, Response(
                {
                    'error': 'invalid_request',
                    'error_description': 'PKCE with code_challenge_method=S256 is required.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not is_trusted_oauth_redirect_uri(credentials.get('redirect_uri', '')):
            return None, None, Response(
                {
                    'error': 'invalid_redirect_uri',
                    'error_description': 'Redirect URI host is not in the trusted client domain allowlist.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # RFC 8707: normalize resource indicators to list[str] for DOT Grant/Token models
        resource_list: list[str] = []
        for raw in oauth_req.GET.getlist('resource'):
            resource_list.extend(part for part in raw.split() if part)
        for resource_uri in resource_list:
            if not is_valid_resource_uri(resource_uri):
                return None, None, Response(
                    {
                        'error': 'invalid_target',
                        'error_description': (
                            f"The resource '{resource_uri}' is not a valid resource indicator: "
                            'it must be an absolute URI with a scheme and host.'
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        if resource_list:
            credentials['resource'] = resource_list
        else:
            credentials.pop('resource', None)
        return scopes, credentials, None

    def get(self, request, *args, **kwargs):
        oauth_req = _build_oauth_http_request(request, request.query_params)
        scopes, credentials, err_response = self._validate_pkce_consent_request(oauth_req)
        if err_response is not None:
            return err_response

        application = get_application_model().objects.get(client_id=credentials['client_id'])
        available_scopes = get_scopes_backend().get_all_scopes()
        scope_items = [
            {
                'name': scope_name,
                'description': str(available_scopes.get(scope_name, scope_name)),
            }
            for scope_name in scopes
        ]

        return Response(
            {
                'client_id': application.client_id,
                'application_name': application.name or application.client_id,
                'registration_source': getattr(application, 'registration_source', ''),
                'redirect_uri': credentials.get('redirect_uri', ''),
                'scopes': scope_items,
                'state': credentials.get('state', '') or '',
                'user': {
                    'email': request.user.email,
                    'name': getattr(request.user, 'name', '') or request.user.email,
                },
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request, *args, **kwargs):
        data = request.data if isinstance(request.data, dict) else {}
        oauth_req = _build_oauth_http_request(request, data)
        validated_scopes, credentials, err_response = self._validate_pkce_consent_request(oauth_req)
        if err_response is not None:
            return err_response

        raw_allow = data.get('allow', False)
        allow = raw_allow is True or (
            isinstance(raw_allow, str) and raw_allow.strip().lower() == 'true'
        )

        requested_subset = data.get('scopes')
        if allow and isinstance(requested_subset, list):
            validated_set = set(validated_scopes)
            approved_scopes = [s for s in requested_subset if isinstance(s, str) and s in validated_set]
            if not approved_scopes:
                return Response(
                    {
                        'error': 'invalid_scope',
                        'error_description': 'At least one requested permission scope must be granted.',
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            approved_scopes = list(validated_scopes)

        try:
            redirect_uri, _headers, _body, _resp_status = self.create_authorization_response(
                request=oauth_req,
                scopes=' '.join(approved_scopes),
                credentials=credentials,
                allow=allow,
            )
        except OAuthToolkitError as err:
            should_redirect, err_payload = self.error_response(err)
            redirect_url = err_payload.get('url') if isinstance(err_payload, dict) else None
            if should_redirect and redirect_url:
                return Response({'redirect_url': redirect_url}, status=status.HTTP_200_OK)
            return Response(_oauth_error_payload(err), status=status.HTTP_400_BAD_REQUEST)

        return Response({'redirect_url': redirect_uri}, status=status.HTTP_200_OK)


class OAuthTokenVerifyView(APIView):
    """
    Verifies Bearer credentials presented to the MCP server.
    Accepts both OAuth 2.1 AccessTokens and existing cs_live_... API Keys.
    """

    authentication_classes = [APIKeyAuthentication, ActiveUserOAuth2Authentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        auth = request.auth
        if isinstance(auth, AccessToken):
            requested_resource = (request.query_params.get('resource') or '').strip()
            expected_resources = get_expected_mcp_resource_urls()
            if auth.resource:
                if requested_resource and not validate_resource_as_url_prefix(requested_resource, auth.resource):
                    return Response({'active': False, 'error': 'invalid_audience'}, status=status.HTTP_401_UNAUTHORIZED)
                if not any(validate_resource_as_url_prefix(uri, auth.resource) for uri in expected_resources):
                    return Response({'active': False, 'error': 'invalid_audience'}, status=status.HTTP_401_UNAUTHORIZED)

            client_id = auth.application.client_id if auth.application else 'oauth2'
            scopes = [s for s in (auth.scope or '').split() if s]
            exp = int(auth.expires.timestamp()) if auth.expires else None
            return Response(
                {
                    'active': True,
                    'auth_type': 'oauth2',
                    'client_id': client_id,
                    'user_id': str(request.user.id),
                    'scopes': scopes,
                    'aud': auth.resource or [],
                    'exp': exp,
                },
                status=status.HTTP_200_OK,
            )

        if isinstance(auth, APIKey):
            scopes = API_KEY_TIER_SCOPES.get(auth.tier, [])
            exp = int(auth.expires_at.timestamp()) if auth.expires_at else None
            return Response(
                {
                    'active': True,
                    'auth_type': 'api_key',
                    'client_id': f'apikey:{auth.prefix}',
                    'user_id': str(request.user.id),
                    'scopes': scopes,
                    'exp': exp,
                },
                status=status.HTTP_200_OK,
            )

        return Response({'active': False}, status=status.HTTP_401_UNAUTHORIZED)


class _AllowedDomainDCRView(oauth2_views.DynamicClientRegistrationView):
    """DCR creation view enforcing the trusted client domain allowlist on redirect_uris."""

    def post(self, request, *args, **kwargs):
        permission_classes = oauth2_settings.DCR_REGISTRATION_PERMISSION_CLASSES
        if permission_classes and all(cls().has_permission(request) for cls in permission_classes):
            err_resp = _validate_dcr_redirect_uris_from_body(request.body)
            if err_resp is not None:
                return err_resp
        return super().post(request, *args, **kwargs)


class _AllowedDomainDCRManagementView(oauth2_views.DynamicClientRegistrationManagementView):
    """DCR management view enforcing the trusted client domain allowlist on PUT updates."""

    def put(self, request, client_id, *args, **kwargs):
        auth = self._authenticate_registration_request(request, client_id)
        if isinstance(auth, HttpResponse):
            return auth
        err_resp = _validate_dcr_redirect_uris_from_body(request.body)
        if err_resp is not None:
            return err_resp
        return super().put(request, client_id, *args, **kwargs)


class _BaseThrottledDCRView(APIView):
    """DRF-throttled wrapper delegating RFC 7591/7592 DCR requests to DOT."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'oauth_dcr'
    target_view_cls = _AllowedDomainDCRView

    def _delegate(self, request, *args, **kwargs):
        view_fn = self.target_view_cls.as_view()
        return view_fn(getattr(request, '_request', request), *args, **kwargs)


class ThrottledDynamicClientRegistrationView(_BaseThrottledDCRView):
    """DRF-throttled wrapper around DOT DynamicClientRegistrationView (RFC 7591)."""

    target_view_cls = _AllowedDomainDCRView

    def post(self, request, *args, **kwargs):
        return self._delegate(request, *args, **kwargs)


class ThrottledDynamicClientRegistrationManagementView(_BaseThrottledDCRView):
    """DRF-throttled wrapper around DOT DynamicClientRegistrationManagementView (RFC 7592)."""

    target_view_cls = _AllowedDomainDCRManagementView

    def get(self, request, *args, **kwargs):
        return self._delegate(request, *args, **kwargs)

    def put(self, request, *args, **kwargs):
        return self._delegate(request, *args, **kwargs)

    def delete(self, request, *args, **kwargs):
        return self._delegate(request, *args, **kwargs)
