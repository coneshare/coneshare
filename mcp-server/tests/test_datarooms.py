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

    async def test_create_dataroom_with_documents(self):
        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            if method == "POST" and path == "/datarooms/":
                self.assertEqual(json_data["name"], "Series A DD")
                return {"id": "dtr_100", "name": "Series A DD"}
            elif method == "POST" and path == "/datarooms/dtr_100/add-content/":
                self.assertEqual(json_data["document_ids"], ["doc_1", "doc_2"])
                return {"success": True}
            return {"error": True}

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            res = await client.create_dataroom("Series A DD", document_ids=["doc_1", "doc_2"])
            self.assertEqual(res["id"], "dtr_100")
        finally:
            ConeshareClient._request = old_request

    async def test_create_dataroom_tool_execution(self):
        mcp = FastMCP("test_mcp")
        register_dataroom_tools(mcp)

        mock_client = MagicMock()
        mock_client.create_dataroom = AsyncMock(return_value={"id": "dtr_100", "name": "Series A DD"})
        mock_ctx = MagicMock()

        tool = await mcp.get_tool("create_dataroom")
        with patch("coneshare_mcp.tools.datarooms.ConeshareClient.from_ctx", return_value=mock_client):
            res = await tool.fn(ctx=mock_ctx, name="Series A DD", description=None, document_ids=["doc_1"])
        self.assertEqual(res["id"], "dtr_100")
        mock_client.create_dataroom.assert_awaited_once_with(name="Series A DD", description=None, document_ids=["doc_1"])

    async def test_remove_content_from_dataroom_tool_execution(self):
        mcp = FastMCP("test_mcp")
        register_dataroom_tools(mcp)

        mock_client = MagicMock()
        mock_client.remove_content_from_dataroom = AsyncMock(return_value={"success": True})
        mock_ctx = MagicMock()

        tool = await mcp.get_tool("remove_content_from_dataroom")
        with patch("coneshare_mcp.tools.datarooms.ConeshareClient.from_ctx", return_value=mock_client):
            res = await tool.fn(ctx=mock_ctx, dataroom_id="dtr_100", document_ids=["doc_1"])
        self.assertTrue(res["success"])
        mock_client.remove_content_from_dataroom.assert_awaited_once_with(dataroom_id="dtr_100", document_ids=["doc_1"])

    async def test_update_dataroom_tool_execution(self):
        mcp = FastMCP("test_mcp")
        register_dataroom_tools(mcp)

        mock_client = MagicMock()
        mock_client.update_dataroom = AsyncMock(return_value={"id": "dtr_100", "name": "Updated Name"})
        mock_ctx = MagicMock()

        tool = await mcp.get_tool("update_dataroom")
        with patch("coneshare_mcp.tools.datarooms.ConeshareClient.from_ctx", return_value=mock_client):
            res = await tool.fn(ctx=mock_ctx, dataroom_id="dtr_100", name="Updated Name", description=None)
        self.assertEqual(res["name"], "Updated Name")
        mock_client.update_dataroom.assert_awaited_once_with(dataroom_id="dtr_100", name="Updated Name", description=None)

    async def test_delete_dataroom_tool_execution(self):
        mcp = FastMCP("test_mcp")
        register_dataroom_tools(mcp)

        mock_client = MagicMock()
        mock_client.delete_dataroom = AsyncMock(return_value={"success": True})
        mock_ctx = MagicMock()

        tool = await mcp.get_tool("delete_dataroom")
        with patch("coneshare_mcp.tools.datarooms.ConeshareClient.from_ctx", return_value=mock_client):
            res = await tool.fn(ctx=mock_ctx, dataroom_id="dtr_100")
        self.assertTrue(res["success"])
        mock_client.delete_dataroom.assert_awaited_once_with(dataroom_id="dtr_100")

    async def test_create_dataroom_attachment_failure_rolls_back_dataroom(self):
        deleted_paths = []
        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            if method == "POST" and path == "/datarooms/":
                return {"id": "dtr_999", "name": "Series B DD"}
            elif method == "POST" and path == "/datarooms/dtr_999/add-content/":
                return {"error": True, "message": "Failed to add documents"}
            elif method == "DELETE" and path == "/datarooms/dtr_999/":
                deleted_paths.append(path)
                return {"success": True}
            return {"error": True}

        with patch("coneshare_mcp.client.ConeshareClient._request", new=mock_request):
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            res = await client.create_dataroom("Series B DD", document_ids=["doc_bad"])
            self.assertTrue(res.get("error"))
            self.assertIn("Rolled back", res.get("message", ""))
            self.assertEqual(deleted_paths, ["/datarooms/dtr_999/"])
