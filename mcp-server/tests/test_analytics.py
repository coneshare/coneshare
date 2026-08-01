import unittest
from coneshare_mcp.client import ConeshareClient


class TestAnalytics(unittest.IsolatedAsyncioTestCase):
    async def test_get_document_analytics(self):
        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            self.assertEqual(method, "GET")
            self.assertEqual(path, "/analytics/documents/doc_777/")
            return {"total_views": 150, "unique_viewers": 12}

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            res = await client.get_document_analytics("doc_777")
            self.assertEqual(res["total_views"], 150)
            self.assertEqual(res["unique_viewers"], 12)
        finally:
            ConeshareClient._request = old_request

    async def test_list_view_sessions_summary_transformation(self):
        """Test list_view_sessions summary transformation, page_views_count computation, and key stripping."""
        captured_params = {}

        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            self.assertEqual(method, "GET")
            self.assertEqual(path, "/analytics/view-sessions/")
            nonlocal captured_params
            captured_params = params
            return {
                "count": 1,
                "next": None,
                "results": [
                    {
                        "id": "vs_100",
                        "viewer_email": "investor@vc.com",
                        "country": "US",
                        "duration_seconds": 180,
                        "completion_rate": 0.85,
                        "viewed_at": "2026-08-01T12:00:00Z",
                        "page_views": [
                            {"page_number": 1, "duration_seconds": 60},
                            {"page_number": 2, "duration_seconds": 120},
                        ],
                        "dataroom_visits": [],
                        "link_clicks": [],
                    }
                ],
            }

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            res = await client.list_view_sessions(
                document_id="doc_123",
                viewer_email="investor@vc.com",
                page=1,
                page_size=20,
            )
            self.assertEqual(captured_params.get("document_id"), "doc_123")
            self.assertEqual(captured_params.get("viewer_email"), "investor@vc.com")
            self.assertEqual(res["total_count"], 1)
            self.assertFalse(res["has_next"])
            self.assertEqual(len(res["items"]), 1)

            item = res["items"][0]
            self.assertEqual(item["id"], "vs_100")
            self.assertEqual(item["viewer_email"], "investor@vc.com")
            self.assertEqual(item["page_views_count"], 2)
            # Ensure heavy nested arrays are stripped from list summaries
            self.assertNotIn("page_views", item)
            self.assertNotIn("dataroom_visits", item)
            self.assertNotIn("link_clicks", item)
        finally:
            ConeshareClient._request = old_request

    async def test_get_view_session_detail(self):
        """Test retrieving full view session details including nested page views."""
        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            self.assertEqual(method, "GET")
            self.assertEqual(path, "/analytics/view-sessions/vs_100/")
            return {
                "id": "vs_100",
                "viewer_email": "investor@vc.com",
                "page_views": [{"page_number": 1, "duration_seconds": 60}],
            }

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            res = await client.get_view_session("vs_100")
            self.assertEqual(res["id"], "vs_100")
            self.assertEqual(res["viewer_email"], "investor@vc.com")
            self.assertEqual(len(res["page_views"]), 1)
        finally:
            ConeshareClient._request = old_request
