# 🚀 Coneshare Remote MCP Server (`coneshare-mcp`)

The **Coneshare Remote MCP Server** (`coneshare-mcp`) is a standalone HTTP/SSE service that enables AI desktop tools and CLI coding assistants (Claude Desktop, Claude Code, Antigravity CLI `agy`, Codex, Cursor, VS Code) to interact with your Coneshare workspace over Model Context Protocol (MCP).

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
| `CONESHARE_API_URL` | ❌ | `http://backend:8000/api/v1` | Target Coneshare REST API base URL |
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

## 🧰 Available Tools (15 Tools)

### 📁 Documents (4 tools)
* `list_documents`: Paginated list of workspace documents with folder filtering.
* `get_document`: Retrieve detailed document metadata, versions, and active links.
* `search_documents`: Search documents by full-text title or description query.
* `delete_document`: `[DESTRUCTIVE]` Soft-delete a document (moves to Trash).

### 🏛️ Datarooms (2 tools)
* `list_datarooms`: List organization datarooms with pagination.
* `get_dataroom`: Retrieve dataroom hierarchy, settings, and items.

### 🔗 Share Links (3 tools)
* `list_share_links`: List active share links, filterable by document or dataroom.
* `create_share_link`: Create a share link with NDA/watermark/download controls.
* `update_share_link`: Modify security settings or toggle link active status.

### 📊 Analytics (3 tools)
* `get_document_analytics`: Fetch view counts, durations, and viewer statistics for a document.
* `list_view_sessions`: List viewer session summaries filterable by document, link, dataroom, or email.
* `get_view_session`: Retrieve detailed session breakdown (page view durations, video logs, link clicks).

### 👑 Admin (3 tools)
* `list_admin_users`: `[ADMIN ONLY]` List organization users with pagination and search.
* `get_admin_user_details`: `[ADMIN ONLY]` Detailed user profile, link count, and views.
* `list_login_activities`: `[ADMIN ONLY]` Organization login logs (IP, user agent, timestamp).
