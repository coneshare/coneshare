from __future__ import annotations

from typing import Literal, Optional
from fastmcp import Context, FastMCP
from pydantic import BaseModel, Field

from coneshare_mcp.client import ConeshareClient


class SignerDraftInput(BaseModel):
    email: str = Field(description="Signer email address")
    name: Optional[str] = Field(default=None, description="Optional signer display name")
    role: Optional[str] = Field(default=None, description="Optional role label (e.g. 'Investor', 'Founder')")
    order_index: Optional[int] = Field(default=None, ge=1, description="1-based signing order index for sequential workflows")


class FieldDraftInput(BaseModel):
    signer_email: Optional[str] = Field(default=None, description="Email of the assigned signer (must match a signer entry)")
    signer_index: Optional[int] = Field(default=None, ge=0, description="0-based index into signers list (alternative to signer_email)")
    field_type: Literal["signature", "initials", "date", "text", "name"] = Field(description="Type of form field")
    page_number: int = Field(ge=1, description="1-based PDF page number")
    x: float = Field(ge=0.0, le=100.0, description="Left edge X percentage (0-100)")
    y: float = Field(ge=0.0, le=100.0, description="Top edge Y percentage (0-100)")
    width: float = Field(gt=0.0, le=100.0, description="Box width percentage (0-100)")
    height: float = Field(gt=0.0, le=100.0, description="Box height percentage (0-100)")
    is_required: bool = Field(default=True, description="Whether signer must fill this field before submitting")


def register_esign_tools(mcp: FastMCP) -> None:

    @mcp.tool()
    async def list_signature_requests(
        ctx: Context,
        status: Optional[str] = Field(default=None, description="Optional status filter (e.g. 'draft', 'sent', 'completed', 'voided', 'declined')"),
        document_id: Optional[str] = Field(default=None, description="Filter by source document ULID"),
        dataroom_id: Optional[str] = Field(default=None, description="Filter by target dataroom ULID"),
        page: int = Field(default=1, ge=1, description="Page number"),
        page_size: int = Field(default=20, ge=1, le=100, description="Items per page (max 100)"),
    ) -> dict:
        """List native e-signature requests in the organization (never includes raw signer tokens)."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.list_signature_requests(
            page=page,
            page_size=page_size,
            status=status,
            document_id=document_id,
            dataroom_id=dataroom_id,
        )

    @mcp.tool()
    async def get_signature_request(
        ctx: Context,
        request_id: str = Field(description="ULID of the signature request"),
    ) -> dict:
        """Retrieve detailed status, signers, fields, and audit trail for a signature request."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.get_signature_request(request_id=request_id)

    @mcp.tool()
    async def create_signature_request_draft(
        ctx: Context,
        document_id: str = Field(description="ULID of the source PDF document to be signed"),
        title: str = Field(description="Signature request title shown to signers"),
        signers: list[SignerDraftInput] = Field(min_length=1, description="Ordered list of recipients/signers"),
        fields: list[FieldDraftInput] = Field(min_length=1, description="Signature/text fields positioned in PDF page percentages"),
        dataroom_id: Optional[str] = Field(default=None, description="Optional dataroom ULID for auto-vaulting executed PDF into Executed/Agreements/"),
        message: Optional[str] = Field(default=None, description="Optional note shown to signers"),
        signing_order: Literal["parallel", "sequential"] = Field(default="parallel", description="Parallel (all at once) or sequential (one by one)"),
        idempotency_key: Optional[str] = Field(default=None, description="Optional idempotency key to prevent duplicate drafts on retry"),
        expires_at: Optional[str] = Field(default=None, description="Optional ISO-8601 expiration timestamp"),
    ) -> dict:
        """Prepare a signature request draft for human review and manual dispatch in the ConeShare UI.

        Drafts are NOT sent automatically; a workspace operator must review and click Send in the web app.
        """
        client = ConeshareClient.from_ctx(ctx)
        payload: dict = {
            "document": document_id,
            "title": title,
            "signing_order": signing_order,
            "signers": [s.model_dump(exclude_none=True) for s in signers],
            "fields": [f.model_dump(exclude_none=True) for f in fields],
        }
        if dataroom_id:
            payload["dataroom"] = dataroom_id
        if message is not None:
            payload["message"] = message
        if idempotency_key:
            payload["idempotency_key"] = idempotency_key
        if expires_at:
            payload["expires_at"] = expires_at
        return await client.create_signature_request(payload)

    @mcp.tool()
    async def void_signature_request(
        ctx: Context,
        request_id: str = Field(description="ULID of the signature request to void/cancel"),
        reason: Optional[str] = Field(default=None, description="Optional reason recorded in the audit trail"),
    ) -> dict:
        """Void an active or draft signature request so signers can no longer sign it."""
        client = ConeshareClient.from_ctx(ctx)
        return await client.void_signature_request(request_id=request_id, reason=reason)
