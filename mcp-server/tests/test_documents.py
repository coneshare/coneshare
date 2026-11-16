from unittest.mock import MagicMock, AsyncMock, patch
import httpx
from fastmcp import FastMCP
from coneshare_mcp.client import ConeshareClient
from coneshare_mcp.config import Settings
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

    async def test_create_text_document_defaults_md_and_uploads_utf8(self):
        recorded_requests = []
        content = "# 会议纪要\n\n讨论 Q4 路线图。"
        expected_bytes = content.encode("utf-8")

        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            recorded_requests.append((method, path, json_data))
            if path == "/uploads/document/request/":
                return {
                    "upload_url": "https://cdn.example.com/presigned/put?sig=1",
                    "storage_key": "org_1/meeting.md",
                    "unique_name": "Meeting_Notes_abc.md",
                }
            if path == "/uploads/document/finalize/":
                return {"id": "doc_md_1", "name": "Meeting_Notes_abc.md", "status": "ready"}
            return {"error": True}

        put_calls = []

        class MockAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def put(self, url, content=None, headers=None):
                put_calls.append((url, content, headers))
                return httpx.Response(200, request=httpx.Request("PUT", url))

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            with patch("coneshare_mcp.client.httpx.AsyncClient", MockAsyncClient):
                client = ConeshareClient(api_key="cs_live_testkey123456789", settings=self.mock_settings)
                res = await client.create_text_document(file_name="Meeting Notes", content=content)
        finally:
            ConeshareClient._request = old_request

        self.assertEqual(res["id"], "doc_md_1")
        self.assertEqual([r[1] for r in recorded_requests], [
            "/uploads/document/request/",
            "/uploads/document/finalize/",
        ])
        self.assertEqual(recorded_requests[0][2]["file_name"], "Meeting Notes.md")
        self.assertEqual(recorded_requests[0][2]["file_size"], len(expected_bytes))
        self.assertNotIn("path", recorded_requests[0][2])
        self.assertEqual(recorded_requests[1][2]["content_type"], "text/markdown")
        self.assertEqual(put_calls, [
            ("https://cdn.example.com/presigned/put?sig=1", expected_bytes, {"Content-Type": "text/markdown"}),
        ])

    async def test_create_text_document_ensures_missing_folders_and_sets_description(self):
        recorded_requests = []

        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            recorded_requests.append((method, path, json_data))
            if method == "GET" and path == "/folders/":
                return {"current_folder": None, "sub_folders": [{"id": "fld_notes", "name": "Notes"}]}
            if method == "GET" and path == "/folders/fld_notes/":
                return {"current_folder": {"id": "fld_notes", "name": "Notes"}, "sub_folders": []}
            if method == "POST" and path == "/folders/":
                return {"id": "fld_2026", "name": json_data["name"], "parent": json_data.get("parent")}
            if path == "/uploads/document/request/":
                return {
                    "upload_url": "https://app.coneshare.com/files/upload/tok-123",
                    "storage_key": "org_1/summary.md",
                    "unique_name": "summary_u1.md",
                }
            if path == "/uploads/document/finalize/":
                return {"id": "doc_md_2", "name": "summary.md", "status": "ready"}
            if method == "PATCH" and path == "/documents/doc_md_2/":
                return {"id": "doc_md_2", "name": "summary.md", "description": json_data["description"]}
            return {"error": True}

        put_urls = []

        class MockAsyncClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def put(self, url, content=None, headers=None):
                put_urls.append(url)
                return httpx.Response(200, request=httpx.Request("PUT", url))

        settings_with_internal = Settings(
            api_url="http://testserver/api/v1",
            mcp_transport="streamable-http",
            mcp_host="127.0.0.1",
            mcp_port=8001,
            mcp_path="/mcp/sse",
            fileserver_internal_url="http://core:8080",
        )

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            with patch("coneshare_mcp.client.httpx.AsyncClient", MockAsyncClient):
                client = ConeshareClient(api_key="cs_live_testkey123456789", settings=settings_with_internal)
                res = await client.create_text_document(
                    file_name="summary.md",
                    content="# Summary",
                    path="/Notes/2026/",
                    description="Q4 summary notes",
                )
        finally:
            ConeshareClient._request = old_request

        self.assertEqual(res["description"], "Q4 summary notes")
        # Reused existing 'Notes', created only missing '2026'
        self.assertEqual(recorded_requests, [
            ("GET", "/folders/", None),
            ("GET", "/folders/fld_notes/", None),
            ("POST", "/folders/", {"name": "2026", "parent": "fld_notes"}),
            ("POST", "/uploads/document/request/", {
                "file_name": "summary.md",
                "file_size": len(b"# Summary"),
                "path": "Notes/2026/summary.md",
            }),
            ("POST", "/uploads/document/finalize/", {
                "storage_key": "org_1/summary.md",
                "unique_name": "summary_u1.md",
                "content_type": "text/markdown",
                "path": "Notes/2026/summary_u1.md",
            }),
            ("PATCH", "/documents/doc_md_2/", {"description": "Q4 summary notes"}),
        ])
        # Internal core file server path was rewritten to CONESHARE_FILESERVER_INTERNAL_URL
        self.assertEqual(put_urls, ["http://core:8080/files/upload/tok-123"])

    async def test_resolve_upload_url_keeps_external_presigned_urls(self):
        settings_with_internal = Settings(
            api_url="http://testserver/api/v1",
            mcp_transport="streamable-http",
            mcp_host="127.0.0.1",
            mcp_port=8001,
            mcp_path="/mcp/sse",
            fileserver_internal_url="http://core:8080",
        )
        client = ConeshareClient(api_key="cs_live_testkey123456789", settings=settings_with_internal)
        s3_url = "https://my-bucket.s3.us-east-1.amazonaws.com/org/doc.md?X-Amz-Signature=abc123"
        self.assertEqual(client._resolve_upload_url(s3_url), s3_url)
        self.assertEqual(
            client._resolve_upload_url("http://localhost:8080/files/upload/token-xyz"),
            "http://core:8080/files/upload/token-xyz",
        )

    async def test_create_text_document_validation_and_put_failure(self):
        client = ConeshareClient(api_key="cs_live_testkey123456789", settings=self.mock_settings)

        with self.assertRaises(ValueError):
            await client.create_text_document(file_name="note.md", content="   \n  ")

        with self.assertRaises(ValueError):
            await client.create_text_document(file_name="Notes/note.md", content="hello")

        with self.assertRaises(ValueError):
            await client.create_text_document(file_name="note.md", content="hello", path="../escape")

        for bad_name in (".", "..", ".md", "..."):
            with self.assertRaises(ValueError):
                await client.create_text_document(file_name=bad_name, content="hello")

        recorded_paths = []

        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            recorded_paths.append(path)
            if path == "/uploads/document/request/":
                return {
                    "upload_url": "http://core:8080/files/upload/tok-fail",
                    "storage_key": "org_1/note.csv",
                    "unique_name": "note.csv",
                }
            return {"error": True}

        class MockFailPutClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def put(self, url, content=None, headers=None):
                return httpx.Response(403, text="Forbidden", request=httpx.Request("PUT", url))

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            with patch("coneshare_mcp.client.httpx.AsyncClient", MockFailPutClient):
                with self.assertRaises(ValueError) as ctx_err:
                    await client.create_text_document(file_name="note.csv", content="col1,col2\n1,2")
                self.assertIn("Storage upload failed (403)", str(ctx_err.exception))
        finally:
            ConeshareClient._request = old_request

        # Finalize must never be called when storage PUT fails
        self.assertEqual(recorded_paths, ["/uploads/document/request/"])

    async def test_create_text_document_tool_execution(self):
        mcp = FastMCP("test_mcp")
        register_document_tools(mcp)

        mock_client = MagicMock()
        mock_client.create_text_document = AsyncMock(return_value={"id": "doc_txt_1", "name": "notes.md"})
        mock_ctx = MagicMock()

        tool = await mcp.get_tool("create_text_document")
        with patch("coneshare_mcp.tools.documents.ConeshareClient.from_ctx", return_value=mock_client):
            res = await tool.fn(
                ctx=mock_ctx,
                file_name="notes.md",
                content="# Notes",
                content_type=None,
                path="Notes",
                description="Quick notes",
            )
        self.assertEqual(res["id"], "doc_txt_1")
        mock_client.create_text_document.assert_awaited_once_with(
            file_name="notes.md",
            content="# Notes",
            content_type=None,
            path="Notes",
            description="Quick notes",
        )

    async def test_create_text_document_description_patch_failure_preserves_doc(self):
        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            if path == "/uploads/document/request/":
                return {
                    "upload_url": "https://cdn.example.com/presigned/put",
                    "storage_key": "org_1/report.md",
                    "unique_name": "report.md",
                }
            if path == "/uploads/document/finalize/":
                return {"id": "doc_keep_1", "name": "report.md", "status": "ready"}
            if method == "PATCH" and path == "/documents/doc_keep_1/":
                raise ValueError("Coneshare API Error (502): upstream timeout")
            return {"error": True}

        class MockOkPutClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def put(self, url, content=None, headers=None):
                return httpx.Response(200, request=httpx.Request("PUT", url))

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            with patch("coneshare_mcp.client.httpx.AsyncClient", MockOkPutClient):
                client = ConeshareClient(api_key="cs_live_testkey123456789", settings=self.mock_settings)
                res = await client.create_text_document(
                    file_name="report.",
                    content="# Report",
                    description="Should not fail whole upload",
                )
        finally:
            ConeshareClient._request = old_request

        self.assertEqual(res["id"], "doc_keep_1")
        self.assertEqual(res["name"], "report.md")
        self.assertIn("502", res["description_update_error"])

    async def test_create_text_document_extensionless_path_suffix_and_skip_new_folder_gets(self):
        recorded_requests = []

        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            recorded_requests.append((method, path, json_data))
            if method == "GET" and path == "/folders/":
                return {"current_folder": None, "sub_folders": []}
            if method == "POST" and path == "/folders/":
                return {"id": f"fld_{json_data['name']}", "name": json_data["name"]}
            if path == "/uploads/document/request/":
                return {
                    "upload_url": "https://cdn.example.com/presigned/put",
                    "storage_key": "org_1/meeting.md",
                    "unique_name": "meeting.md",
                }
            if path == "/uploads/document/finalize/":
                return {"id": "doc_nested_1", "name": "meeting.md", "status": "ready"}
            return {"error": True}

        class MockOkPutClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def put(self, url, content=None, headers=None):
                return httpx.Response(200, request=httpx.Request("PUT", url))

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            with patch("coneshare_mcp.client.httpx.AsyncClient", MockOkPutClient):
                client = ConeshareClient(api_key="cs_live_testkey123456789", settings=self.mock_settings)
                res = await client.create_text_document(
                    file_name="meeting",
                    content="# Notes",
                    path="Notes/2026/meeting",
                )
        finally:
            ConeshareClient._request = old_request

        self.assertEqual(res["id"], "doc_nested_1")
        # Must NOT create extra 'meeting' folder or call GET /folders/{id}/ after creating 'Notes'
        self.assertEqual(recorded_requests, [
            ("GET", "/folders/", None),
            ("POST", "/folders/", {"name": "Notes"}),
            ("POST", "/folders/", {"name": "2026", "parent": "fld_Notes"}),
            ("POST", "/uploads/document/request/", {
                "file_name": "meeting.md",
                "file_size": len(b"# Notes"),
                "path": "Notes/2026/meeting.md",
            }),
            ("POST", "/uploads/document/finalize/", {
                "storage_key": "org_1/meeting.md",
                "unique_name": "meeting.md",
                "content_type": "text/markdown",
                "path": "Notes/2026/meeting.md",
            }),
        ])

    async def test_ensure_folder_path_resolves_exact_folder_on_concurrent_rename(self):
        recorded_requests = []
        root_get_calls = 0

        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            nonlocal root_get_calls
            recorded_requests.append((method, path, json_data))
            if method == "GET" and path == "/folders/":
                root_get_calls += 1
                if root_get_calls == 1:
                    return {"current_folder": None, "sub_folders": []}
                # Intervening request created exact 'Notes' before our POST landed
                return {"current_folder": None, "sub_folders": [{"id": "fld_exact_notes", "name": "Notes"}]}
            if method == "POST" and path == "/folders/":
                if json_data.get("name") == "Notes":
                    return {"id": "fld_dup_notes", "name": "Notes (1)"}
                return {"id": "fld_2026", "name": json_data["name"], "parent": json_data.get("parent")}
            if method == "GET" and path == "/folders/fld_exact_notes/":
                return {"current_folder": {"id": "fld_exact_notes", "name": "Notes"}, "sub_folders": []}
            return {"error": True}

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789", settings=self.mock_settings)
            folder_id = await client.ensure_folder_path("Notes/2026")
        finally:
            ConeshareClient._request = old_request

        self.assertEqual(folder_id, "fld_2026")
        self.assertEqual(recorded_requests, [
            ("GET", "/folders/", None),
            ("POST", "/folders/", {"name": "Notes"}),
            ("GET", "/folders/", None),
            ("GET", "/folders/fld_exact_notes/", None),
            ("POST", "/folders/", {"name": "2026", "parent": "fld_exact_notes"}),
        ])

    async def test_create_text_document_preserves_filename_shaped_folder_segment(self):
        recorded_requests = []

        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            recorded_requests.append((method, path, json_data))
            if method == "GET" and path == "/folders/":
                return {"current_folder": None, "sub_folders": []}
            if method == "POST" and path == "/folders/":
                return {"id": f"fld_{json_data['name']}", "name": json_data["name"]}
            if path == "/uploads/document/request/":
                return {
                    "upload_url": "https://cdn.example.com/presigned/put",
                    "storage_key": "org_1/note.md",
                    "unique_name": "note.md",
                }
            if path == "/uploads/document/finalize/":
                return {"id": "doc_same_seg", "name": "note.md", "status": "ready"}
            return {"error": True}

        class MockOkPutClient:
            def __init__(self, *args, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def put(self, url, content=None, headers=None):
                return httpx.Response(200, request=httpx.Request("PUT", url))

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            with patch("coneshare_mcp.client.httpx.AsyncClient", MockOkPutClient):
                client = ConeshareClient(api_key="cs_live_testkey123456789", settings=self.mock_settings)
                res = await client.create_text_document(
                    file_name="note.md",
                    content="# Repeated segment test",
                    path="Notes/note.md/note.md",
                )
        finally:
            ConeshareClient._request = old_request

        self.assertEqual(res["id"], "doc_same_seg")
        self.assertEqual(recorded_requests, [
            ("GET", "/folders/", None),
            ("POST", "/folders/", {"name": "Notes"}),
            ("POST", "/folders/", {"name": "note.md", "parent": "fld_Notes"}),
            ("POST", "/uploads/document/request/", {
                "file_name": "note.md",
                "file_size": len(b"# Repeated segment test"),
                "path": "Notes/note.md/note.md",
            }),
            ("POST", "/uploads/document/finalize/", {
                "storage_key": "org_1/note.md",
                "unique_name": "note.md",
                "content_type": "text/markdown",
                "path": "Notes/note.md/note.md",
            }),
        ])


