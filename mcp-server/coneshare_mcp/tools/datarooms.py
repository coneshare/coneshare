from __future__ import annotations
from typing import Optional
from fastmcp import FastMCP, Context
from pydantic import Field

from coneshare_mcp.client import ConeshareClient


def register_dataroom_tools(mcp: FastMCP) -> None:

    @mcp.tool(tags={"core", "read"})
    async def list_datarooms(
        ctx: Context,
        page: int = Field(default=1, ge=1, description="Page number"),
        page_size: int = Field(default=20, ge=1, le=100, description="Items per page (max 100)"),
        name: Optional[str] = Field(default=None, description="Optional case-insensitive substring filter by dataroom name"),
    ) -> dict:
        """List accessible Coneshare datarooms with pagination and optional name filtering."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.list_datarooms(page=page, page_size=page_size, name=name)

    @mcp.tool(tags={"core", "read"})
    async def get_dataroom(
        ctx: Context,
        dataroom_id: str = Field(
            description="Dataroom ULID (from list_datarooms or create_dataroom)"
        ),
    ) -> dict:
        """Retrieve Coneshare dataroom details including dataroom_document and dataroom_folder IDs and settings."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.get_dataroom(dataroom_id=dataroom_id)

    @mcp.tool(tags={"core", "read"})
    async def search_dataroom_content(
        ctx: Context,
        dataroom_id: str = Field(
            description="Dataroom ULID (from list_datarooms or create_dataroom)"
        ),
        query: str = Field(description="Search term matching folder/document names or document descriptions inside the dataroom"),
    ) -> dict:
        """Search folders and documents across all subfolders inside a specific Coneshare dataroom."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.search_dataroom_content(dataroom_id=dataroom_id, query=query)

    @mcp.tool(tags={"core", "write"})
    async def create_dataroom(
        ctx: Context,
        name: str = Field(description="Name of the new dataroom (e.g. 'Series A Due Diligence')"),
        description: Optional[str] = Field(default=None, description="Optional description of the dataroom"),
        document_ids: Optional[list[str]] = Field(
            default=None,
            description="Optional workspace document ULIDs to attach immediately (from list_documents or search_documents)",
        ),
    ) -> dict:
        """Create a new Coneshare dataroom to group and share multiple workspace documents."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.create_dataroom(name=name, description=description, document_ids=document_ids)

    @mcp.tool(tags={"core", "write"})
    async def add_content_to_dataroom(
        ctx: Context,
        dataroom_id: str = Field(
            description="Dataroom ULID (from list_datarooms or create_dataroom)"
        ),
        document_ids: list[str] = Field(
            description="Workspace document ULIDs to attach (from list_documents, search_documents, or create_text_document)"
        ),
    ) -> dict:
        """Attach workspace documents to an existing Coneshare dataroom."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.add_content_to_dataroom(dataroom_id=dataroom_id, document_ids=document_ids)

    @mcp.tool(tags={"destructive", "write"})
    async def remove_content_from_dataroom(
        ctx: Context,
        dataroom_id: str = Field(
            description="Dataroom ULID (from list_datarooms or create_dataroom)"
        ),
        dataroom_document_ids: Optional[list[str]] = Field(
            default=None,
            description="Dataroom-document ULIDs to remove (from get_dataroom or search_dataroom_content; NOT workspace document_ids)",
        ),
        dataroom_folder_ids: Optional[list[str]] = Field(
            default=None,
            description="Dataroom-folder ULIDs to remove (from get_dataroom or search_dataroom_content; NOT workspace folder_ids)",
        ),
    ) -> dict:
        """[DESTRUCTIVE] Remove dataroom documents or dataroom folders from an existing Coneshare dataroom."""
        if not dataroom_document_ids and not dataroom_folder_ids:
            return {
                "error": True,
                "message": (
                    "At least one dataroom_document_id or dataroom_folder_id must be provided "
                    "(fetch them from get_dataroom or search_dataroom_content)."
                ),
            }
        client = ConeshareClient.from_ctx(ctx)
        return await client.remove_content_from_dataroom(
            dataroom_id=dataroom_id,
            dataroom_document_ids=dataroom_document_ids,
            dataroom_folder_ids=dataroom_folder_ids,
        )

    @mcp.tool(tags={"core", "write"})
    async def update_dataroom(
        ctx: Context,
        dataroom_id: str = Field(
            description="Dataroom ULID (from list_datarooms or create_dataroom)"
        ),
        name: Optional[str] = Field(default=None, description="Updated name of the dataroom"),
        description: Optional[str] = Field(default=None, description="Updated description of the dataroom"),
    ) -> dict:
        """Update metadata (name, description) for an existing Coneshare dataroom."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.update_dataroom(dataroom_id=dataroom_id, name=name, description=description)

    @mcp.tool(tags={"destructive", "write"})
    async def delete_dataroom(
        ctx: Context,
        dataroom_id: str = Field(
            description="Dataroom ULID (from list_datarooms or create_dataroom)"
        ),
    ) -> dict:
        """[DESTRUCTIVE] Delete a Coneshare dataroom."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.delete_dataroom(dataroom_id=dataroom_id)
