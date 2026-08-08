# 🚀 Coneshare Remote MCP Server (`coneshare-mcp`)

The **Coneshare Remote MCP Server** (`coneshare-mcp`) is a standalone HTTP/SSE service that enables AI desktop tools and CLI coding assistants (Claude Desktop, Claude Code, Antigravity CLI `agy`, Codex, Cursor, VS Code) to interact with your Coneshare workspace over Model Context Protocol (MCP).

---

## 🏗️ Architecture

The `coneshare-mcp` service is built around a decoupled **Two-Tier Architecture**:

```text
+-----------------------------------------------------------------------+
|               AI Clients (agy, Claude Desktop, Cursor)               |
+-----------------------------------------------------------------------+
                                   |
                                   | MCP Protocol (StreamableHTTP / SSE / JSON-RPC)
                                   v
+-----------------------------------------------------------------------+
|  Tier 2: FastMCP Tool Layer (coneshare_mcp/tools/*.py)                |
|  - Exposes @mcp.tool() functions to LLMs                              |
|  - Defines Pydantic parameter schemas & descriptions                 |
|  - Extracts user auth context via ConeshareClient.from_ctx(ctx)       |
+-----------------------------------------------------------------------+
                                   |
                                   | Async Python method calls
                                   v
+-----------------------------------------------------------------------+
|  Tier 1: ConeshareClient REST SDK Layer (coneshare_mcp/client.py)     |
|  - Headless async HTTP client for Django REST API                      |
|  - Manages httpx sessions, Bearer headers, & timeouts                 |
|  - Normalizes Django DRF pagination & error responses                 |
+-----------------------------------------------------------------------+
                                   |
                                   | REST API over HTTP (JSON)
                                   v
+-----------------------------------------------------------------------+
|  Django DRF REST API Backend (http://backend:8000/api/v1)            |
+-----------------------------------------------------------------------+
```

### Tier 1: ConeshareClient REST SDK Layer (`coneshare_mcp/client.py`)
- **Headless Async HTTP SDK:** A standalone client handling raw HTTP communication with the Coneshare REST API (`http://backend:8000/api/v1`).
- **Authentication & Headers:** Dynamically extracts `Authorization: Bearer cs_live_...` API keys from FastMCP request context via `ConeshareClient.from_ctx(ctx)`.
- **Response Normalization:** Normalizes Django DRF outputs (e.g. converting `{ "count": 10, "results": [...] }` into `{ "total_count": 10, "items": [...] }`).
- **Decoupled Design:** Has zero dependency on FastMCP or MCP protocol constructs; can be used independently in standalone Python scripts or CLI tools.

### Tier 2: FastMCP Tool Layer (`coneshare_mcp/tools/`)
- **MCP Tool Registration:** Uses FastMCP decorators (`@mcp.tool()`) and Pydantic `Field(description=...)` annotations to declare tool parameters and LLM prompt context across modular files (`documents.py`, `share_links.py`, `datarooms.py`, `analytics.py`, `admin.py`).
- **Context-Aware Request Handling:** Accepts FastMCP `ctx: Context` objects to resolve request authentication and delegate calls to `ConeshareClient`.
- **Guardrails & Pre-checks:** Performs initial parameter validation before executing underlying SDK actions.

---

## 🔒 Authentication Model

The server runs as a shared Remote MCP HTTP endpoint (port `8001`). **No server-wide API key is configured on the server itself.**

Instead, authentication is handled per user:
1. Each user generates an API Key in Coneshare under **Settings > API Keys** (`cs_live_...`).
2. The user configures their local AI client to send their API Key in the HTTP `Authorization: Bearer cs_live_...` header with every MCP request.
3. The MCP server proxies requests to the Coneshare backend using the user's Bearer token, enforcing the user's exact tier permissions (`read_only`, `read_write`, `full_access`).

---

## 🔑 Server Environment Variables

The container / process is configured via environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `CONESHARE_API_URL` | ✅ | N/A | Target Coneshare REST API base URL (required at startup) |
| `MCP_TRANSPORT` | ❌ | `streamable-http` | Transport protocol (`streamable-http` or `sse`) |
| `MCP_HOST` | ❌ | `0.0.0.0` | Server binding address |
| `MCP_PORT` | ❌ | `8001` | Server port |
| `MCP_PATH` | ❌ | `/sse` | SSE stream endpoint path |

---

## ⚙️ Client Integration

### 1. Claude Desktop
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "coneshare": {
      "url": "http://localhost:8001/sse",
      "headers": {
        "Authorization": "Bearer cs_live_YOUR_API_KEY_HERE"
      }
    }
  }
}
```

### 2. Claude Code CLI / Antigravity CLI (`agy`)
```bash
export CONESHARE_API_KEY="cs_live_1234567890abcdef"
agy mcp add coneshare --url http://localhost:8001/sse --bearer-token-env-var CONESHARE_API_KEY
```

### 3. Codex CLI
```bash
export CONESHARE_API_KEY="cs_live_1234567890abcdef"
codex mcp add coneshare --url http://localhost:8001/sse --bearer-token-env-var CONESHARE_API_KEY
```

---

## 🧰 Available Tools (27 Tools)

### 📁 Documents & Folders (11 tools)
* `list_documents`: Paginated list of workspace documents with folder filtering.
* `get_document`: Retrieve detailed document metadata, versions, and active links.
* `search_documents`: Search documents by full-text title or description query.
* `update_document`: Rename or update description metadata of an existing document.
* `delete_document`: `[DESTRUCTIVE]` Soft-delete a document (moves to Trash).
* `create_folder`: Create a new folder in your workspace documents hierarchy.
* `update_folder`: Rename an existing workspace folder.
* `delete_folder`: `[DESTRUCTIVE]` Soft-delete a workspace folder.
* `move_items`: Move documents and/or subfolders into a destination workspace folder.
* `request_document_upload`: Request a pre-signed URL to upload documents/datasets directly to storage.
* `finalize_document_upload`: Finalize document creation after streaming file content to pre-signed upload URL.

### 🏛️ Datarooms (7 tools)
* `list_datarooms`: List organization datarooms with pagination.
* `get_dataroom`: Retrieve dataroom hierarchy, settings, and items.
* `create_dataroom`: Create a new dataroom to group and share documents.
* `add_content_to_dataroom`: Attach workspace documents to an existing dataroom.
* `remove_content_from_dataroom`: Remove workspace documents from an existing dataroom.
* `update_dataroom`: Update metadata (name, description) for an existing dataroom.
* `delete_dataroom`: `[DESTRUCTIVE]` Delete a dataroom.

### 🔗 Share Links (3 tools)
* `list_share_links`: List active share links, filterable by document or dataroom.
* `create_share_link`: Create a share link with NDA text, custom watermark text, email verification, password, and download controls.
* `update_share_link`: Modify security settings, watermark/NDA text, email controls, or toggle link active status.

### 📊 Analytics (3 tools)
* `get_document_analytics`: Fetch view counts, durations, and viewer statistics for a document.
* `list_view_sessions`: List viewer session summaries filterable by document, link, dataroom, or email.
* `get_view_session`: Retrieve detailed session breakdown (page view durations, video logs, link clicks).

### 👑 Admin (3 tools)
* `list_admin_users`: `[ADMIN ONLY]` List organization users with pagination and search.
* `get_admin_user_details`: `[ADMIN ONLY]` Detailed user profile, link count, and views.
* `list_login_activities`: `[ADMIN ONLY]` Organization login logs (IP, user agent, timestamp).
