import base64
import hashlib
from urllib.parse import parse_qs, urlencode, urlparse

import pytest
from django.conf import settings
from django.core.cache import cache
from django.test import override_settings
from oauth2_provider.cimd import HostAllowlistCIMDPermission
from oauth2_provider.settings import oauth2_settings
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from backend.settings import (DEFAULT_OAUTH_ALLOWED_CLIENT_DOMAINS,
                              _parse_oauth_allowed_client_domains)
from core.authentication import generate_raw_api_key
from core.models import APIKey
from core.oauth_views import (ThrottledDynamicClientRegistrationManagementView,
                              ThrottledDynamicClientRegistrationView,
                              _summarize_dcr_payload,
                              is_trusted_oauth_redirect_uri)
from core.services import blacklist_all_user_tokens


def _pkce_pair(verifier: str = "test-verifier-string-with-sufficient-entropy-0123456789") -> tuple[str, str]:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def _jwt_client(user) -> APIClient:
    client = APIClient()
    token = str(RefreshToken.for_user(user).access_token)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.mark.django_db
class TestOAuth2Server:
    @pytest.fixture(autouse=True)
    def _clear_dcr_throttle_cache(self):
        cache.clear()
        with override_settings(CONESHARE_OAUTH_ENABLED=True):
            yield
        cache.clear()

    def test_oauth_disabled_by_default_blocks_endpoints_and_token_auth(self, user):
        assert settings.CONESHARE_OAUTH_ENABLED is True  # enabled via class fixture
        anon = APIClient()
        redirect_uri = "https://gemini.google.com/oauth/callback"
        client_id = anon.post(
            "/api/v1/oauth/register/",
            {
                "client_name": "Gemini App",
                "redirect_uris": [redirect_uri],
                "grant_types": ["authorization_code"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",
            },
            format="json",
        ).json()["client_id"]
        verifier, challenge = _pkce_pair()
        jwt_client = _jwt_client(user)
        consent_res = jwt_client.post(
            "/api/v1/oauth/consent/",
            {
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "read",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "allow": True,
            },
            format="json",
        )
        code = parse_qs(urlparse(consent_res.json()["redirect_url"]).query)["code"][0]
        access_token = anon.post(
            "/api/v1/oauth/token/",
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": client_id,
                "code_verifier": verifier,
            },
        ).json()["access_token"]

        oauth_client = APIClient()
        oauth_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        assert oauth_client.get("/api/v1/documents/").status_code == status.HTTP_200_OK

        with override_settings(CONESHARE_OAUTH_ENABLED=False):
            assert anon.get("/.well-known/oauth-authorization-server").status_code == status.HTTP_404_NOT_FOUND
            assert anon.post("/api/v1/oauth/register/", {}, format="json").status_code == status.HTTP_404_NOT_FOUND
            assert anon.post("/api/v1/oauth/token/", {}).status_code == status.HTTP_404_NOT_FOUND
            assert jwt_client.get("/api/v1/oauth/consent/").status_code == status.HTTP_404_NOT_FOUND
            assert oauth_client.get("/api/v1/oauth/verify/").status_code == status.HTTP_404_NOT_FOUND
            # Existing OAuth access token is also rejected by ActiveUserOAuth2Authentication when disabled
            assert oauth_client.get("/api/v1/documents/").status_code == status.HTTP_401_UNAUTHORIZED

    def test_oauth_server_metadata_rfc8414(self, client):
        res = client.get("/.well-known/oauth-authorization-server")
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert data["authorization_endpoint"].endswith("/oauth/authorize")
        assert data["token_endpoint"].endswith("/api/v1/oauth/token/")
        assert data["registration_endpoint"].endswith("/api/v1/oauth/register/")
        assert data["code_challenge_methods_supported"] == ["S256"]
        assert "none" in data["token_endpoint_auth_methods_supported"]
        assert data["client_id_metadata_document_supported"] is False
        assert set(data["scopes_supported"]) == {
            "read",
            "write",
        }

        with override_settings(
            SITE_DOMAIN="https://app.coneshare.com",
            OAUTH2_PROVIDER={
                **settings.OAUTH2_PROVIDER,
                "OIDC_ISS_ENDPOINT": "https://app.coneshare.com/",
            },
        ):
            prod_meta = client.get("/.well-known/oauth-authorization-server").json()
            assert prod_meta["issuer"] == "https://app.coneshare.com/"
            assert prod_meta["authorization_endpoint"] == "https://app.coneshare.com/oauth/authorize"
            assert prod_meta["token_endpoint"] == "https://app.coneshare.com/api/v1/oauth/token/"

    def test_dynamic_client_registration_and_pkce_flow_end_to_end(self, user):
        anon = APIClient()
        redirect_uri = "https://gemini.google.com/oauth/callback"

        reg_res = anon.post(
            "/api/v1/oauth/register/",
            {
                "client_name": "Gemini Custom App",
                "redirect_uris": [redirect_uri],
                "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",
            },
            format="json",
        )
        assert reg_res.status_code == status.HTTP_201_CREATED
        client_id = reg_res.json()["client_id"]

        verifier, challenge = _pkce_pair()
        base_params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "read write",
            "state": "xyz-state-123",
        }

        # Unauthenticated browser cannot query consent API
        unauth_res = anon.get("/api/v1/oauth/consent/", {**base_params, "code_challenge": challenge, "code_challenge_method": "S256"})
        assert unauth_res.status_code == status.HTTP_401_UNAUTHORIZED

        jwt_client = _jwt_client(user)

        # Missing PKCE or plain PKCE must be rejected
        no_pkce = jwt_client.get("/api/v1/oauth/consent/", base_params)
        assert no_pkce.status_code == status.HTTP_400_BAD_REQUEST

        plain_pkce = jwt_client.get(
            "/api/v1/oauth/consent/",
            {**base_params, "code_challenge": "plainchallenge123456789012345678901234567890", "code_challenge_method": "plain"},
        )
        assert plain_pkce.status_code == status.HTTP_400_BAD_REQUEST

        # Valid S256 consent GET
        consent_params = {
            **base_params,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        consent_get = jwt_client.get("/api/v1/oauth/consent/", consent_params)
        assert consent_get.status_code == status.HTTP_200_OK
        consent_data = consent_get.json()
        assert consent_data["application_name"] == "Gemini Custom App"
        assert consent_data["registration_source"] == "dcr"
        assert consent_data["user"]["email"] == user.email
        assert [s["name"] for s in consent_data["scopes"]] == ["read", "write"]

        # Approve consent via POST
        consent_post = jwt_client.post(
            "/api/v1/oauth/consent/",
            {**consent_params, "allow": True, "scopes": ["read", "write"]},
            format="json",
        )
        assert consent_post.status_code == status.HTTP_200_OK
        redirect_url = consent_post.json()["redirect_url"]
        parsed = urlparse(redirect_url)
        query = parse_qs(parsed.query)
        assert f"{parsed.scheme}://{parsed.netloc}{parsed.path}" == redirect_uri
        assert query["state"] == ["xyz-state-123"]
        auth_code = query["code"][0]

        # Wrong PKCE verifier fails
        bad_token_res = anon.post(
            "/api/v1/oauth/token/",
            {
                "grant_type": "authorization_code",
                "code": auth_code,
                "redirect_uri": redirect_uri,
                "client_id": client_id,
                "code_verifier": "wrong-verifier",
            },
        )
        assert bad_token_res.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_401_UNAUTHORIZED)

        # Valid PKCE verifier exchanges for access + refresh token
        token_res = anon.post(
            "/api/v1/oauth/token/",
            {
                "grant_type": "authorization_code",
                "code": auth_code,
                "redirect_uri": redirect_uri,
                "client_id": client_id,
                "code_verifier": verifier,
            },
        )
        assert token_res.status_code == status.HTTP_200_OK
        token_data = token_res.json()
        access_token = token_data["access_token"]
        refresh_token = token_data["refresh_token"]

        # Verify endpoint recognizes OAuth access token cleanly
        oauth_client = APIClient()
        oauth_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        verify_res = oauth_client.get("/api/v1/oauth/verify/")
        assert verify_res.status_code == status.HTTP_200_OK
        verify_data = verify_res.json()
        assert verify_data["active"] is True
        assert verify_data["auth_type"] == "oauth2"
        assert verify_data["client_id"] == client_id
        assert verify_data["user_id"] == str(user.id)
        assert set(verify_data["scopes"]) == {"read", "write"}

        # Consent API rejects OAuth tokens (JWT only)
        assert oauth_client.get("/api/v1/oauth/consent/", consent_params).status_code == status.HTTP_401_UNAUTHORIZED

        # Refresh token rotation succeeds
        refresh_res = anon.post(
            "/api/v1/oauth/token/",
            {
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
            },
        )
        assert refresh_res.status_code == status.HTTP_200_OK
        assert refresh_res.json()["access_token"] != access_token

    def test_consent_deny_redirects_with_access_denied(self, user):
        anon = APIClient()
        redirect_uri = "https://claude.ai/api/mcp/auth_callback"
        reg_res = anon.post(
            "/api/v1/oauth/register/",
            {
                "client_name": "Claude Web",
                "redirect_uris": [redirect_uri],
                "grant_types": ["authorization_code"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",
            },
            format="json",
        )
        client_id = reg_res.json()["client_id"]
        _, challenge = _pkce_pair()

        jwt_client = _jwt_client(user)
        deny_res = jwt_client.post(
            "/api/v1/oauth/consent/",
            {
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "read",
                "state": "deny-state",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "allow": False,
            },
            format="json",
        )
        assert deny_res.status_code == status.HTTP_200_OK
        query = parse_qs(urlparse(deny_res.json()["redirect_url"]).query)
        assert query["error"] == ["access_denied"]
        assert query["state"] == ["deny-state"]

        # Form-encoded allow="false" string must also deny (not coerce via bool("false"))
        form_deny_res = jwt_client.post(
            "/api/v1/oauth/consent/",
            urlencode(
                {
                    "client_id": client_id,
                    "redirect_uri": redirect_uri,
                    "response_type": "code",
                    "scope": "read",
                    "state": "deny-form",
                    "code_challenge": challenge,
                    "code_challenge_method": "S256",
                    "allow": "false",
                }
            ),
            content_type="application/x-www-form-urlencoded",
        )
        assert form_deny_res.status_code == status.HTTP_200_OK
        form_query = parse_qs(urlparse(form_deny_res.json()["redirect_url"]).query)
        assert form_query["error"] == ["access_denied"]
        assert form_query["state"] == ["deny-form"]
        assert "code" not in form_query

    def test_oauth_verify_accepts_api_key_and_rejects_invalid(self, user):
        raw_key, prefix, hashed = generate_raw_api_key()
        APIKey.objects.create(user=user, name="MCP Key", prefix=prefix, hashed_key=hashed, tier="read_only")

        key_client = APIClient()
        key_client.credentials(HTTP_AUTHORIZATION=f"Bearer {raw_key}")
        res = key_client.get("/api/v1/oauth/verify/")
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert data["active"] is True
        assert data["auth_type"] == "api_key"
        assert data["client_id"] == f"apikey:{prefix}"
        assert data["scopes"] == ["read"]

        bad_client = APIClient()
        bad_client.credentials(HTTP_AUTHORIZATION="Bearer not_a_valid_token")
        assert bad_client.get("/api/v1/oauth/verify/").status_code == status.HTTP_401_UNAUTHORIZED

    def test_oauth_scope_enforcement_on_api_endpoints(self, admin_user, document, share_link):
        anon = APIClient()
        redirect_uri = "https://chatgpt.com/connector_platform_oauth_redirect"
        reg_res = anon.post(
            "/api/v1/oauth/register/",
            {
                "client_name": "ChatGPT Connector",
                "redirect_uris": [redirect_uri],
                "grant_types": ["authorization_code"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",
            },
            format="json",
        )
        client_id = reg_res.json()["client_id"]
        verifier, challenge = _pkce_pair()

        jwt_client = _jwt_client(admin_user)
        consent_res = jwt_client.post(
            "/api/v1/oauth/consent/",
            {
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "read",
                "state": "s1",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "allow": True,
                "scopes": ["read"],
            },
            format="json",
        )
        code = parse_qs(urlparse(consent_res.json()["redirect_url"]).query)["code"][0]
        token = anon.post(
            "/api/v1/oauth/token/",
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": client_id,
                "code_verifier": verifier,
            },
        ).json()["access_token"]

        scoped_client = APIClient()
        scoped_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        # Permitted read endpoints across documents, datarooms, and aggregate stats
        assert scoped_client.get("/api/v1/documents/").status_code == status.HTTP_200_OK
        assert scoped_client.get(f"/api/v1/documents/{document.id}/stats/").status_code == status.HTTP_200_OK
        assert scoped_client.get("/api/v1/datarooms/").status_code == status.HTTP_200_OK

        # Denied writes, telemetry, and privileged endpoints even for admin user
        assert scoped_client.get("/api/v1/analytics/view-sessions/").status_code == status.HTTP_403_FORBIDDEN
        assert scoped_client.get("/api/v1/viewers/").status_code == status.HTTP_403_FORBIDDEN
        assert scoped_client.get("/api/v1/view-sessions/").status_code == status.HTTP_403_FORBIDDEN
        assert scoped_client.get(f"/api/v1/share-links/{share_link.id}/view-sessions/").status_code == status.HTTP_403_FORBIDDEN
        assert scoped_client.post("/api/v1/folders/", {"name": "New"}, format="json").status_code == status.HTTP_403_FORBIDDEN
        assert scoped_client.post("/api/v1/datarooms/", {"name": "New DR"}, format="json").status_code == status.HTTP_403_FORBIDDEN
        assert scoped_client.get("/api/v1/admin/users/").status_code == status.HTTP_403_FORBIDDEN
        assert scoped_client.get("/api/v1/api-keys/").status_code == status.HTTP_403_FORBIDDEN
        assert scoped_client.get("/api/v1/automations/destinations/").status_code == status.HTTP_403_FORBIDDEN

    def test_deactivated_user_and_blacklist_invalidate_oauth_tokens(self, user):
        anon = APIClient()
        redirect_uri = "https://gemini.google.com/oauth/callback"
        reg_res = anon.post(
            "/api/v1/oauth/register/",
            {
                "client_name": "Gemini App",
                "redirect_uris": [redirect_uri],
                "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",
            },
            format="json",
        )
        client_id = reg_res.json()["client_id"]
        verifier, challenge = _pkce_pair()

        jwt_client = _jwt_client(user)
        consent_res = jwt_client.post(
            "/api/v1/oauth/consent/",
            {
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "read",
                "state": "s2",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "allow": True,
                "scopes": ["read"],
            },
            format="json",
        )
        code = parse_qs(urlparse(consent_res.json()["redirect_url"]).query)["code"][0]
        token_data = anon.post(
            "/api/v1/oauth/token/",
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": client_id,
                "code_verifier": verifier,
            },
        ).json()
        access_token = token_data["access_token"]
        refresh_token = token_data["refresh_token"]

        oauth_client = APIClient()
        oauth_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        assert oauth_client.get("/api/v1/oauth/verify/").status_code == status.HTTP_200_OK

        # Deactivating user immediately rejects existing OAuth token with 401
        user.is_active = False
        user.save(update_fields=["is_active"])
        assert oauth_client.get("/api/v1/oauth/verify/").status_code == status.HTTP_401_UNAUTHORIZED
        assert oauth_client.get("/api/v1/documents/").status_code == status.HTTP_401_UNAUTHORIZED

        # Reactivate user cleanly, then verify blacklist_all_user_tokens revokes OAuth access + refresh
        user.is_active = True
        user.save(update_fields=["is_active"])
        assert oauth_client.get("/api/v1/oauth/verify/").status_code == status.HTTP_200_OK

        blacklist_all_user_tokens(user)
        assert oauth_client.get("/api/v1/oauth/verify/").status_code == status.HTTP_401_UNAUTHORIZED
        assert oauth_client.get("/api/v1/documents/").status_code == status.HTTP_401_UNAUTHORIZED

        refresh_res = anon.post(
            "/api/v1/oauth/token/",
            {
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
            },
        )
        assert refresh_res.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_401_UNAUTHORIZED)

    def test_oauth_blocks_trash_and_governance_actions_and_plaintext_prod_redirects(
        self, admin_user, dataroom, document, user2
    ):
        anon = APIClient()

        # Production scheme restriction blocks plaintext http:// redirect URIs at DCR
        prod_oauth = {**settings.OAUTH2_PROVIDER, "ALLOWED_REDIRECT_URI_SCHEMES": ["https"]}
        with override_settings(OAUTH2_PROVIDER=prod_oauth):
            bad_reg = anon.post(
                "/api/v1/oauth/register/",
                {
                    "client_name": "Plaintext Client",
                    "redirect_uris": ["http://evil.example.com/cb"],
                    "grant_types": ["authorization_code"],
                    "response_types": ["code"],
                    "token_endpoint_auth_method": "none",
                },
                format="json",
            )
            assert bad_reg.status_code == status.HTTP_400_BAD_REQUEST

        redirect_uri = "https://gemini.google.com/oauth/callback"
        client_id = anon.post(
            "/api/v1/oauth/register/",
            {
                "client_name": "Gemini Write App",
                "redirect_uris": [redirect_uri],
                "grant_types": ["authorization_code"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",
            },
            format="json",
        ).json()["client_id"]

        verifier, challenge = _pkce_pair()
        jwt_client = _jwt_client(admin_user)
        consent_res = jwt_client.post(
            "/api/v1/oauth/consent/",
            {
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "write",
                "state": "s3",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "allow": True,
                "scopes": ["write"],
            },
            format="json",
        )
        code = parse_qs(urlparse(consent_res.json()["redirect_url"]).query)["code"][0]
        token = anon.post(
            "/api/v1/oauth/token/",
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": client_id,
                "code_verifier": verifier,
            },
        ).json()["access_token"]

        write_client = APIClient()
        write_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

        # Trash and dataroom governance actions are denied even with write scope
        assert write_client.get("/api/v1/trash/").status_code == status.HTTP_403_FORBIDDEN
        assert write_client.post("/api/v1/trash/empty/").status_code == status.HTTP_403_FORBIDDEN
        assert (
            write_client.post(
                f"/api/v1/datarooms/{dataroom.id}/transfer-ownership/",
                {"new_owner_id": str(user2.id)},
                format="json",
            ).status_code
            == status.HTTP_403_FORBIDDEN
        )
        assert (
            write_client.delete(
                f"/api/v1/datarooms/{dataroom.id}/collaborators/{user2.id}/"
            ).status_code
            == status.HTTP_403_FORBIDDEN
        )
        # DELETE requests and requires_full_access actions (e.g. remove-content) are denied for write scope
        assert (
            write_client.delete(f"/api/v1/documents/{document.id}/").status_code
            == status.HTTP_403_FORBIDDEN
        )
        assert (
            write_client.delete(f"/api/v1/datarooms/{dataroom.id}/").status_code
            == status.HTTP_403_FORBIDDEN
        )
        assert (
            write_client.post(
                f"/api/v1/datarooms/{dataroom.id}/remove-content/",
                {"dataroom_document_ids": []},
                format="json",
            ).status_code
            == status.HTTP_403_FORBIDDEN
        )

    def test_oauth_rfc8707_mcp_resource_audience_binding(self, user):
        anon = APIClient()
        redirect_uri = "https://claude.ai/api/mcp/auth_callback"
        client_id = anon.post(
            "/api/v1/oauth/register/",
            {
                "client_name": "Claude MCP",
                "redirect_uris": [redirect_uri],
                "grant_types": ["authorization_code"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",
            },
            format="json",
        ).json()["client_id"]

        mcp_resource = "https://app.coneshare.com/mcp/sse"
        foreign_resource = "https://other.example.com/api"
        verifier, challenge = _pkce_pair()
        jwt_client = _jwt_client(user)

        with override_settings(SITE_DOMAIN="https://app.coneshare.com", MCP_PATH="/mcp/sse"):
            # Issue token bound to ConeShare MCP resource
            consent_mcp = jwt_client.post(
                "/api/v1/oauth/consent/",
                {
                    "client_id": client_id,
                    "redirect_uri": redirect_uri,
                    "response_type": "code",
                    "scope": "read",
                    "state": "s_mcp",
                    "code_challenge": challenge,
                    "code_challenge_method": "S256",
                    "resource": mcp_resource,
                    "allow": True,
                },
                format="json",
            )
            assert consent_mcp.status_code == status.HTTP_200_OK
            mcp_code = parse_qs(urlparse(consent_mcp.json()["redirect_url"]).query)["code"][0]
            mcp_token = anon.post(
                "/api/v1/oauth/token/",
                {
                    "grant_type": "authorization_code",
                    "code": mcp_code,
                    "redirect_uri": redirect_uri,
                    "client_id": client_id,
                    "code_verifier": verifier,
                    "resource": mcp_resource,
                },
            ).json()["access_token"]

            mcp_client = APIClient()
            mcp_client.credentials(HTTP_AUTHORIZATION=f"Bearer {mcp_token}")
            verify_ok = mcp_client.get("/api/v1/oauth/verify/", {"resource": mcp_resource})
            assert verify_ok.status_code == status.HTTP_200_OK
            assert verify_ok.json()["aud"] == [mcp_resource]
            assert mcp_client.get("/api/v1/documents/").status_code == status.HTTP_200_OK
            # Verify mismatched requested resource is rejected even if token matches MCP
            assert (
                mcp_client.get("/api/v1/oauth/verify/", {"resource": foreign_resource}).status_code
                == status.HTTP_401_UNAUTHORIZED
            )

            # Issue token bound to a foreign resource and confirm replay is rejected everywhere
            consent_foreign = jwt_client.post(
                "/api/v1/oauth/consent/",
                {
                    "client_id": client_id,
                    "redirect_uri": redirect_uri,
                    "response_type": "code",
                    "scope": "read",
                    "state": "s_for",
                    "code_challenge": challenge,
                    "code_challenge_method": "S256",
                    "resource": foreign_resource,
                    "allow": True,
                },
                format="json",
            )
            foreign_code = parse_qs(urlparse(consent_foreign.json()["redirect_url"]).query)["code"][0]
            foreign_token = anon.post(
                "/api/v1/oauth/token/",
                {
                    "grant_type": "authorization_code",
                    "code": foreign_code,
                    "redirect_uri": redirect_uri,
                    "client_id": client_id,
                    "code_verifier": verifier,
                    "resource": foreign_resource,
                },
            ).json()["access_token"]

            foreign_client = APIClient()
            foreign_client.credentials(HTTP_AUTHORIZATION=f"Bearer {foreign_token}")
            assert foreign_client.get("/api/v1/oauth/verify/", {"resource": mcp_resource}).status_code == status.HTTP_401_UNAUTHORIZED
            assert foreign_client.get("/api/v1/documents/").status_code == status.HTTP_401_UNAUTHORIZED

    def test_dcr_view_configures_oauth_dcr_scope_throttle(self):
        assert ThrottledDynamicClientRegistrationView.throttle_scope == "oauth_dcr"
        assert ThrottledDynamicClientRegistrationManagementView.throttle_scope == "oauth_dcr"
        assert settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["oauth_dcr"] == "20/hour"

    def test_oauth_trusted_client_domain_allowlist_and_dcr_enforcement(self, user):
        anon = APIClient()

        # Default allowlist accepts the four supported web clients
        supported_uris = [
            "https://chatgpt.com/connector_platform_oauth_redirect",
            "https://platform.openai.com/oauth/callback",
            "https://claude.ai/api/mcp/auth_callback",
            "https://gemini.google.com/oauth/callback",
            "https://vertexaisearch.cloud.google.com/oauth-redirect",
            "https://oauth-redirect.googleusercontent.com/r/project-id",
            "https://grok.com/oauth/callback",
            "https://x.ai/oauth/callback",
        ]
        for uri in supported_uris:
            assert is_trusted_oauth_redirect_uri(uri) is True

        res = anon.post(
            "/api/v1/oauth/register/",
            {
                "client_name": "Supported Web Client",
                "redirect_uris": supported_uris,
                "grant_types": ["authorization_code"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",
            },
            format="json",
        )
        assert res.status_code == status.HTTP_201_CREATED

        # Untrusted redirect domain is rejected at DCR registration
        rejected = anon.post(
            "/api/v1/oauth/register/",
            {
                "client_name": "Other Client",
                "redirect_uris": ["https://other-client.example.com/oauth/callback"],
                "grant_types": ["authorization_code"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",
            },
            format="json",
        )
        assert rejected.status_code == status.HTTP_400_BAD_REQUEST
        assert rejected.json()["error"] == "invalid_client_metadata"

        # Whitespace-separated multi-URI string in one entry cannot bypass DCR domain checks
        assert is_trusted_oauth_redirect_uri("https://claude.ai/cb https://evil.com/steal") is False
        whitespace_bypass = anon.post(
            "/api/v1/oauth/register/",
            {
                "client_name": "Bypass Attempt",
                "redirect_uris": ["https://claude.ai/cb https://evil.com/steal"],
                "grant_types": ["authorization_code"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",
            },
            format="json",
        )
        assert whitespace_bypass.status_code == status.HTTP_400_BAD_REQUEST
        assert whitespace_bypass.json()["error"] == "invalid_client_metadata"

        # DCR PUT cannot update redirect_uris to an unlisted domain
        reg_res = anon.post(
            "/api/v1/oauth/register/",
            {
                "client_name": "Claude Client",
                "redirect_uris": ["https://claude.ai/api/mcp/auth_callback"],
                "grant_types": ["authorization_code"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",
            },
            format="json",
        )
        reg_data = reg_res.json()
        mgmt_client = APIClient()
        mgmt_client.credentials(HTTP_AUTHORIZATION=f"Bearer {reg_data['registration_access_token']}")
        bad_put = mgmt_client.put(
            f"/api/v1/oauth/register/{reg_data['client_id']}/",
            {
                "client_name": "Claude Client",
                "redirect_uris": ["https://other-client.example.com/cb"],
                "grant_types": ["authorization_code"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",
            },
            format="json",
        )
        assert bad_put.status_code == status.HTTP_400_BAD_REQUEST
        assert bad_put.json()["error"] == "invalid_client_metadata"

        # Customizing OAUTH_ALLOWED_CLIENT_DOMAINS updates DCR and consent validation dynamically
        _, challenge = _pkce_pair()
        jwt_client = _jwt_client(user)
        with override_settings(OAUTH_ALLOWED_CLIENT_DOMAINS=["*.custom-ai.example.com"]):
            custom_ok = anon.post(
                "/api/v1/oauth/register/",
                {
                    "client_name": "Custom AI",
                    "redirect_uris": ["https://app.custom-ai.example.com/cb"],
                    "grant_types": ["authorization_code"],
                    "response_types": ["code"],
                    "token_endpoint_auth_method": "none",
                },
                format="json",
            )
            assert custom_ok.status_code == status.HTTP_201_CREATED

            # Previously registered claude.ai client is blocked at consent once removed from allowlist
            consent_blocked = jwt_client.get(
                "/api/v1/oauth/consent/",
                {
                    "client_id": reg_data["client_id"],
                    "redirect_uri": "https://claude.ai/api/mcp/auth_callback",
                    "response_type": "code",
                    "scope": "read",
                    "code_challenge": challenge,
                    "code_challenge_method": "S256",
                },
            )
            assert consent_blocked.status_code == status.HTTP_400_BAD_REQUEST
            assert consent_blocked.json()["error"] == "invalid_redirect_uri"

    def test_oauth_cimd_allowlist_and_localhost_loopback_default(self):
        default_oauth = {
            **settings.OAUTH2_PROVIDER,
            "ALLOW_LOCALHOST_LOOPBACK": False,
        }
        with override_settings(OAUTH_ALLOW_LOCALHOST_LOOPBACK=False, OAUTH2_PROVIDER=default_oauth):
            assert settings.OAUTH_ALLOW_LOCALHOST_LOOPBACK is False
            assert oauth2_settings.ALLOW_LOCALHOST_LOOPBACK is False
            assert HostAllowlistCIMDPermission in oauth2_settings.CIMD_REGISTRATION_PERMISSION_CLASSES

            perm = HostAllowlistCIMDPermission()
            assert perm.has_permission(None, "https://chatgpt.com/oauth/client.json") is True
            assert perm.has_permission(None, "https://claude.ai/oauth/client.json") is True
            assert perm.has_permission(None, "https://other-client.example.com/client.json") is False

            anon = APIClient()
            # Localhost loopback redirect URI is rejected when ALLOW_LOCALHOST_LOOPBACK is false
            loopback_denied = anon.post(
                "/api/v1/oauth/register/",
                {
                    "client_name": "Local CLI",
                    "redirect_uris": ["http://localhost:8787/callback"],
                    "grant_types": ["authorization_code"],
                    "response_types": ["code"],
                    "token_endpoint_auth_method": "none",
                },
                format="json",
            )
            assert loopback_denied.status_code == status.HTTP_400_BAD_REQUEST

        # Enabling ALLOW_LOCALHOST_LOOPBACK permits HTTP(S) loopback in production while rejecting
        # non-HTTP schemes and non-loopback HTTP redirects
        loopback_oauth = {
            **settings.OAUTH2_PROVIDER,
            "ALLOW_LOCALHOST_LOOPBACK": True,
            "ALLOWED_REDIRECT_URI_SCHEMES": ["https", "http"],
        }
        with override_settings(DEBUG=False, OAUTH2_PROVIDER=loopback_oauth):
            assert is_trusted_oauth_redirect_uri("javascript://localhost/%0aalert(1)") is False
            assert is_trusted_oauth_redirect_uri("ftp://localhost/cb") is False
            assert is_trusted_oauth_redirect_uri("http://chatgpt.com/cb") is False
            assert is_trusted_oauth_redirect_uri("http://localhost:8787/callback") is True

            loopback_ok = anon.post(
                "/api/v1/oauth/register/",
                {
                    "client_name": "Local CLI",
                    "redirect_uris": ["http://localhost:8787/callback"],
                    "grant_types": ["authorization_code"],
                    "response_types": ["code"],
                    "token_endpoint_auth_method": "none",
                },
                format="json",
            )
            assert loopback_ok.status_code == status.HTTP_201_CREATED

            non_loopback_http = anon.post(
                "/api/v1/oauth/register/",
                {
                    "client_name": "Insecure Remote",
                    "redirect_uris": ["http://chatgpt.com/cb"],
                    "grant_types": ["authorization_code"],
                    "response_types": ["code"],
                    "token_endpoint_auth_method": "none",
                },
                format="json",
            )
            assert non_loopback_http.status_code == status.HTTP_400_BAD_REQUEST
            assert non_loopback_http.json()["error"] == "invalid_client_metadata"

    def test_parse_oauth_allowed_client_domains(self):
        assert _parse_oauth_allowed_client_domains(None) == DEFAULT_OAUTH_ALLOWED_CLIENT_DOMAINS
        assert _parse_oauth_allowed_client_domains("   ") == DEFAULT_OAUTH_ALLOWED_CLIENT_DOMAINS
        assert _parse_oauth_allowed_client_domains(" *.example.com , api.test.org ") == [
            ".example.com",
            "api.test.org",
        ]
        assert _parse_oauth_allowed_client_domains("*") == ["*"]

    def test_summarize_dcr_payload_bounds_and_excludes_credentials(self):
        # Non-JSON and non-object JSON payloads are never echoed raw
        assert _summarize_dcr_payload(b"line1\nline2 fake log") == "<non-json payload: 20 bytes>"
        assert _summarize_dcr_payload(b"\xff\xfe") == "<non-json payload: 2 bytes>"
        assert _summarize_dcr_payload(b'["a","b"]') == "<non-object json payload: 9 bytes>"

        # Sensitive credentials and unknown nested keys are omitted
        summary = _summarize_dcr_payload(
            (
                '{"client_id":"cli_1","client_name":"Gemini","client_secret":"topsecret",'
                '"registration_access_token":"rat_secret","jwks":{"private":"key"},'
                '"redirect_uris":["https://claude.ai/cb"]}'
            ).encode("utf-8")
        )
        assert "topsecret" not in summary
        assert "rat_secret" not in summary
        assert "jwks" not in summary
        assert "cli_1" in summary
        assert "Gemini" in summary

        # Huge JSON payloads are bounded
        huge_summary = _summarize_dcr_payload(
            ('{"client_name":"' + ("x" * 5000) + '"}').encode("utf-8")
        )
        assert huge_summary.endswith("...(truncated)")
        assert len(huge_summary) <= 2065
