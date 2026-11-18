import logging
import os
from typing import Literal, cast
from fastmcp import FastMCP

from coneshare_mcp.auth import build_auth_provider
from coneshare_mcp.config import Settings, get_settings
from coneshare_mcp.tools.documents import register_document_tools
from coneshare_mcp.tools.datarooms import register_dataroom_tools
from coneshare_mcp.tools.share_links import register_share_link_tools
from coneshare_mcp.tools.analytics import register_analytics_tools
from coneshare_mcp.tools.admin import register_admin_tools

log_level_str = os.getenv("LOG_LEVEL", "INFO").upper()
log_level = getattr(logging, log_level_str, logging.INFO)
logging.basicConfig(
    level=log_level,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


def create_mcp_server(settings: Settings | None = None) -> FastMCP:
    resolved_settings = settings or get_settings()
    auth_provider = build_auth_provider(resolved_settings)
    server = FastMCP("coneshare", auth=auth_provider)

    register_document_tools(server)
    register_dataroom_tools(server)
    register_share_link_tools(server)
    register_analytics_tools(server)
    register_admin_tools(server)
    return server


mcp = create_mcp_server()


def main() -> None:
    settings = get_settings()
    transport = settings.mcp_transport
    host = settings.mcp_host
    port = settings.mcp_port
    path = settings.mcp_path

    if transport in ("http", "streamable-http", "sse"):
        mcp.run(
            transport=cast(Literal["http", "streamable-http", "sse"], transport),
            host=host,
            port=port,
            path=path,
        )
    elif transport == "stdio":
        mcp.run(transport="stdio")
    else:
        raise ValueError(
            f"Unsupported MCP_TRANSPORT '{transport}'. "
            "Supported values are 'streamable-http', 'sse', or 'stdio'."
        )


if __name__ == "__main__":
    main()
