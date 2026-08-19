import logging
import os
from fastmcp import FastMCP

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

mcp = FastMCP("coneshare")

register_document_tools(mcp)
register_dataroom_tools(mcp)
register_share_link_tools(mcp)
register_analytics_tools(mcp)
register_admin_tools(mcp)


def main() -> None:
    transport = os.getenv("MCP_TRANSPORT", "streamable-http").lower()
    host = os.getenv("MCP_HOST", "0.0.0.0")
    port = int(os.getenv("MCP_PORT", "8001"))
    path = os.getenv("MCP_PATH", "/mcp/sse")

    if transport in ("http", "streamable-http", "sse"):
        mcp.run(transport=transport, host=host, port=port, path=path)
    elif transport == "stdio":
        mcp.run(transport="stdio")
    else:
        raise ValueError(
            f"Unsupported MCP_TRANSPORT '{transport}'. "
            "Supported values are 'streamable-http', 'sse', or 'stdio'."
        )


if __name__ == "__main__":
    main()
