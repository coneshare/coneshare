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



    @mcp.tool()
    async def request_document_upload(
        ctx: Context,
        file_name: str = Field(description="Name of the file to upload (e.g., 'large_dataset.zip')"),
        file_size: int = Field(default=0, description="Size of the file in bytes (optional, defaults to 0 if unknown)"),
        path: Optional[str] = Field(default=None, description="Optional root-relative destination folder path (e.g. 'data/exports')"),
    ) -> dict:
        """Request a pre-signed URL to upload documents or datasets directly to storage.

        Use this tool for binary files, documents, or datasets.
        Returns an upload_url for direct HTTP PUT, followed by finalize_document_upload.
        """
        client = ConeshareClient.from_ctx(ctx)
        return await client.request_document_upload(
            file_name=file_name,
            file_size=file_size,
            path=path,
        )

    @mcp.tool()
    async def finalize_document_upload(
        ctx: Context,
        storage_key: str = Field(description="Storage key returned from request_document_upload"),
        unique_name: Optional[str] = Field(default=None, description="Unique name returned from request_document_upload"),
        file_name: Optional[str] = Field(default=None, description="Original file name (fallback for unique_name)"),
        file_size: int = Field(default=0, description="Size of the uploaded file in bytes"),
        content_type: str = Field(default="application/octet-stream", description="MIME type of the file"),
        path: Optional[str] = Field(default=None, description="Optional root-relative destination folder path"),
    ) -> dict:
        """Finalize document creation after streaming file content to the pre-signed upload URL.

        Commit document metadata, create workspace records, and trigger background preview processing.
        """
        client = ConeshareClient.from_ctx(ctx)
        target_unique_name = unique_name or file_name
        if not target_unique_name:
            raise ValueError("Either unique_name or file_name must be provided to finalize document upload.")
        return await client.finalize_document_upload(
            storage_key=storage_key,
            unique_name=target_unique_name,
            file_size=file_size,
            content_type=content_type,
            path=path,
        )

    @mcp.tool()
    async def update_document(
        ctx: Context,
        document_id: str = Field(description="ULID of the document to update"),
        name: Optional[str] = Field(default=None, description="Updated file name (e.g. 'report_v2.pdf')"),
        description: Optional[str] = Field(default=None, description="Updated document description"),
    ) -> dict:
        """Rename or update description metadata of an existing document."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.update_document(document_id=document_id, name=name, description=description)

    @mcp.tool()
    async def create_folder(
        ctx: Context,
        name: str = Field(description="Name of the new workspace folder"),
        parent_folder_id: Optional[str] = Field(default=None, description="Optional ULID of the parent folder"),
    ) -> dict:
        """Create a new folder in your workspace documents hierarchy."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.create_folder(name=name, parent_folder_id=parent_folder_id)

    @mcp.tool()
    async def update_folder(
        ctx: Context,
        folder_id: str = Field(description="ULID of the workspace folder to update"),
        name: str = Field(description="New name for the folder"),
    ) -> dict:
        """Rename an existing workspace folder."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.update_folder(folder_id=folder_id, name=name)

    @mcp.tool()
    async def delete_folder(
        ctx: Context,
        folder_id: str = Field(description="ULID of the workspace folder to delete"),
    ) -> dict:
        """[DESTRUCTIVE] Soft-delete a workspace folder."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.delete_folder(folder_id=folder_id)

    @mcp.tool()
    async def move_items(
        ctx: Context,
        destination_folder_id: Optional[str] = Field(default=None, description="ULID of target destination folder (None for root workspace)"),
        document_ids: Optional[list[str]] = Field(default=None, description="List of document ULIDs to move"),
        folder_ids: Optional[list[str]] = Field(default=None, description="List of folder ULIDs to move"),
    ) -> dict:
        """Move documents and/or subfolders into a destination workspace folder."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.move_items(
            destination_folder_id=destination_folder_id,
            document_ids=document_ids,
            folder_ids=folder_ids,
        )
