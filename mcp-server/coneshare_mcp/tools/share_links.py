from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastmcp import FastMCP, Context
from pydantic import BaseModel, Field

from coneshare_mcp.client import ConeshareClient


class CreateShareLinkInput(BaseModel):
    document_id: Optional[str] = Field(default=None, description="ULID of target document")
    dataroom_id: Optional[str] = Field(default=None, description="ULID of target dataroom")
    password: Optional[str] = Field(default=None, description="Optional protection password")
    expires_in_days: Optional[int] = Field(default=None, description="Link expiration in days")
    require_nda: bool = Field(default=False, description="Enforce NDA sign-off before viewing")
    enable_watermark: bool = Field(default=False, description="Overlay dynamic watermark on document preview")
    allow_download: bool = Field(default=True, description="Allow original binary file download")


class UpdateShareLinkInput(BaseModel):
    share_link_id: str = Field(description="ULID of the share link to update")
    password: Optional[str] = Field(default=None, description="Updated protection password")
    require_nda: Optional[bool] = Field(default=None, description="Enforce NDA sign-off")
    enable_watermark: Optional[bool] = Field(default=None, description="Overlay dynamic watermark")
    allow_download: Optional[bool] = Field(default=None, description="Allow binary file download")
    is_active: Optional[bool] = Field(default=None, description="Enable or disable share link")


def register_share_link_tools(mcp: FastMCP) -> None:

    @mcp.tool()
    async def list_share_links(
        ctx: Context,
        document_id: Optional[str] = Field(default=None, description="Filter by document ULID"),
        dataroom_id: Optional[str] = Field(default=None, description="Filter by dataroom ULID"),
        page: int = Field(default=1, ge=1, description="Page number"),
        page_size: int = Field(default=20, ge=1, le=100, description="Items per page (max 100)"),
    ) -> dict:
        """List active share links filterable by target document or dataroom."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.list_share_links(
            document_id=document_id,
            dataroom_id=dataroom_id,
            page=page,
            page_size=page_size,
        )

    @mcp.tool()
    async def create_share_link(data: CreateShareLinkInput, ctx: Context) -> dict:
        """Create a new share link for a document or dataroom with optional security controls."""
        client = ConeshareClient.from_ctx(ctx)
        payload = data.model_dump(exclude_none=True)
        if "document_id" in payload:
            payload["document"] = payload.pop("document_id")
        if "dataroom_id" in payload:
            payload["dataroom"] = payload.pop("dataroom_id")
        if "expires_in_days" in payload:
            days = payload.pop("expires_in_days")
            payload["expires_at"] = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
        return await client.create_share_link(payload)

    @mcp.tool()
    async def update_share_link(data: UpdateShareLinkInput, ctx: Context) -> dict:
        """Modify security parameters or active state of an existing share link."""
        client = ConeshareClient.from_ctx(ctx)
        share_link_id = data.share_link_id
        payload = data.model_dump(exclude={"share_link_id"}, exclude_none=True)
        return await client.update_share_link(share_link_id=share_link_id, data=payload)
