from unittest.mock import MagicMock, AsyncMock, patch
from fastmcp import FastMCP
from coneshare_mcp.client import ConeshareClient
from coneshare_mcp.tools.admin import register_admin_tools
from tests.base import BaseMCPTestCase


class TestAdmin(BaseMCPTestCase):
    async def test_list_admin_users(self):
        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            self.assertEqual(method, "GET")
            self.assertEqual(path, "/admin/users/")
            return {
                "count": 2,
                "next": None,
                "results": [
                    {"id": "usr_1", "email": "admin@example.com", "role": "admin"},
                    {"id": "usr_2", "email": "member@example.com", "role": "member"},
                ],
            }

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            res = await client.list_admin_users(page=1, page_size=20)
            self.assertEqual(res["total_count"], 2)
            self.assertEqual(len(res["items"]), 2)
            self.assertEqual(res["items"][0]["role"], "admin")
        finally:
            ConeshareClient._request = old_request

    async def test_get_admin_user_details(self):
        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            self.assertEqual(method, "GET")
            self.assertEqual(path, "/admin/users/usr_1/")
            return {
                "id": "usr_1",
                "email": "admin@example.com",
                "total_links": 12,
                "total_datarooms": 3,
                "total_views": 85,
            }

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            res = await client.get_admin_user_details("usr_1")
            self.assertEqual(res["id"], "usr_1")
            self.assertEqual(res["total_links"], 12)
            self.assertEqual(res["total_views"], 85)
        finally:
            ConeshareClient._request = old_request

    async def test_list_login_activities(self):
        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            self.assertEqual(method, "GET")
            self.assertEqual(path, "/admin/login-activities/")
            return {
                "count": 1,
                "next": None,
                "results": [
                    {
                        "id": "log_1",
                        "ip_address": "127.0.0.1",
                        "user_agent": "Mozilla/5.0",
                        "created_at": "2026-07-31T12:00:00Z",
                    }
                ],
            }

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            res = await client.list_login_activities(page=1)
            self.assertEqual(res["total_count"], 1)
            self.assertEqual(res["items"][0]["ip_address"], "127.0.0.1")
        finally:
            ConeshareClient._request = old_request

    async def test_list_admin_users_tool_execution(self):
        mcp = FastMCP("test_mcp")
        register_admin_tools(mcp)

        mock_client = MagicMock()
        mock_client.list_admin_users = AsyncMock(return_value={"total_count": 2, "items": []})
        mock_ctx = MagicMock()

        tool = await mcp.get_tool("list_admin_users")
        with patch("coneshare_mcp.tools.admin.ConeshareClient.from_ctx", return_value=mock_client):
            res = await tool.fn(ctx=mock_ctx, page=1, page_size=20, search=None)
        self.assertEqual(res["total_count"], 2)
        mock_client.list_admin_users.assert_awaited_once_with(page=1, page_size=20, search=None)
