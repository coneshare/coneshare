import json
from types import SimpleNamespace
from unittest.mock import patch
from starlette.testclient import TestClient

from fastmcp.exceptions import ToolError
from fastmcp.server.auth import AccessToken

from coneshare_mcp.config import Settings
from coneshare_mcp.server import create_mcp_server
from coneshare_mcp.toolsets import (
    BASE_PRESET_ALL,
    BASE_PRESET_CORE,
    BASE_PRESET_DEFAULT,
    evaluate_tool_access,
    extract_requested_toolsets_raw,
    parse_requested_toolsets,
)
from tests.base import BaseMCPTestCase


def _parse_sse_json(body: str) -> dict:
    for line in body.splitlines():
        if line.startswith("data: "):
            return json.loads(line[6:])
    return json.loads(body)


class TestMCPToolsets(BaseMCPTestCase):
    @staticmethod
    def _http_settings(oauth_enabled: bool = False) -> Settings:
        return Settings(
            api_url="http://backend:8000/api/v1",
            mcp_transport="streamable-http",
            mcp_host="127.0.0.1",
            mcp_port=8001,
            mcp_path="/mcp/sse",
            oauth_enabled=oauth_enabled,
            site_domain="https://app.coneshare.com" if oauth_enabled else "",
        )

    def test_parse_requested_toolsets_precedence_and_unknown_tokens(self):
        self.assertEqual(parse_requested_toolsets(None), BASE_PRESET_DEFAULT)
        self.assertEqual(parse_requested_toolsets("   "), BASE_PRESET_DEFAULT)
        self.assertEqual(parse_requested_toolsets("default"), BASE_PRESET_DEFAULT)
        self.assertEqual(parse_requested_toolsets("core"), BASE_PRESET_CORE)
        self.assertEqual(parse_requested_toolsets("default,core"), BASE_PRESET_CORE)
        self.assertEqual(parse_requested_toolsets("all,core,default"), BASE_PRESET_ALL)
        self.assertEqual(parse_requested_toolsets("admin"), BASE_PRESET_DEFAULT | {"admin"})
        self.assertEqual(parse_requested_toolsets("core,folders"), BASE_PRESET_CORE | {"folders"})
        self.assertEqual(parse_requested_toolsets("core,admin"), BASE_PRESET_CORE | {"admin"})

        with self.assertLogs("coneshare_mcp.toolsets", level="WARNING") as logs:
            parsed = parse_requested_toolsets("core, bogus_set , admin")
        self.assertEqual(parsed, BASE_PRESET_CORE | {"admin"})
        self.assertTrue(any("bogus_set" in entry for entry in logs.output))

    def test_extract_requested_toolsets_raw_prefers_query_then_header_and_handles_stdio(self):
        with patch("coneshare_mcp.toolsets.get_http_request", side_effect=RuntimeError("no http request")):
            self.assertIsNone(extract_requested_toolsets_raw())

        req_both = SimpleNamespace(
            query_params={"toolsets": "core"},
            headers={"x-coneshare-toolsets": "all"},
        )
        with patch("coneshare_mcp.toolsets.get_http_request", return_value=req_both):
            self.assertEqual(extract_requested_toolsets_raw(), "core")

        req_header = SimpleNamespace(
            query_params={},
            headers={"X-Coneshare-Toolsets": "core,admin"},
        )
        with patch("coneshare_mcp.toolsets.get_http_request", return_value=req_header):
            self.assertEqual(extract_requested_toolsets_raw(), "core,admin")

    async def test_middleware_toolset_presets_and_fail_closed_execution(self):
        server = create_mcp_server(self._http_settings())

        # Default (no HTTP request -> stdio fallback -> default preset = 32 tools, admin excluded)
        default_tools = await server.list_tools()
        default_names = {t.name for t in default_tools}
        self.assertEqual(len(default_names), 32)
        self.assertNotIn("list_admin_users", default_names)
        self.assertIn("create_folder", default_names)
        self.assertIn("remove_content_from_dataroom", default_names)

        with self.assertRaises(ToolError) as err_ctx:
            await server.call_tool("list_admin_users", {})
        self.assertIn("?toolsets=admin", str(err_ctx.exception))

        # ?toolsets=core -> 24 tools (excludes admin, folders, destructive)
        req_core = SimpleNamespace(query_params={"toolsets": "core"}, headers={})
        with patch("coneshare_mcp.toolsets.get_http_request", return_value=req_core):
            core_names = {t.name for t in await server.list_tools()}
            self.assertEqual(len(core_names), 24)
            self.assertNotIn("list_folders", core_names)
            self.assertNotIn("delete_document", core_names)
            self.assertNotIn("remove_content_from_dataroom", core_names)
            self.assertNotIn("list_admin_users", core_names)
            with self.assertRaises(ToolError) as core_err:
                await server.call_tool("list_folders", {})
            self.assertIn("folders", str(core_err.exception))

        # ?toolsets=core,folders -> 28 tools (includes non-destructive folders, still excludes delete_folder)
        req_core_folders = SimpleNamespace(query_params={"toolsets": "core,folders"}, headers={})
        with patch("coneshare_mcp.toolsets.get_http_request", return_value=req_core_folders):
            cf_names = {t.name for t in await server.list_tools()}
            self.assertEqual(len(cf_names), 28)
            self.assertIn("list_folders", cf_names)
            self.assertNotIn("delete_folder", cf_names)
            with self.assertRaises(ToolError):
                await server.call_tool("delete_folder", {"folder_id": "fld_1"})

        # ?toolsets=core,admin -> 27 tools
        req_core_admin = SimpleNamespace(query_params={"toolsets": "core,admin"}, headers={})
        with patch("coneshare_mcp.toolsets.get_http_request", return_value=req_core_admin):
            ca_names = {t.name for t in await server.list_tools()}
            self.assertEqual(len(ca_names), 27)
            self.assertIn("list_admin_users", ca_names)

        # ?toolsets=admin / ?toolsets=all -> 35 tools
        for raw in ("admin", "all"):
            req = SimpleNamespace(query_params={"toolsets": raw}, headers={})
            with patch("coneshare_mcp.toolsets.get_http_request", return_value=req):
                names = {t.name for t in await server.list_tools()}
                self.assertEqual(len(names), 35)
                self.assertIn("list_admin_users", names)

    async def test_auth_aware_pruning_for_oauth2_and_read_only_tokens(self):
        server = create_mcp_server(self._http_settings())

        # OAuth 2.1 with read+write scopes requesting ?toolsets=all:
        # hides admin (3), destructive (4), and viewer_analytics (2) -> 26 tools
        oauth_rw = AccessToken(
            token="oauth_tok",
            client_id="cli_1",
            scopes=["read", "write"],
            claims={"auth_type": "oauth2", "user_id": "usr_1"},
        )
        req_all = SimpleNamespace(query_params={"toolsets": "all"}, headers={})
        with (
            patch("coneshare_mcp.toolsets.get_http_request", return_value=req_all),
            patch("coneshare_mcp.toolsets.get_access_token", return_value=oauth_rw),
        ):
            oauth_names = {t.name for t in await server.list_tools()}
            self.assertEqual(len(oauth_names), 26)
            self.assertIn("get_document_analytics", oauth_names)
            self.assertNotIn("list_view_sessions", oauth_names)
            self.assertNotIn("get_view_session", oauth_names)
            self.assertNotIn("remove_content_from_dataroom", oauth_names)
            self.assertNotIn("delete_document", oauth_names)
            self.assertNotIn("list_admin_users", oauth_names)
            for blocked in ("list_admin_users", "remove_content_from_dataroom", "list_view_sessions", "get_view_session"):
                with self.assertRaises(ToolError):
                    await server.call_tool(blocked, {})

        # OAuth 2.1 + ?toolsets=core -> 22 tools (24 core - 2 viewer_analytics)
        req_core = SimpleNamespace(query_params={"toolsets": "core"}, headers={})
        with (
            patch("coneshare_mcp.toolsets.get_http_request", return_value=req_core),
            patch("coneshare_mcp.toolsets.get_access_token", return_value=oauth_rw),
        ):
            oauth_core_names = {t.name for t in await server.list_tools()}
            self.assertEqual(len(oauth_core_names), 22)

        # Read-only API key requesting ?toolsets=all: keeps only `read` tools (no write/destructive)
        ro_apikey = AccessToken(
            token="cs_live_ro",
            client_id="apikey:cs_live_ro",
            scopes=["read"],
            claims={"auth_type": "api_key", "user_id": "usr_1"},
        )
        with (
            patch("coneshare_mcp.toolsets.get_http_request", return_value=req_all),
            patch("coneshare_mcp.toolsets.get_access_token", return_value=ro_apikey),
        ):
            ro_names = {t.name for t in await server.list_tools()}
            self.assertIn("list_documents", ro_names)
            self.assertIn("list_view_sessions", ro_names)
            self.assertIn("list_admin_users", ro_names)
            self.assertNotIn("create_text_document", ro_names)
            self.assertNotIn("delete_document", ro_names)
            self.assertNotIn("remove_content_from_dataroom", ro_names)
            with self.assertRaises(ToolError):
                await server.call_tool("create_text_document", {"file_name": "a.md", "content": "x"})

    def test_evaluate_tool_access_requires_valid_functional_tags(self):
        allowed, reason = evaluate_tool_access("untagged", {"read"}, BASE_PRESET_DEFAULT, None)
        self.assertFalse(allowed)
        self.assertIsNotNone(reason)

    def test_http_transport_query_and_header_filtering(self):
        server = create_mcp_server(self._http_settings(oauth_enabled=False))
        app = server.http_app(path="/mcp/sse", transport="streamable-http")

        with TestClient(app) as client:
            init_res = client.post(
                "/mcp/sse",
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2025-03-26",
                        "capabilities": {},
                        "clientInfo": {"name": "test", "version": "1.0"},
                    },
                },
                headers={"Accept": "application/json, text/event-stream"},
            )
            self.assertEqual(init_res.status_code, 200)
            session_id = init_res.headers.get("mcp-session-id")
            base_headers = {"Accept": "application/json, text/event-stream"}
            if session_id:
                base_headers["mcp-session-id"] = session_id

            client.post(
                "/mcp/sse",
                json={"jsonrpc": "2.0", "method": "notifications/initialized"},
                headers=base_headers,
            )

            default_list = _parse_sse_json(
                client.post(
                    "/mcp/sse",
                    json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
                    headers=base_headers,
                ).text
            )
            self.assertEqual(len(default_list["result"]["tools"]), 32)

            core_list = _parse_sse_json(
                client.post(
                    "/mcp/sse?toolsets=core",
                    json={"jsonrpc": "2.0", "id": 3, "method": "tools/list", "params": {}},
                    headers=base_headers,
                ).text
            )
            self.assertEqual(len(core_list["result"]["tools"]), 24)

            header_admin_list = _parse_sse_json(
                client.post(
                    "/mcp/sse",
                    json={"jsonrpc": "2.0", "id": 4, "method": "tools/list", "params": {}},
                    headers={**base_headers, "X-Coneshare-Toolsets": "admin"},
                ).text
            )
            self.assertEqual(len(header_admin_list["result"]["tools"]), 35)

    def test_http_oauth2_with_toolsets_core_query_param(self):
        server = create_mcp_server(self._http_settings(oauth_enabled=True))
        app = server.http_app(path="/mcp/sse", transport="streamable-http")

        oauth_rw = AccessToken(
            token="oauth_valid_tok",
            client_id="cli_web",
            scopes=["read", "write"],
            claims={"auth_type": "oauth2", "user_id": "usr_1"},
        )
        verifier = server.auth.token_verifier  # type: ignore[union-attr]

        with (
            patch.object(verifier, "verify_token", return_value=oauth_rw),
            TestClient(app) as client,
        ):
            auth_headers = {
                "Accept": "application/json, text/event-stream",
                "Authorization": "Bearer oauth_valid_tok",
            }
            init_res = client.post(
                "/mcp/sse?toolsets=core",
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2025-03-26",
                        "capabilities": {},
                        "clientInfo": {"name": "webai", "version": "1.0"},
                    },
                },
                headers=auth_headers,
            )
            self.assertEqual(init_res.status_code, 200)
            session_id = init_res.headers.get("mcp-session-id")
            if session_id:
                auth_headers["mcp-session-id"] = session_id

            client.post(
                "/mcp/sse?toolsets=core",
                json={"jsonrpc": "2.0", "method": "notifications/initialized"},
                headers=auth_headers,
            )

            listed = _parse_sse_json(
                client.post(
                    "/mcp/sse?toolsets=core",
                    json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
                    headers=auth_headers,
                ).text
            )
            tool_names = {t["name"] for t in listed["result"]["tools"]}
            self.assertEqual(len(tool_names), 22)
            self.assertIn("get_document_analytics", tool_names)
            self.assertNotIn("list_view_sessions", tool_names)
            self.assertNotIn("get_view_session", tool_names)
            self.assertNotIn("remove_content_from_dataroom", tool_names)
            self.assertNotIn("list_admin_users", tool_names)
