from unittest.mock import MagicMock, AsyncMock, patch
from fastmcp import FastMCP
from coneshare_mcp.client import ConeshareClient
from coneshare_mcp.tools.datarooms import register_dataroom_tools
from tests.base import BaseMCPTestCase


class TestDatarooms(BaseMCPTestCase):
    async def test_list_datarooms(self):
        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            return {
                "count": 5,
                "next": None,
                "results": [{"id": "dtr_1", "name": "Series A Dataroom"}],
            }

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            res = await client.list_datarooms()
            self.assertEqual(res["total_count"], 5)
            self.assertFalse(res["has_next"])
            self.assertEqual(res["items"][0]["name"], "Series A Dataroom")
        finally:
            ConeshareClient._request = old_request

    async def test_list_datarooms_tool_execution(self):
        mcp = FastMCP("test_mcp")
        register_dataroom_tools(mcp)

        mock_client = MagicMock()
        mock_client.list_datarooms = AsyncMock(return_value={"total_count": 1, "items": [{"id": "dtr_1"}]})
        mock_ctx = MagicMock()

        tool = await mcp.get_tool("list_datarooms")
        with patch("coneshare_mcp.tools.datarooms.ConeshareClient.from_ctx", return_value=mock_client):
            res = await tool.fn(ctx=mock_ctx, page=1, page_size=20)
        self.assertEqual(res["total_count"], 1)
        mock_client.list_datarooms.assert_awaited_once_with(page=1, page_size=20)
