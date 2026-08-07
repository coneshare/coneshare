from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastmcp import FastMCP, Context
from pydantic import BaseModel, Field

from coneshare_mcp.client import ConeshareClient


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
    async def create_share_link(
        ctx: Context,
        document_id: Optional[str] = Field(default=None, description="ULID of target document"),
        dataroom_id: Optional[str] = Field(default=None, description="ULID of target dataroom"),
        name: Optional[str] = Field(default=None, description="Optional share link display name"),
        password: Optional[str] = Field(default=None, description="Optional protection password"),
        expires_in_days: Optional[int] = Field(default=None, description="Link expiration in days"),
        require_nda: Optional[bool] = Field(default=None, description="Enforce NDA sign-off before viewing"),
        enable_watermark: Optional[bool] = Field(default=None, description="Overlay dynamic watermark on document preview"),
        allow_download: Optional[bool] = Field(default=True, description="Allow original binary file download"),
    ) -> dict:
        """Create a new share link for a document or dataroom with optional security controls.

        Returns full viewer URL property 'url' alongside 'slug'.
        """
        client = ConeshareClient.from_ctx(ctx)
        payload: dict = {}

        if document_id:
            payload["document"] = document_id
        if dataroom_id:
            payload["dataroom"] = dataroom_id
        if name:
            payload["name"] = name
        else:
            payload["name"] = "Share Link"
        if password:
            payload["password"] = password
        if expires_in_days is not None:
            payload["expires_at"] = (datetime.now(timezone.utc) + timedelta(days=expires_in_days)).isoformat()
        if require_nda is not None:
            payload["require_nda"] = require_nda
        if enable_watermark is not None:
            payload["enable_watermark"] = enable_watermark
        if allow_download is not None:
            payload["allow_download"] = allow_download

        return await client.create_share_link(payload)

    @mcp.tool()
    async def update_share_link(
        ctx: Context,
        share_link_id: str = Field(description="ULID of the share link to update"),
        name: Optional[str] = Field(default=None, description="Updated share link display name"),
        password: Optional[str] = Field(default=None, description="Updated protection password"),
        expires_in_days: Optional[int] = Field(default=None, description="Link expiration in days (e.g. 7)"),
        expires_at: Optional[str] = Field(default=None, description="ISO timestamp for link expiration"),
        clear_expiration: bool = Field(default=False, description="Set True to clear link expiration"),
        require_nda: Optional[bool] = Field(default=None, description="Enforce NDA sign-off"),
        enable_watermark: Optional[bool] = Field(default=None, description="Overlay dynamic watermark"),
        allow_download: Optional[bool] = Field(default=None, description="Allow binary file download"),
        is_active: Optional[bool] = Field(default=None, description="Enable or disable share link"),
    ) -> dict:
        """Modify security parameters or active state of an existing share link."""
        client = ConeshareClient.from_ctx(ctx)
        payload: dict = {}

        if name:
            payload["name"] = name
        if password is not None:
            payload["password"] = password
        if clear_expiration:
            payload["expires_at"] = None
        elif expires_in_days is not None:
            payload["expires_at"] = (datetime.now(timezone.utc) + timedelta(days=expires_in_days)).isoformat()
        elif expires_at is not None:
            payload["expires_at"] = expires_at
        if require_nda is not None:
            payload["require_nda"] = require_nda
        if enable_watermark is not None:
            payload["enable_watermark"] = enable_watermark
        if allow_download is not None:
            payload["allow_download"] = allow_download
        if is_active is not None:
            payload["is_active"] = is_active

        return await client.update_share_link(share_link_id=share_link_id, data=payload)
