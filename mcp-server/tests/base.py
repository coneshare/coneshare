import unittest
from unittest.mock import patch
from coneshare_mcp.config import Settings


class BaseMCPTestCase(unittest.IsolatedAsyncioTestCase):
    """Base test case for MCP server tests providing mocked settings and client helpers."""

    def setUp(self):
        super().setUp()
        self.mock_settings = Settings(
            api_url="http://testserver/api/v1",
            mcp_transport="streamable-http",
            mcp_host="0.0.0.0",
            mcp_port=8001,
            mcp_path="/sse",
        )
        self._settings_patcher = patch("coneshare_mcp.client.get_settings", return_value=self.mock_settings)
        self._settings_patcher.start()

    def tearDown(self):
        self._settings_patcher.stop()
        super().tearDown()
