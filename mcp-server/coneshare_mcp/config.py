import logging
import os
from dataclasses import dataclass

logger = logging.getLogger("coneshare_mcp.config")


@dataclass
class Settings:
    api_url: str
    mcp_transport: str
    mcp_host: str
    mcp_port: int
    mcp_path: str


def get_settings() -> Settings:
    api_url = os.getenv("CONESHARE_API_URL")
    if not api_url:
        logger.critical("CONESHARE_API_URL environment variable is required but missing. Stopping MCP server startup.")
        raise RuntimeError("Missing required environment variable: CONESHARE_API_URL")

    return Settings(
        api_url=api_url.rstrip("/"),
        mcp_transport=os.getenv("MCP_TRANSPORT", "streamable-http").lower(),
        mcp_host=os.getenv("MCP_HOST", "0.0.0.0"),
        mcp_port=int(os.getenv("MCP_PORT", "8001")),
        mcp_path=os.getenv("MCP_PATH", "/sse"),
    )
