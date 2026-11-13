from unittest.mock import AsyncMock, MagicMock, patch
from fastmcp import FastMCP
from coneshare_mcp.client import ConeshareClient
from coneshare_mcp.tools.esign import (
    FieldDraftInput,
    SignerDraftInput,
    register_esign_tools,
)
from tests.base import BaseMCPTestCase


class TestEsignTools(BaseMCPTestCase):
    async def test_client_esign_endpoints(self):
        calls = []

        async def mock_request(self_client, method, path, params=None, json_data=None, files=None):
            calls.append((method, path, params, json_data))
            if path == "/esign/requests/" and method == "GET":
                return {
                    "count": 1,
                    "results": [{"id": "req_1", "status": "draft"}],
                    "next": None,
                }
            if path == "/esign/requests/" and method == "POST":
                return {"id": "req_1", "status": "draft", "title": json_data["title"]}
            if path == "/esign/requests/req_1/" and method == "GET":
                return {"id": "req_1", "status": "draft"}
            if path == "/esign/requests/req_1/void/" and method == "POST":
                return {"id": "req_1", "status": "voided"}
            return {}

        old_request = ConeshareClient._request
        ConeshareClient._request = mock_request
        try:
            client = ConeshareClient(api_key="cs_live_testkey123456789")
            listed = await client.list_signature_requests(
                page=1,
                page_size=10,
                status="draft",
                document_id="doc_123",
            )
            self.assertEqual(listed["total_count"], 1)
            self.assertEqual(listed["items"][0]["id"], "req_1")

            created = await client.create_signature_request({
                "document": "doc_123",
                "title": "SAFE Draft",
                "signers": [{"email": "alice@example.com"}],
                "fields": [{"signer_index": 0, "field_type": "signature", "page_number": 1, "x": 10, "y": 70, "width": 25, "height": 8}],
            })
            self.assertEqual(created["status"], "draft")

            fetched = await client.get_signature_request("req_1")
            self.assertEqual(fetched["id"], "req_1")

            voided = await client.void_signature_request("req_1", reason="Superseded")
            self.assertEqual(voided["status"], "voided")

            self.assertEqual(calls[0][1], "/esign/requests/")
            self.assertEqual(calls[0][2]["status"], "draft")
            self.assertEqual(calls[0][2]["document_id"], "doc_123")
            self.assertEqual(calls[3][3], {"reason": "Superseded"})
        finally:
            ConeshareClient._request = old_request

    async def test_client_rejects_invalid_request_id(self):
        client = ConeshareClient(api_key="cs_live_testkey123456789")
        with self.assertRaises(ValueError):
            await client.get_signature_request("../etc/passwd")

    async def test_mcp_tool_registration_excludes_send_and_links(self):
        mcp = FastMCP("test_esign_mcp")
        register_esign_tools(mcp)

        tool_names = set()
        for name in (
            "list_signature_requests",
            "get_signature_request",
            "create_signature_request_draft",
            "void_signature_request",
        ):
            tool = await mcp.get_tool(name)
            self.assertIsNotNone(tool)
            tool_names.add(name)

        self.assertEqual(len(tool_names), 4)
        for forbidden in ("send_signature_request", "get_signing_links", "signing_links"):
            tool = await mcp.get_tool(forbidden)
            self.assertIsNone(tool)

    async def test_create_signature_request_draft_tool_execution(self):
        mcp = FastMCP("test_esign_mcp")
        register_esign_tools(mcp)

        mock_client = MagicMock()
        mock_client.create_signature_request = AsyncMock(
            return_value={"id": "req_99", "status": "draft", "title": "Mutual NDA"}
        )
        mock_ctx = MagicMock()

        tool = await mcp.get_tool("create_signature_request_draft")
        with patch("coneshare_mcp.tools.esign.ConeshareClient.from_ctx", return_value=mock_client):
            res = await tool.fn(
                ctx=mock_ctx,
                document_id="doc_abc",
                title="Mutual NDA",
                signers=[SignerDraftInput(email="bob@investor.com", name="Bob Investor")],
                fields=[
                    FieldDraftInput(
                        signer_email="bob@investor.com",
                        field_type="signature",
                        page_number=1,
                        x=12.0,
                        y=72.0,
                        width=28.0,
                        height=7.5,
                    )
                ],
                dataroom_id="dr_xyz",
                message="Please review before signing.",
                signing_order="sequential",
                idempotency_key="idem-001",
                expires_at=None,
            )

        self.assertEqual(res["id"], "req_99")
        mock_client.create_signature_request.assert_awaited_once_with({
            "document": "doc_abc",
            "title": "Mutual NDA",
            "signing_order": "sequential",
            "signers": [{"email": "bob@investor.com", "name": "Bob Investor"}],
            "fields": [
                {
                    "signer_email": "bob@investor.com",
                    "field_type": "signature",
                    "page_number": 1,
                    "x": 12.0,
                    "y": 72.0,
                    "width": 28.0,
                    "height": 7.5,
                    "is_required": True,
                }
            ],
            "dataroom": "dr_xyz",
            "message": "Please review before signing.",
            "idempotency_key": "idem-001",
        })
