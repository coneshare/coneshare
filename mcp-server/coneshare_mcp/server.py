import logging
import os
from typing import Literal, cast
from fastmcp import FastMCP

from coneshare_mcp import __version__
from coneshare_mcp.auth import build_auth_provider
from coneshare_mcp.config import Settings, get_settings
from coneshare_mcp.tools.documents import register_document_tools
from coneshare_mcp.tools.datarooms import register_dataroom_tools
from coneshare_mcp.tools.share_links import register_share_link_tools
from coneshare_mcp.tools.analytics import register_analytics_tools
from coneshare_mcp.tools.admin import register_admin_tools
from coneshare_mcp.toolsets import ToolsetFilterMiddleware

log_level_str = os.getenv("LOG_LEVEL", "INFO").upper()
log_level = getattr(logging, log_level_str, logging.INFO)
logging.basicConfig(
    level=log_level,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

SERVER_INSTRUCTIONS = """Coneshare workspace MCP server.

Core entity model:
- Personal workspace (`Document`, `Folder`): create, organize, read, and version files (`list_documents`, `list_folders`, `search_documents`).
- Virtual Dataroom (`Dataroom` containing `DataroomDocument` / `DataroomFolder` references): group and share multiple workspace documents (`list_datarooms`, `get_dataroom`, `add_content_to_dataroom`). Item removals (`remove_content_from_dataroom`) require `dataroom_document_ids` / `dataroom_folder_ids` from `get_dataroom` or `search_dataroom_content`.
- ShareLink: external viewer URL targeting either one Document or one Dataroom (`create_share_link`, `list_share_links`, `update_share_link`).

Key workflows:
- Update existing documents in place without breaking share links via `update_text_document` (for text/Markdown) or `request_version_upload` + `finalize_version_upload` (for binary files). Use `update_document_metadata` only for renaming or changing descriptions.
- Before calling `update_text_document`, read all pages of `read_text_document` (`truncated: true` -> follow `next_offset`).

Optional toolsets:
- Organization admin tools (`admin`: `list_admin_users`, `get_admin_user_details`, `list_login_activities`) are excluded by default; connect with `?toolsets=admin` or header `X-Coneshare-Toolsets: admin` (API keys only).
- Pass `?toolsets=core` (or `X-Coneshare-Toolsets: core`) for a slim preset excluding folder management and destructive tools."""


def create_mcp_server(settings: Settings | None = None) -> FastMCP:
    resolved_settings = settings or get_settings()
    auth_provider = build_auth_provider(resolved_settings)
    server = FastMCP(
        "coneshare",
        instructions=SERVER_INSTRUCTIONS,
        version=__version__,
        auth=auth_provider,
        middleware=[ToolsetFilterMiddleware()],
    )

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
