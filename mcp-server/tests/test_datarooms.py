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
            res = await tool.fn(ctx=mock_ctx, page=1, page_size=20, name="Series A")
        self.assertEqual(res["total_count"], 1)
        mock_client.list_datarooms.assert_awaited_once_with(page=1, page_size=20, name="Series A")

    async def test_list_datarooms_with_name_filter(self):
        recorded_params = []

        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            self.assertEqual(method, "GET")
            self.assertEqual(path, "/datarooms/")
            recorded_params.append(params)
            return [{"id": "dtr_1", "name": "Series A Dataroom"}]

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            res = await client.list_datarooms(name="  Series A  ")
            self.assertEqual(res["total_count"], 1)
            self.assertEqual(res["items"][0]["id"], "dtr_1")
            await client.list_datarooms(name="   ")
            self.assertEqual(
                recorded_params,
                [
                    {"page": 1, "page_size": 20, "search": "Series A"},
                    {"page": 1, "page_size": 20},
                ],
            )
        finally:
            ConeshareClient._request = old_request

    async def test_search_dataroom_content(self):
        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            self.assertEqual(method, "GET")
            self.assertEqual(path, "/datarooms/dtr_1/search/")
            self.assertEqual(params, {"q": "budget"})
            return {
                "items": [
                    {"id": "ddoc_1", "type": "document", "name": "Budget.pdf", "location": "Finance"},
                ]
            }

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            res = await client.search_dataroom_content(dataroom_id="dtr_1", query=" budget ")
            self.assertEqual(len(res["items"]), 1)
            self.assertEqual(res["items"][0]["location"], "Finance")
            empty_res = await client.search_dataroom_content(dataroom_id="dtr_1", query="   ")
            self.assertEqual(empty_res, {"items": []})
            with self.assertRaises(ValueError):
                await client.search_dataroom_content(dataroom_id="../invalid", query="   ")
        finally:
            ConeshareClient._request = old_request

    async def test_search_dataroom_content_tool_execution(self):
        mcp = FastMCP("test_mcp")
        register_dataroom_tools(mcp)

        mock_client = MagicMock()
        mock_client.search_dataroom_content = AsyncMock(
            return_value={"items": [{"id": "ddoc_1", "name": "Budget.pdf"}]}
        )
        mock_ctx = MagicMock()

        tool = await mcp.get_tool("search_dataroom_content")
        with patch("coneshare_mcp.tools.datarooms.ConeshareClient.from_ctx", return_value=mock_client):
            res = await tool.fn(ctx=mock_ctx, dataroom_id="dtr_1", query="budget")
        self.assertEqual(res["items"][0]["name"], "Budget.pdf")
        mock_client.search_dataroom_content.assert_awaited_once_with(dataroom_id="dtr_1", query="budget")

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

    async def test_remove_content_from_dataroom_sends_dataroom_document_ids(self):
        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            self.assertEqual(method, "POST")
            self.assertEqual(path, "/datarooms/dtr_100/remove-content/")
            self.assertIn("dataroom_document_ids", json_data)
            self.assertNotIn("document_ids", json_data)
            self.assertEqual(json_data["dataroom_document_ids"], ["ddoc_1", "ddoc_2"])
            return {"success": True}

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            res = await client.remove_content_from_dataroom("dtr_100", document_ids=["ddoc_1", "ddoc_2"])
            self.assertTrue(res.get("success"))
        finally:
            ConeshareClient._request = old_request

    async def test_remove_content_from_dataroom_folder_only_omits_document_ids(self):
        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            self.assertEqual(method, "POST")
            self.assertEqual(path, "/datarooms/dtr_100/remove-content/")
            self.assertIn("dataroom_folder_ids", json_data)
            self.assertNotIn("dataroom_document_ids", json_data)
            self.assertEqual(json_data["dataroom_folder_ids"], ["fld_1"])
            return {"success": True}

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            res = await client.remove_content_from_dataroom("dtr_100", dataroom_folder_ids=["fld_1"])
            self.assertTrue(res.get("success"))
        finally:
            ConeshareClient._request = old_request

    async def test_remove_content_from_dataroom_tool_execution(self):
        mcp = FastMCP("test_mcp")
        register_dataroom_tools(mcp)

        mock_client = MagicMock()
        mock_client.remove_content_from_dataroom = AsyncMock(return_value={"success": True})
        mock_ctx = MagicMock()

        tool = await mcp.get_tool("remove_content_from_dataroom")
        with patch("coneshare_mcp.tools.datarooms.ConeshareClient.from_ctx", return_value=mock_client):
            res = await tool.fn(
                ctx=mock_ctx,
                dataroom_id="dtr_100",
                dataroom_document_ids=["ddoc_1"],
                dataroom_folder_ids=None,
            )
        self.assertTrue(res["success"])
        mock_client.remove_content_from_dataroom.assert_awaited_once_with(
            dataroom_id="dtr_100",
            dataroom_document_ids=["ddoc_1"],
            dataroom_folder_ids=None,
        )

    async def test_remove_content_from_dataroom_tool_empty_params_guard(self):
        mcp = FastMCP("test_mcp")
        register_dataroom_tools(mcp)

        mock_ctx = MagicMock()
        tool = await mcp.get_tool("remove_content_from_dataroom")
        res = await tool.fn(
            ctx=mock_ctx,
            dataroom_id="dtr_100",
            dataroom_document_ids=None,
            dataroom_folder_ids=None,
        )
        self.assertTrue(res.get("error"))
        self.assertIn("dataroom_document_id", res.get("message", ""))

    async def test_remove_content_400_adds_id_origin_hint(self):
        async def failing_request(self_client, method, path, params=None, json_data=None, files=None):
            raise ValueError("Coneshare API Error (400): Invalid IDs")

        with patch.object(ConeshareClient, "_request", new=failing_request):
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            with self.assertRaises(ValueError) as ctx:
                await client.remove_content_from_dataroom("dtr_100", dataroom_document_ids=["doc_wrong"])
        self.assertIn("get_dataroom", str(ctx.exception))

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
