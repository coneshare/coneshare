from unittest.mock import MagicMock, AsyncMock, patch
from fastmcp import FastMCP
from coneshare_mcp.client import ConeshareClient
from coneshare_mcp.tools.documents import register_document_tools
from tests.base import BaseMCPTestCase


class TestDocuments(BaseMCPTestCase):
    async def test_list_documents_success(self):
        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            return {
                "count": 42,
                "next": "http://testserver/api/v1/documents/?page=2",
                "results": [{"id": "doc_123", "name": "Report.pdf"}],
            }

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            res = await client.list_documents(page=1, page_size=20)
            self.assertEqual(res["total_count"], 42)
            self.assertTrue(res["has_next"])
            self.assertEqual(len(res["items"]), 1)
            self.assertEqual(res["items"][0]["name"], "Report.pdf")
        finally:
            ConeshareClient._request = old_request

    async def test_delete_document(self):
        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            self.assertEqual(method, "DELETE")
            self.assertEqual(path, "/documents/doc_123/")
            return {"success": True}

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            res = await client.delete_document("doc_123")
            self.assertTrue(res.get("success"))
        finally:
            ConeshareClient._request = old_request

    async def test_request_and_finalize_document_upload(self):
        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            if path == "/uploads/document/request/":
                self.assertEqual(method, "POST")
                self.assertEqual(json_data["file_name"], "test.pdf")
                return {
                    "upload_url": "http://testserver/upload",
                    "storage_key": "org_1/test.pdf",
                    "unique_name": "test_123.pdf",
                }
            elif path == "/uploads/document/finalize/":
                self.assertEqual(method, "POST")
                self.assertEqual(json_data["storage_key"], "org_1/test.pdf")
                return {"id": "doc_new123", "name": "test.pdf", "status": "ready"}
            return {"error": True}

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            req_res = await client.request_document_upload(file_name="test.pdf", file_size=1024)
            self.assertEqual(req_res["storage_key"], "org_1/test.pdf")

            fin_res = await client.finalize_document_upload(
                storage_key=req_res["storage_key"],
                unique_name=req_res["unique_name"],
                file_size=1024,
            )
            self.assertEqual(fin_res["id"], "doc_new123")
        finally:
            ConeshareClient._request = old_request

    async def test_finalize_document_upload_tool_execution(self):
        mcp = FastMCP("test_mcp")
        register_document_tools(mcp)

        mock_client = MagicMock()
        mock_client.finalize_document_upload = AsyncMock(return_value={"id": "doc_123", "status": "ready"})

        mock_ctx = MagicMock()

        # Retrieve registered tool function via FastMCP get_tool API and execute
        tool = await mcp.get_tool("finalize_document_upload")
        with patch("coneshare_mcp.tools.documents.ConeshareClient.from_ctx", return_value=mock_client):
            res = await tool.fn(
                ctx=mock_ctx,
                storage_key="org_1/file.pdf",
                unique_name="file.pdf",
                file_size=100,
                content_type="application/octet-stream",
                path=None,
            )
        self.assertEqual(res["id"], "doc_123")
        mock_client.finalize_document_upload.assert_awaited_once_with(
            storage_key="org_1/file.pdf",
            unique_name="file.pdf",
            file_size=100,
            content_type="application/octet-stream",
            path=None,
        )


