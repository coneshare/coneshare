import unittest
from coneshare_mcp.client import ConeshareClient


class TestDocuments(unittest.IsolatedAsyncioTestCase):
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
