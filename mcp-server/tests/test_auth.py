import hashlib
import time
from unittest.mock import patch
import httpx
from starlette.testclient import TestClient

from coneshare_mcp.auth import ConeshareTokenVerifier, CONESHARE_OAUTH_SCOPES, build_auth_provider
from coneshare_mcp.client import ConeshareClient
from coneshare_mcp.config import Settings
from coneshare_mcp.server import create_mcp_server
from tests.base import BaseMCPTestCase


class TestMCPAuth(BaseMCPTestCase):
    async def test_token_verifier_accepts_oauth_and_api_key(self):
        verifier = ConeshareTokenVerifier(
            api_url="http://backend:8000/api/v1",
            base_url="https://app.coneshare.com",
            resource_url="https://app.coneshare.com/mcp/sse",
            cache_ttl_seconds=30.0,
        )
        recorded_calls = []

        class MockVerifyClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def get(self, url, params=None, headers=None):
                recorded_calls.append((url, params))
                token = (headers or {}).get("Authorization", "")
                if token == "Bearer oauth_valid_tok":
                    return httpx.Response(
                        200,
                        json={
                            "active": True,
                            "auth_type": "oauth2",
                            "client_id": "cli_abc",
                            "user_id": "usr_1",
                            "scopes": ["documents:read", "documents:write"],
                            "exp": int(time.time()) + 300,
                        },
                        request=httpx.Request("GET", url),
                    )
                if token == "Bearer cs_live_valid1234":
                    return httpx.Response(
                        200,
                        json={
                            "active": True,
                            "auth_type": "api_key",
                            "client_id": "apikey:cs_live_vali",
                            "user_id": "usr_1",
                            "scopes": CONESHARE_OAUTH_SCOPES,
                            "exp": None,
                        },
                        request=httpx.Request("GET", url),
                    )
                return httpx.Response(401, json={"active": False}, request=httpx.Request("GET", url))

        with patch("coneshare_mcp.auth.httpx.AsyncClient", MockVerifyClient):
            oauth_access = await verifier.verify_token("oauth_valid_tok")
            self.assertIsNotNone(oauth_access)
            assert oauth_access is not None
            self.assertEqual(oauth_access.client_id, "cli_abc")
            self.assertEqual(oauth_access.scopes, ["documents:read", "documents:write"])
            self.assertEqual(oauth_access.claims.get("auth_type"), "oauth2")
            self.assertEqual(recorded_calls[0][1], {"resource": "https://app.coneshare.com/mcp/sse"})

            # Second verification within TTL hits cache without an HTTP round-trip
            cached_access = await verifier.verify_token("oauth_valid_tok")
            self.assertEqual(cached_access, oauth_access)
            self.assertEqual(len(recorded_calls), 1)
            expected_digest = hashlib.sha256(b"oauth_valid_tok").hexdigest()
            self.assertIn(expected_digest, verifier._cache)
            self.assertNotIn("oauth_valid_tok", verifier._cache)

            api_key_access = await verifier.verify_token("cs_live_valid1234")
            self.assertIsNotNone(api_key_access)
            assert api_key_access is not None
            self.assertEqual(api_key_access.client_id, "apikey:cs_live_vali")
            self.assertEqual(api_key_access.claims.get("auth_type"), "api_key")

            self.assertIsNone(await verifier.verify_token("invalid_token"))
            self.assertIsNone(await verifier.verify_token("   "))

    def test_unauthenticated_http_challenge_and_protected_resource_metadata(self):
        settings = Settings(
            api_url="http://backend:8000/api/v1",
            mcp_transport="streamable-http",
            mcp_host="0.0.0.0",
            mcp_port=8001,
            mcp_path="/mcp/sse",
            oauth_enabled=True,
            mcp_public_url="https://app.coneshare.com",
            oauth_issuer_url="https://app.coneshare.com",
        )
        server = create_mcp_server(settings)
        app = server.http_app(path="/mcp/sse", transport="streamable-http")

        with TestClient(app) as client:
            # 1. Protected Resource Metadata (RFC 9728) available at path-suffixed and root URLs
            for meta_path in (
                "/.well-known/oauth-protected-resource/mcp/sse",
                "/.well-known/oauth-protected-resource",
            ):
                meta_res = client.get(meta_path)
                self.assertEqual(meta_res.status_code, 200, f"Failed on {meta_path}")
                meta = meta_res.json()
                self.assertEqual(meta["resource"], "https://app.coneshare.com/mcp/sse")
                self.assertEqual(meta["authorization_servers"], ["https://app.coneshare.com/"])
                self.assertEqual(meta["scopes_supported"], CONESHARE_OAUTH_SCOPES)

            # 2. Unauthenticated MCP request returns 401 with WWW-Authenticate discovery header
            unauth = client.post(
                "/mcp/sse",
                json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
            )
            self.assertEqual(unauth.status_code, 401)
            www_auth = unauth.headers.get("www-authenticate", "")
            self.assertIn("Bearer", www_auth)
            self.assertIn(
                "https://app.coneshare.com/.well-known/oauth-protected-resource/mcp/sse",
                www_auth,
            )

    def test_from_ctx_falls_back_to_fastmcp_access_token(self):
        fake_access_token = type("Tok", (), {"token": "oauth_tok_from_ctx"})()
        with (
            patch("coneshare_mcp.client.get_http_request", side_effect=RuntimeError("no http request")),
            patch("coneshare_mcp.client.get_access_token", return_value=fake_access_token),
        ):
            client = ConeshareClient.from_ctx(None)
        self.assertEqual(client.headers["Authorization"], "Bearer oauth_tok_from_ctx")

    def test_build_auth_provider_can_be_disabled(self):
        settings = Settings(
            api_url="http://backend:8000/api/v1",
            mcp_transport="streamable-http",
            mcp_host="0.0.0.0",
            mcp_port=8001,
            mcp_path="/mcp/sse",
            oauth_enabled=False,
        )
        self.assertIsNone(build_auth_provider(settings))
