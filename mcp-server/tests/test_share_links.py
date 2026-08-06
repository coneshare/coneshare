from unittest.mock import MagicMock, AsyncMock, patch
from fastmcp import FastMCP
from coneshare_mcp.client import ConeshareClient
from coneshare_mcp.tools.share_links import register_share_link_tools
from tests.base import BaseMCPTestCase


class TestShareLinks(BaseMCPTestCase):
    async def test_create_share_link(self):
        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            self.assertEqual(method, "POST")
            self.assertEqual(path, "/share-links/")
            self.assertEqual(json_data["document"], "doc_999")
            self.assertTrue(json_data["enable_watermark"])
            return {"id": "lnk_100", "token": "abcdef123456"}

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            res = await client.create_share_link({
                "document": "doc_999",
                "enable_watermark": True,
            })
            self.assertEqual(res["id"], "lnk_100")
            self.assertEqual(res["token"], "abcdef123456")
        finally:
            ConeshareClient._request = old_request

    async def test_update_share_link_clear_expiration(self):
        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            self.assertEqual(method, "PATCH")
            self.assertEqual(path, "/share-links/lnk_100/")
            self.assertIn("expires_at", json_data)
            self.assertIsNone(json_data["expires_at"])
            return {"id": "lnk_100", "expires_at": None}

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            res = await client.update_share_link("lnk_100", {"expires_at": None})
            self.assertIsNone(res["expires_at"])
        finally:
            ConeshareClient._request = old_request

    async def test_create_share_link_tool_execution(self):
        mcp = FastMCP("test_mcp")
        register_share_link_tools(mcp)

        mock_client = MagicMock()
        mock_client.create_share_link = AsyncMock(return_value={"id": "lnk_100", "url": "http://testserver/view/xyz"})
        mock_ctx = MagicMock()

        tool = await mcp.get_tool("create_share_link")
        with patch("coneshare_mcp.tools.share_links.ConeshareClient.from_ctx", return_value=mock_client):
            res = await tool.fn(
                ctx=mock_ctx,
                document_id="doc_999",
                enable_watermark=True,
                allow_download=True,
                name=None,
                password=None,
                expires_in_days=None,
                require_nda=None,
                dataroom_id=None,
            )
        self.assertEqual(res["id"], "lnk_100")
        mock_client.create_share_link.assert_awaited_once_with({
            "document": "doc_999",
            "name": "Share Link",
            "enable_watermark": True,
            "allow_download": True,
        })
