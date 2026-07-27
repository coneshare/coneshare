# 🚀 Coneshare Stdio MCP Server — Design & Implementation Plan

> **Decisions finalized:** 2026-07-26 via interactive review session.

---

## 1. 📌 Architectural Overview

The **Stdio MCP Server** is a standalone Python package (`coneshare-mcp`) that runs on the user's host machine. It connects to AI desktop/CLI tools (Claude Desktop, Claude Code, Cursor, VS Code) over standard I/O streams (`stdin`/`stdout`), and translates MCP tool calls into authenticated REST API calls against any local or self-hosted Coneshare server.

Built with **FastMCP** (`fastmcp`), the server lives in a new top-level `mcp-server/` directory — fully decoupled from the Django backend. It communicates with Coneshare exclusively over HTTP REST and is distributed independently on PyPI via `uvx coneshare-mcp`.

```
+-----------------------------------------------------------------------------------+
|                            USER'S LOCAL MACHINE                                   |
|                                                                                   |
|  +---------------------------+               +---------------------------------+  |
|  |   AI Client               |   (stdin /    |   coneshare-mcp                 |  |
|  |   (Claude Desktop / Code /|  stdout MCP)  |   (Python / FastMCP)            |  |
|  |    Cursor / VS Code)      |<------------->|                                 |  |
|  +---------------------------+               +---------------------------------+  |
|                                                              |                    |
|                                                  (HTTP REST  | Multipart Upload)  |
|                                                              v                    |
|                                              +---------------------------------+  |
|                                              |   Self-Hosted Coneshare Server   |  |
|                                              |   http://192.168.x.x:8000/api/v1|  |
|                                              +---------------------------------+  |
+-----------------------------------------------------------------------------------+
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Language / SDK | Python + FastMCP | Aligns with Django backend stack, shares tooling and CI patterns |
| Package location | `mcp-server/` (top-level) | Clean separation — MCP server is an API *client*, not part of the backend |
| Communication | HTTP REST only | No Django ORM imports; distributable independently on PyPI |
| Distribution | `uvx coneshare-mcp` | Zero-install execution, no pre-installed dependencies required |

---

## 2. 🔑 Prerequisites: Backend API Key Support

Currently, Coneshare uses short-lived JWT tokens (`rest_framework_simplejwt`). To allow MCP servers to authenticate persistently without manual token refresh:

### 2.1 API Key Model (`backend/core/models.py`)

```python
class APIKey(BaseModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='api_keys')
    name = models.CharField(max_length=100)
    prefix = models.CharField(max_length=12, db_index=True)     # e.g., "cs_live_abc1"
    encrypted_key = models.TextField()                           # Fernet-encrypted raw key
    tier = models.CharField(
        max_length=20,
        choices=[
            ('read_only', 'Read Only'),
            ('read_write', 'Read & Write'),
            ('full_access', 'Full Access'),
        ],
        default='read_only',
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
```

### 2.2 Scope Tiers

Three coarse RBAC tiers instead of fine-grained per-app scopes:

| Tier | Allowed HTTP Methods | Use Case |
|---|---|---|
| `read_only` | `GET`, `HEAD`, `OPTIONS` | Analytics dashboards, monitoring agents |
| `read_write` | `GET`, `HEAD`, `OPTIONS`, `POST`, `PUT`, `PATCH` | Upload & share workflows (no deletions) |
| `full_access` | All methods including `DELETE` | Trusted agents with full workspace control |

### 2.3 Authentication Class (`backend/core/authentication.py`)

* New `APIKeyAuthentication` class supporting `Authorization: Bearer cs_live_...` headers alongside existing JWT.
* On each request: look up key by prefix, decrypt and verify against the raw bearer token, enforce tier against the request's HTTP method.
* Updates `last_used_at` on successful authentication.

### 2.4 API Key Storage — Retrievable (Encrypted)

API keys are stored using **symmetric encryption** (Fernet, derived from Django's `SECRET_KEY`) rather than one-way hashing. This allows users to reveal the full key again from Settings.

* **Creation flow:** Generate raw key → encrypt with Fernet → store `encrypted_key` + `prefix` → return raw key to frontend.
* **Reveal flow:** User clicks "Reveal" in Settings → re-authentication prompt (password confirm) → decrypt and display.
* **Prefix:** Always visible for identification in logs and UI (e.g., `cs_live_abc1****`).

### 2.5 API Key Management Endpoints & UI

* **Endpoints:** `POST /api/v1/api-keys/` (create), `GET /api/v1/api-keys/` (list), `GET /api/v1/api-keys/{id}/reveal/` (reveal, requires password re-confirmation), `DELETE /api/v1/api-keys/{id}/` (revoke).
* **UI panel:** Settings > API Keys in `frontend/src/pages/UserSettingsPage.jsx` — table of keys with name, prefix, tier, created/last-used dates, and Reveal/Revoke actions.

---

## 3. 🛠️ MCP Server Package (`mcp-server/`)

### 3.1 Project Structure

```
mcp-server/
├── pyproject.toml              # Package metadata, FastMCP + httpx deps
├── README.md                   # Setup & client configuration docs
├── coneshare_mcp/
│   ├── __init__.py
│   ├── server.py               # FastMCP entrypoint & tool registration
│   ├── client.py               # httpx-based API client wrapper
│   ├── config.py               # Env var loading & validation
│   └── tools/
│       ├── __init__.py
│       ├── documents.py        # Document tools
│       ├── datarooms.py        # Dataroom tools
│       ├── share_links.py      # Share link tools
│       └── analytics.py        # Analytics tools
└── tests/
    ├── conftest.py             # Shared fixtures, httpx mock transport
    ├── test_documents.py
    ├── test_datarooms.py
    ├── test_share_links.py
    └── test_analytics.py
```

### 3.2 Environment Configuration

The server reads configuration strictly from environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `CONESHARE_API_KEY` | ✅ | — | API token (e.g., `cs_live_...`) |
| `CONESHARE_API_URL` | ❌ | `http://localhost:8000/api/v1` | Target server base URL |

### 3.3 HTTP Client (`client.py`)

A thin `httpx.AsyncClient` wrapper that:
* Sets `Authorization: Bearer {CONESHARE_API_KEY}` on all requests.
* Handles multipart file uploads for `upload_document`.
* Passes through raw HTTP error responses (status + body) without transformation.

---

## 4. 🧰 MVP Tool Catalog (~12 Tools)

Phase 1 ships the essential **read → upload → share → track** workflow. Additional tools are deferred to future phases based on user demand.

### 📁 Documents (6 tools)

| Tool | Method | Endpoint | Description |
|---|---|---|---|
| `list_documents` | GET | `/documents/` | Paginated list with folder filtering. Returns first page + `total_count`, `has_next`, `page`, `page_size` metadata |
| `get_document` | GET | `/documents/{id}/` | Detailed document metadata, versions, and active share links |
| `search_documents` | GET | `/documents/?search=` | Full-text title/description search |
| `upload_document` | POST | `/documents/` | Reads local file from `file_path` and executes multipart stream upload |
| `update_document` | PATCH | `/documents/{id}/` | Rename or move document between folders |
| `delete_document` | DELETE | `/documents/{id}/` | `[DESTRUCTIVE]` Soft-delete (moves to trash, recoverable) |

### 🏛️ Datarooms (2 tools)

| Tool | Method | Endpoint | Description |
|---|---|---|---|
| `list_datarooms` | GET | `/datarooms/` | List organization datarooms with pagination metadata |
| `get_dataroom` | GET | `/datarooms/{id}/` | Retrieve dataroom tree, branding, and items |

### 🔗 Share Links (3 tools)

| Tool | Method | Endpoint | Description |
|---|---|---|---|
| `list_share_links` | GET | `/share-links/` | List active share links, filterable by `document_id` or `dataroom_id` |
| `create_share_link` | POST | `/share-links/` | Create a share link with options: `password`, `expires_at`, `require_nda`, `enable_watermark`, `allow_download` |
| `update_share_link` | PATCH | `/share-links/{id}/` | Modify active link parameters |

### 📊 Analytics (1 tool)

| Tool | Method | Endpoint | Description |
|---|---|---|---|
| `get_document_analytics` | GET | `/analytics/documents/{id}/` | Fetch overall page view durations and viewer counts |

### Deferred Tools (Future Phases)

These tools are excluded from MVP and will be added based on user demand:

| Tool | Module | Reason Deferred |
|---|---|---|
| `copy_document` | Documents | Rare operation |
| `list_document_versions` | Versions | Advanced workflow |
| `promote_document_version` | Versions | Advanced workflow |
| `refresh_cloud_version` | Cloud Sync | Requires cloud connections setup |
| `create_dataroom` | Datarooms | Less common via AI agent |
| `add_content_to_dataroom` | Datarooms | Less common via AI agent |
| `reorder_dataroom_items` | Datarooms | Niche UX operation |
| `delete_dataroom` | Datarooms | Destructive + rare via AI |
| `get_share_link` | Share Links | `list_share_links` covers most use cases |
| `delete_share_link` | Share Links | Destructive, deferrable |
| `list_file_requests` | File Requests | Separate workflow |
| `create_file_request` | File Requests | Separate workflow |
| `export_file_request_to_cloud` | File Requests | Requires cloud connections |
| `list_view_sessions` | Analytics | Deep analytics |
| `get_link_click_analytics` | Analytics | Deep analytics |
| `get_video_engagement_logs` | Analytics | Deep analytics |
| `restore_document` | Documents | Add alongside delete if needed |

---

## 5. 🔒 Upload Security Model

`upload_document` accepts any absolute file path and reads directly from the user's disk. This follows the MCP trust model where the **AI client** (not the MCP server) is responsible for human-in-the-loop approval before tool execution.

### Safeguards

1. **Path validation:** Verify the path exists, is a regular file (not directory, device, or suspicious symlink), and is readable.
2. **Audit logging:** Log the resolved absolute path to stderr so the user can review what files were accessed.
3. **Client-side gating:** Tool description includes a clear annotation: `"Reads a file from your local disk and uploads it to Coneshare."` — AI clients surface this to the user for approval.

---

## 6. 🛡️ Destructive Operations Policy

Destructive tools (`delete_document`) are protected by three layers — **no server-side confirmation tokens required for MVP:**

### Layer 1: API Key Tier Enforcement
* `read_only` and `read_write` keys cannot call `DELETE` endpoints — the backend returns `403 Forbidden`.
* Only `full_access` keys can perform deletions.

### Layer 2: AI Client Human-in-the-Loop
* Destructive tool descriptions are tagged with `[DESTRUCTIVE]` annotations.
* AI desktop clients (Claude Desktop, Cursor) present an interactive confirmation prompt to the user before executing any destructive tool call.

### Layer 3: Soft-Delete & Recoverability
* `delete_document` marks records as soft-deleted rather than executing a hard SQL delete.
* Documents can be restored via the Coneshare web UI.

---

## 7. 📡 Error Handling

The MCP server passes through raw HTTP responses from the Coneshare API with minimal transformation:

### Success Response
```json
{
  "id": "01J5ABCDEF...",
  "name": "Q3 Report.pdf",
  "created_at": "2026-07-26T12:00:00Z"
}
```

### Error Response
```json
{
  "error": true,
  "status": 403,
  "detail": "You do not have permission to perform this action."
}
```

DRF already returns structured error bodies. The MCP server wraps non-2xx responses with an `error: true` flag and the HTTP `status` code, passing the backend's `detail` or validation errors through verbatim.

---

## 8. 📄 Pagination Convention

All list tools return the **first page plus metadata**, letting the AI decide whether to fetch more:

```json
{
  "items": [ ... ],
  "total_count": 87,
  "page": 1,
  "page_size": 20,
  "has_next": true
}
```

List tools accept optional `page` and `page_size` parameters. The AI can request `list_documents(page=2)` to continue pagination.

---

## 9. 🧪 Testing Strategy

Tests use **mocked HTTP responses** (`respx` or `httpx.MockTransport`) — fast, deterministic, no backend dependency.

### What We Test

| Layer | Assertion |
|---|---|
| **Tool → HTTP request** | Correct endpoint, method, headers, query params, and body for each tool call |
| **HTTP response → Tool result** | Proper formatting of success responses (including pagination metadata) |
| **HTTP error → Tool error** | Error wrapping with `status` and `detail` passthrough |
| **Config validation** | Missing `CONESHARE_API_KEY` raises clear startup error |
| **Upload** | File read + multipart form construction |

### Example Test

```python
import respx
from httpx import Response

@respx.mock
async def test_list_documents_returns_paginated():
    respx.get("http://localhost:8000/api/v1/documents/").mock(
        return_value=Response(200, json={
            "count": 87,
            "next": "http://localhost:8000/api/v1/documents/?page=2",
            "results": [{"id": "abc", "name": "Report.pdf"}],
        })
    )
    result = await call_tool("list_documents", {})
    assert result["total_count"] == 87
    assert result["has_next"] is True
    assert len(result["items"]) == 1
```

---

## 10. ⚙️ Client Configuration

### Claude Desktop
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "coneshare": {
      "command": "uvx",
      "args": ["coneshare-mcp"],
      "env": {
        "CONESHARE_API_KEY": "cs_live_1234567890abcdef",
        "CONESHARE_API_URL": "http://192.168.1.100:8000/api/v1"
      }
    }
  }
}
```

### Claude Code CLI
```bash
claude mcp add coneshare -- uvx coneshare-mcp
```

### Interactive Debugging (Development)
```bash
fastmcp dev coneshare_mcp/server.py
```
Launches a local web inspector to test tools directly against a running Coneshare server.

---

## 11. 🗓️ Implementation Roadmap

| Phase | Deliverables | Target Files |
|---|---|---|
| **Phase 1: API Key Auth** | `APIKey` model (encrypted), `APIKeyAuthentication` class, management endpoints, Settings UI panel | `backend/core/models.py`, `backend/core/authentication.py`, `backend/core/views.py`, `frontend/src/pages/UserSettingsPage.jsx` |
| **Phase 2: MCP Server Scaffold** | Initialize `mcp-server/` package, `pyproject.toml`, FastMCP entrypoint, httpx client wrapper, env config | `mcp-server/pyproject.toml`, `mcp-server/coneshare_mcp/server.py`, `mcp-server/coneshare_mcp/client.py`, `mcp-server/coneshare_mcp/config.py` |
| **Phase 3: MVP Tools** | Implement 12 tools: Documents (6), Datarooms (2), Share Links (3), Analytics (1) | `mcp-server/coneshare_mcp/tools/*.py` |
| **Phase 4: Tests & Docs** | Mocked HTTP test suite, README with client configuration, docs site page | `mcp-server/tests/`, `mcp-server/README.md`, `docs/docs/en/mcp/stdio.md` |

---

## 12. 📋 Sample Implementation (`coneshare_mcp/server.py`)

```python
import httpx
from fastmcp import FastMCP, Context
from pydantic import BaseModel, Field

from coneshare_mcp.config import get_settings
from coneshare_mcp.client import ConeshareClient

mcp = FastMCP("coneshare")


class CreateShareLinkInput(BaseModel):
    document_id: str = Field(description="ULID of the target document")
    password: str | None = Field(default=None, description="Optional access password")
    expires_in_days: int = Field(default=7, description="Link expiration in days")
    allow_download: bool = Field(default=True, description="Allow file downloads")


@mcp.tool()
async def list_documents(
    ctx: Context,
    page: int = Field(default=1, description="Page number"),
    page_size: int = Field(default=20, description="Items per page (max 100)"),
    folder_id: str | None = Field(default=None, description="Filter by folder ULID"),
) -> dict:
    """List documents in your Coneshare workspace with pagination."""
    client = ConeshareClient.from_env()
    return await client.list_documents(page=page, page_size=page_size, folder_id=folder_id)


@mcp.tool()
async def create_share_link(data: CreateShareLinkInput, ctx: Context) -> dict:
    """Create a new share link for a document with optional security controls."""
    client = ConeshareClient.from_env()
    return await client.create_share_link(data.model_dump(exclude_none=True))


@mcp.tool()
async def upload_document(
    ctx: Context,
    file_path: str = Field(description="Absolute path to the local file to upload"),
    folder_id: str | None = Field(default=None, description="Target folder ULID"),
) -> dict:
    """Reads a file from your local disk and uploads it to Coneshare."""
    client = ConeshareClient.from_env()
    return await client.upload_document(file_path=file_path, folder_id=folder_id)


@mcp.tool()
async def delete_document(
    ctx: Context,
    document_id: str = Field(description="ULID of the document to delete"),
) -> dict:
    """[DESTRUCTIVE] Soft-delete a document (moves to trash, recoverable via web UI)."""
    client = ConeshareClient.from_env()
    return await client.delete_document(document_id)


if __name__ == "__main__":
    mcp.run(transport="stdio")
```
