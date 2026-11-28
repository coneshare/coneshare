from __future__ import annotations
from typing import Optional
from fastmcp import FastMCP, Context
from pydantic import Field

from coneshare_mcp.client import ConeshareClient


def register_analytics_tools(mcp: FastMCP) -> None:

    @mcp.tool(tags={"core", "read"})
    async def get_document_analytics(
        ctx: Context,
        document_id: str = Field(
            description="Workspace document ULID (from list_documents or search_documents)"
        ),
    ) -> dict:
        """Fetch aggregate view counts, durations, and engagement analytics for a Coneshare document."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.get_document_analytics(document_id=document_id)

    @mcp.tool(tags={"core", "viewer_analytics", "read"})
    async def list_view_sessions(
        ctx: Context,
        document_id: Optional[str] = Field(
            default=None,
            description="Filter view sessions by workspace document ULID (from list_documents or search_documents)",
        ),
        share_link_id: Optional[str] = Field(
            default=None,
            description="Filter view sessions by share link ULID (from list_share_links)",
        ),
        dataroom_id: Optional[str] = Field(
            default=None,
            description="Filter view sessions by dataroom ULID (from list_datarooms)",
        ),
        viewer_email: Optional[str] = Field(default=None, description="Filter view sessions by viewer email address"),
        page: int = Field(default=1, ge=1, description="Page number"),
        page_size: int = Field(default=20, ge=1, le=100, description="Items per page (max 100)"),
    ) -> dict:
        """List Coneshare viewer sessions with metadata summaries (viewer email, location, total duration, completion rate, viewed_at)."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.list_view_sessions(
            document_id=document_id,
            share_link_id=share_link_id,
            dataroom_id=dataroom_id,
            viewer_email=viewer_email,
            page=page,
            page_size=page_size,
        )

    @mcp.tool(tags={"core", "viewer_analytics", "read"})
    async def get_view_session(
        ctx: Context,
        session_id: str = Field(
            description="View session ULID (from list_view_sessions)"
        ),
    ) -> dict:
        """Retrieve full details of a Coneshare view session including page-by-page durations, video metrics, and clicks."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.get_view_session(session_id=session_id)
