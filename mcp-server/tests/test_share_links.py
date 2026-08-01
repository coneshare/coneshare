import unittest
from coneshare_mcp.client import ConeshareClient


class TestShareLinks(unittest.IsolatedAsyncioTestCase):
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
