import logging
import os
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger("coneshare_mcp.config")


@dataclass
class Settings:
    api_url: str
    mcp_transport: str
    mcp_host: str
    mcp_port: int
    mcp_path: str
    fileserver_internal_url: Optional[str] = None
    oauth_enabled: bool = False
    site_domain: str = ""


def get_settings() -> Settings:
    api_url = os.getenv("CONESHARE_API_URL")
    if not api_url:
        logger.critical("CONESHARE_API_URL environment variable is required but missing. Stopping MCP server startup.")
        raise RuntimeError("Missing required environment variable: CONESHARE_API_URL")

    mcp_host = os.getenv("MCP_HOST", "0.0.0.0")
    mcp_port = int(os.getenv("MCP_PORT", "8001"))
    fileserver_internal_url = os.getenv("CONESHARE_FILESERVER_INTERNAL_URL")
    oauth_enabled = os.getenv("CONESHARE_OAUTH_ENABLED", "false").lower() in ("true", "1", "yes")
    site_domain = (os.getenv("SITE_DOMAIN") or "").strip().rstrip("/")
    if oauth_enabled and not site_domain:
        logger.critical("SITE_DOMAIN environment variable is required when OAuth is enabled. Stopping MCP server startup.")
        raise RuntimeError("Missing required environment variable: SITE_DOMAIN")

    return Settings(
        api_url=api_url.rstrip("/"),
        mcp_transport=os.getenv("MCP_TRANSPORT", "streamable-http").lower(),
        mcp_host=mcp_host,
        mcp_port=mcp_port,
        mcp_path=os.getenv("MCP_PATH", "/mcp/sse"),
        fileserver_internal_url=fileserver_internal_url.rstrip("/") if fileserver_internal_url else None,
        oauth_enabled=oauth_enabled,
        site_domain=site_domain,
    )
