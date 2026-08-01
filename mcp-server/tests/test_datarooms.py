import unittest
from coneshare_mcp.client import ConeshareClient


class TestDatarooms(unittest.IsolatedAsyncioTestCase):
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
