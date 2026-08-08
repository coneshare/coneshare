from __future__ import annotations
from typing import Optional
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

    @mcp.tool()
    async def create_dataroom(
        ctx: Context,
        name: str = Field(description="Name of the new dataroom (e.g. 'Series A Due Diligence')"),
        description: Optional[str] = Field(default=None, description="Optional description of the dataroom"),
        document_ids: Optional[list[str]] = Field(default=None, description="Optional list of document ULIDs to attach immediately"),
    ) -> dict:
        """Create a new dataroom to group and share multiple workspace documents."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.create_dataroom(name=name, description=description, document_ids=document_ids)

    @mcp.tool()
    async def add_content_to_dataroom(
        ctx: Context,
        dataroom_id: str = Field(description="ULID of the target dataroom"),
        document_ids: list[str] = Field(description="List of document ULIDs to add to the dataroom"),
    ) -> dict:
        """Attach workspace documents to an existing dataroom."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.add_content_to_dataroom(dataroom_id=dataroom_id, document_ids=document_ids)

    @mcp.tool()
    async def remove_content_from_dataroom(
        ctx: Context,
        dataroom_id: str = Field(description="ULID of the target dataroom"),
        document_ids: list[str] = Field(description="List of document ULIDs to remove from the dataroom"),
    ) -> dict:
        """Remove workspace documents from an existing dataroom."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.remove_content_from_dataroom(dataroom_id=dataroom_id, document_ids=document_ids)

    @mcp.tool()
    async def update_dataroom(
        ctx: Context,
        dataroom_id: str = Field(description="ULID of the dataroom to update"),
        name: Optional[str] = Field(default=None, description="Updated name of the dataroom"),
        description: Optional[str] = Field(default=None, description="Updated description of the dataroom"),
    ) -> dict:
        """Update metadata (name, description) for an existing dataroom."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.update_dataroom(dataroom_id=dataroom_id, name=name, description=description)

    @mcp.tool()
    async def delete_dataroom(
        ctx: Context,
        dataroom_id: str = Field(description="ULID of the dataroom to delete"),
    ) -> dict:
        """[DESTRUCTIVE] Delete a dataroom."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.delete_dataroom(dataroom_id=dataroom_id)
