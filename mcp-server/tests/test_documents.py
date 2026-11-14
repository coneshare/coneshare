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
            self.assertEqual(res["total_pages"], 3)
            self.assertEqual(res["page"], 1)
            self.assertEqual(res["page_size"], 20)
            self.assertTrue(res["has_next"])
            self.assertEqual(len(res["items"]), 1)
            self.assertEqual(res["items"][0]["name"], "Report.pdf")
        finally:
            ConeshareClient._request = old_request

    async def test_search_documents_success(self):
        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            self.assertEqual(method, "GET")
            self.assertEqual(path, "/documents/")
            self.assertEqual(params, {"search": "financial", "page": 1, "page_size": 20})
            return {
                "count": 1,
                "results": [{"id": "doc_fin", "name": "Financial Report.pdf"}],
            }

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            res = await client.search_documents(query="financial", page=1, page_size=20)
            self.assertEqual(res["total_count"], 1)
            self.assertEqual(len(res["items"]), 1)
            self.assertEqual(res["items"][0]["name"], "Financial Report.pdf")
        finally:
            ConeshareClient._request = old_request

    async def test_paginate_matches_standard_results_set_pagination(self):
        client = ConeshareClient(api_key="cs_live_testkey123456789")
        # Simulating StandardResultsSetPagination response from Django
        drf_response = {
            "count": 45,
            "total_pages": 3,
            "current_page": 2,
            "page_size": 20,
            "next": "http://testserver/api/v1/documents/?page=3",
            "previous": "http://testserver/api/v1/documents/?page=1",
            "results": [{"id": "doc_1"}, {"id": "doc_2"}],
        }
        paginated = client._paginate(drf_response, page=2, page_size=20)
        self.assertEqual(paginated["total_count"], 45)
        self.assertEqual(paginated["total_pages"], 3)
        self.assertEqual(paginated["page"], 2)
        self.assertEqual(paginated["page_size"], 20)
        self.assertTrue(paginated["has_next"])
        self.assertEqual(len(paginated["items"]), 2)

        # Raw list fallback
        raw_list = [{"id": f"item_{i}"} for i in range(25)]
        paginated_list = client._paginate(raw_list, page=2, page_size=10)
        self.assertEqual(paginated_list["total_count"], 25)
        self.assertEqual(paginated_list["total_pages"], 3)
        self.assertEqual(paginated_list["page"], 2)
        self.assertEqual(paginated_list["page_size"], 10)
        self.assertEqual(len(paginated_list["items"]), 10)
        self.assertTrue(paginated_list["has_next"])

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
            )
            self.assertEqual(fin_res["id"], "doc_new123")
        finally:
            ConeshareClient._request = old_request

    async def test_request_and_finalize_upload_adapts_folder_path(self):
        recorded_paths = {}

        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            if path == "/uploads/document/request/":
                recorded_paths["request"] = json_data.get("path")
                self.assertEqual(json_data.get("file_name"), "my_report.pdf")
                return {
                    "upload_url": "http://testserver/upload",
                    "storage_key": "org_1/my_report.pdf",
                    "unique_name": "my_report_unique.pdf",
                }
            elif path == "/uploads/document/finalize/":
                recorded_paths["finalize"] = json_data.get("path")
                return {"id": "doc_in_folder", "name": "my_report.pdf", "status": "ready"}
            return {"error": True}

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            # User specifies destination folder "exports"
            req_res = await client.request_document_upload(
                file_name="my_report.pdf",
                file_size=2048,
                path="exports",
            )
            # The payload sent to backend must be root-relative file path "exports/my_report.pdf"
            # so backend os.path.split() correctly extracts folder "exports" and filename "my_report.pdf"
            self.assertEqual(recorded_paths["request"], "exports/my_report.pdf")

            # Finalize with destination folder and unique_name
            await client.finalize_document_upload(
                storage_key=req_res["storage_key"],
                unique_name=req_res["unique_name"],
                path="exports",
            )
            self.assertEqual(recorded_paths["finalize"], "exports/my_report_unique.pdf")
        finally:
            ConeshareClient._request = old_request

    def test_normalize_upload_path_preserves_dotted_folders(self):
        # Folder containing dot like 'reports.2024' with extension-less file
        res = ConeshareClient._normalize_upload_path("reports.2024", "README")
        self.assertEqual(res, "reports.2024/README")

        # Folder containing dot like 'backup.pdf' when uploading PDF
        res2 = ConeshareClient._normalize_upload_path("backup.pdf", "invoice.pdf")
        self.assertEqual(res2, "backup.pdf/invoice.pdf")

        # Folder without dot
        res3 = ConeshareClient._normalize_upload_path("data/exports", "file.csv")
        self.assertEqual(res3, "data/exports/file.csv")

        # Destination path already ending with file_name
        res4 = ConeshareClient._normalize_upload_path("data/exports/file.csv", "file.csv")
        self.assertEqual(res4, "data/exports/file.csv")

    def test_normalize_upload_path_rejects_traversal(self):
        with self.assertRaises(ValueError):
            ConeshareClient._normalize_upload_path("../forbidden", "file.txt")

        with self.assertRaises(ValueError):
            ConeshareClient._normalize_upload_path("data/../../forbidden", "file.txt")

        with self.assertRaises(ValueError):
            ConeshareClient._normalize_upload_path("./local", "file.txt")

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
                content_type="application/octet-stream",
                path=None,
            )
        self.assertEqual(res["id"], "doc_123")
        mock_client.finalize_document_upload.assert_awaited_once_with(
            storage_key="org_1/file.pdf",
            unique_name="file.pdf",
            content_type="application/octet-stream",
            path=None,
        )

    async def test_update_document_tool_execution(self):
        mcp = FastMCP("test_mcp")
        register_document_tools(mcp)

        mock_client = MagicMock()
        mock_client.update_document = AsyncMock(return_value={"id": "doc_123", "name": "new_name.pdf"})
        mock_ctx = MagicMock()

        tool = await mcp.get_tool("update_document")
        with patch("coneshare_mcp.tools.documents.ConeshareClient.from_ctx", return_value=mock_client):
            res = await tool.fn(ctx=mock_ctx, document_id="doc_123", name="new_name.pdf", description=None)
        self.assertEqual(res["name"], "new_name.pdf")
        mock_client.update_document.assert_awaited_once_with(document_id="doc_123", name="new_name.pdf", description=None)

    async def test_search_documents_tool_execution(self):
        mcp = FastMCP("test_mcp")
        register_document_tools(mcp)

        mock_client = MagicMock()
        mock_client.search_documents = AsyncMock(return_value={"items": [{"id": "doc_123", "name": "report.pdf"}], "total_count": 1})
        mock_ctx = MagicMock()

        tool = await mcp.get_tool("search_documents")
        with patch("coneshare_mcp.tools.documents.ConeshareClient.from_ctx", return_value=mock_client):
            res = await tool.fn(ctx=mock_ctx, query="report", page=1, page_size=20)
        self.assertEqual(res["total_count"], 1)
        mock_client.search_documents.assert_awaited_once_with(query="report", page=1, page_size=20)

    async def test_move_items_tool_execution(self):
        mcp = FastMCP("test_mcp")
        register_document_tools(mcp)

        mock_client = MagicMock()
        mock_client.move_items = AsyncMock(return_value={"success": True})
        mock_ctx = MagicMock()

        tool = await mcp.get_tool("move_items")
        with patch("coneshare_mcp.tools.documents.ConeshareClient.from_ctx", return_value=mock_client):
            res = await tool.fn(
                ctx=mock_ctx,
                destination_folder_id="fld_99",
                document_ids=["doc_1"],
                folder_ids=None,
            )
        self.assertTrue(res["success"])
        mock_client.move_items.assert_awaited_once_with(
            destination_folder_id="fld_99",
            document_ids=["doc_1"],
            folder_ids=None,
        )

    async def test_move_items_empty_ids_raises_value_error(self):
        client = ConeshareClient(api_key="cs_live_testkey123456789")
        with self.assertRaises(ValueError):
            await client.move_items(destination_folder_id="fld_99", document_ids=None, folder_ids=None)

    async def test_create_folder_tool_execution(self):
        mcp = FastMCP("test_mcp")
        register_document_tools(mcp)

        mock_client = MagicMock()
        mock_client.create_folder = AsyncMock(return_value={"id": "fld_1", "name": "Financials"})
        mock_ctx = MagicMock()

        tool = await mcp.get_tool("create_folder")
        with patch("coneshare_mcp.tools.documents.ConeshareClient.from_ctx", return_value=mock_client):
            res = await tool.fn(ctx=mock_ctx, name="Financials", parent_folder_id=None)
        self.assertEqual(res["id"], "fld_1")
        mock_client.create_folder.assert_awaited_once_with(name="Financials", parent_folder_id=None)

    async def test_update_folder_tool_execution(self):
        mcp = FastMCP("test_mcp")
        register_document_tools(mcp)

        mock_client = MagicMock()
        mock_client.update_folder = AsyncMock(return_value={"id": "fld_1", "name": "Renamed"})
        mock_ctx = MagicMock()

        tool = await mcp.get_tool("update_folder")
        with patch("coneshare_mcp.tools.documents.ConeshareClient.from_ctx", return_value=mock_client):
            res = await tool.fn(ctx=mock_ctx, folder_id="fld_1", name="Renamed")
        self.assertEqual(res["name"], "Renamed")
        mock_client.update_folder.assert_awaited_once_with(folder_id="fld_1", name="Renamed")

    async def test_delete_folder_tool_execution(self):
        mcp = FastMCP("test_mcp")
        register_document_tools(mcp)

        mock_client = MagicMock()
        mock_client.delete_folder = AsyncMock(return_value={"success": True})
        mock_ctx = MagicMock()

        tool = await mcp.get_tool("delete_folder")
        with patch("coneshare_mcp.tools.documents.ConeshareClient.from_ctx", return_value=mock_client):
            res = await tool.fn(ctx=mock_ctx, folder_id="fld_1")
        self.assertTrue(res["success"])
        mock_client.delete_folder.assert_awaited_once_with(folder_id="fld_1")


