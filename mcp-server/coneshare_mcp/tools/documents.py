from __future__ import annotations
from typing import Optional
from fastmcp import FastMCP, Context
from pydantic import Field

from coneshare_mcp.client import ConeshareClient


def register_document_tools(mcp: FastMCP) -> None:

    @mcp.tool()
    async def list_documents(
        ctx: Context,
        page: int = Field(default=1, ge=1, description="Page number"),
        page_size: int = Field(default=20, ge=1, le=100, description="Items per page (max 100)"),
        folder_id: Optional[str] = Field(default=None, description="Filter by folder ULID"),
    ) -> dict:
        """List active documents in your Coneshare workspace with pagination."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.list_documents(page=page, page_size=page_size, folder_id=folder_id)

    @mcp.tool()
    async def get_document(
        ctx: Context,
        document_id: str = Field(description="ULID of the document"),
    ) -> dict:
        """Retrieve detailed document metadata, versions, and active share links."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.get_document(document_id=document_id)

    @mcp.tool()
    async def search_documents(
        ctx: Context,
        query: str = Field(description="Search term for matching document titles or descriptions"),
        page: int = Field(default=1, ge=1, description="Page number"),
        page_size: int = Field(default=20, ge=1, le=100, description="Items per page (max 100)"),
    ) -> dict:
        """Search workspace documents by full-text title or description query with pagination."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.search_documents(query=query, page=page, page_size=page_size)

    @mcp.tool()
    async def delete_document(
        ctx: Context,
        document_id: str = Field(description="ULID of the document to delete"),
    ) -> dict:
        """[DESTRUCTIVE] Soft-delete a document (moves to trash, recoverable via web UI)."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.delete_document(document_id=document_id)
