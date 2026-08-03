import os
import pytest
from coneshare_mcp.config import Settings


@pytest.fixture(autouse=True)
def env_setup(monkeypatch):
    monkeypatch.setenv("CONESHARE_API_URL", "http://testserver/api/v1")


@pytest.fixture
def mock_settings():
    return Settings(
        api_url="http://testserver/api/v1",
        mcp_transport="streamable-http",
        mcp_host="0.0.0.0",
        mcp_port=8001,
        mcp_path="/sse",
    )
