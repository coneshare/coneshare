from __future__ import annotations
from typing import Optional
from fastmcp import FastMCP, Context
from pydantic import Field

from coneshare_mcp.client import ConeshareClient


def register_admin_tools(mcp: FastMCP) -> None:

    @mcp.tool()
    async def list_admin_users(
        ctx: Context,
        page: int = Field(default=1, ge=1, description="Page number"),
        page_size: int = Field(default=20, ge=1, le=100, description="Items per page (max 100)"),
        search: Optional[str] = Field(default=None, description="Optional search term by user name or email"),
    ) -> dict:
        """[ADMIN ONLY] List all users in your organization with pagination and optional search filter."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.list_admin_users(page=page, page_size=page_size, search=search)

    @mcp.tool()
    async def get_admin_user_details(
        ctx: Context,
        user_id: str = Field(description="ULID or UUID of target user"),
    ) -> dict:
        """[ADMIN ONLY] Retrieve detailed user profile including created share links, datarooms count, and total view session engagement."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.get_admin_user_details(user_id=user_id)

    @mcp.tool()
    async def list_login_activities(
        ctx: Context,
        page: int = Field(default=1, ge=1, description="Page number"),
        page_size: int = Field(default=20, ge=1, le=100, description="Items per page (max 100)"),
        user_id: Optional[str] = Field(default=None, description="Filter by user ULID or UUID"),
    ) -> dict:
        """[ADMIN ONLY] List organization user login activity logs (IP addresses, user agents, timestamps, success status)."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.list_login_activities(page=page, page_size=page_size, user_id=user_id)
