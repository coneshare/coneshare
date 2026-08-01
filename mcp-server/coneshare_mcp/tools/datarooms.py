from fastmcp import FastMCP, Context
from pydantic import Field

from coneshare_mcp.client import ConeshareClient


def register_dataroom_tools(mcp: FastMCP) -> None:

    @mcp.tool()
    async def list_datarooms(
        ctx: Context,
        page: int = Field(default=1, ge=1, description="Page number"),
        page_size: int = Field(default=20, ge=1, le=100, description="Items per page (max 100)"),
    ) -> dict:
        """List datarooms in your organization with pagination."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.list_datarooms(page=page, page_size=page_size)

    @mcp.tool()
    async def get_dataroom(
        ctx: Context,
        dataroom_id: str = Field(description="ULID of the target dataroom"),
    ) -> dict:
        """Retrieve dataroom details including item hierarchy and settings."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.get_dataroom(dataroom_id=dataroom_id)
