# Coneshare Remote MCP Server (`coneshare-mcp`)

`coneshare-mcp` is a standalone HTTP/SSE service that connects web AI apps (ChatGPT, Google Gemini, Claude.ai, and Grok) and desktop or CLI coding assistants (Claude Desktop, Claude Code, Antigravity CLI `agy`, Codex, Cursor, and VS Code) to your Coneshare workspace over the Model Context Protocol (MCP).

![Coneshare Remote MCP AI Integrations](../portal/public/agent-poster.jpg)

<p align="center">
  <em>▶ <a href="https://assets.coneshare.com/coneshare-ai-mcp-v1.mp4"><strong>Watch the Coneshare MCP &amp; AI Agents walkthrough video</strong></a></em> ·
  <a href="https://www.coneshare.com/agents"><strong>Interactive Setup Guide</strong></a> ·
  <a href="https://docs.coneshare.com/en/mcp-server/"><strong>Docs</strong></a>
</p>

---

## Architecture

The `coneshare-mcp` service has two layers:

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

### Tier 1: ConeshareClient REST SDK (`coneshare_mcp/client.py`)
`ConeshareClient` is an async HTTP client for the Coneshare REST API (`http://backend:8000/api/v1`). It reads `Authorization: Bearer cs_live_...` headers from the FastMCP request context via `ConeshareClient.from_ctx(ctx)`, and normalizes Django DRF responses (for example, turning `{ "count": 10, "results": [...] }` into `{ "total_count": 10, "items": [...] }`). It has no dependency on FastMCP, so standalone Python scripts and CLI tools can import it directly.

### Tier 2: FastMCP tool layer (`coneshare_mcp/tools/`)
The tool modules (`documents.py`, `share_links.py`, `datarooms.py`, `analytics.py`, `admin.py`) register `@mcp.tool()` functions and define Pydantic `Field(description=...)` schemas for LLM callers. Each tool reads the request context (`ctx: Context`) to resolve user authentication, validates parameters, and delegates to `ConeshareClient`.

---

## Authentication model

The server runs as a shared remote MCP HTTP endpoint on port `8001`. You do not set a server-wide API key on the server itself.

Each user authenticates per request in one of two ways:
1. OAuth 2.1 with PKCE (web AI clients): When `CONESHARE_OAUTH_ENABLED=true`, ChatGPT, Google Gemini, Claude.ai, and Grok discover OAuth metadata, register dynamically, and prompt you to sign in to Coneshare and approve `read` or `write` scopes. Destructive deletes, admin endpoints, and viewer PII analytics remain blocked.
2. Scoped API keys (CLI and desktop agents): Create an API key under Settings > API Keys (`cs_live_...`) and pass it in the `Authorization: Bearer cs_live_...` header. The server enforces the key's tier (`read_only`, `read_write`, or `full_access`).

---

## Server environment variables

Configure the container or process with these environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `CONESHARE_API_URL` | Yes | N/A | Target Coneshare REST API base URL (required at startup) |
| `CONESHARE_FILESERVER_INTERNAL_URL` | No | None | Optional internal Go file-server base URL (`http://core:8080` in Docker) for in-memory text upload PUTs |
| `CONESHARE_OAUTH_ENABLED` | No | `false` | Enable OAuth 2.1 Protected Resource metadata (`RFC 9728`) and `401` challenge middleware |
| `SITE_DOMAIN` | Yes (when OAuth enabled) | N/A | Public origin URL of the Coneshare instance (e.g. `https://app.example.com`; required when `CONESHARE_OAUTH_ENABLED=true`) |
| `MCP_TRANSPORT` | No | `streamable-http` | Transport protocol (`streamable-http` or `sse`) |
| `MCP_HOST` | No | `0.0.0.0` | Server binding address |
| `MCP_PORT` | No | `8001` | Server port |
| `MCP_PATH` | No | `/mcp/sse` | SSE stream endpoint path |

---

## Client integration

> Replace `https://app.coneshare.com` with your self-hosted domain (or `http://localhost:8001` for local Docker development).

### 1. Web AI clients (ChatGPT, Google Gemini, Claude.ai, Grok)
Add a custom MCP connector pointing to the remote MCP URL (no API key is needed when OAuth 2.1 is enabled):

```text
https://app.coneshare.com/mcp/sse
```

Sign in to Coneshare in the browser prompt and approve `read` or `write` permissions.

### 2. Claude Desktop, Cursor, and VS Code
Add this block to `~/Library/Application Support/Claude/claude_desktop_config.json`, `.cursor/mcp.json`, or `.vscode/mcp.json`:

```json
{
  "mcpServers": {
    "coneshare": {
      "url": "https://app.coneshare.com/mcp/sse",
      "headers": {
        "Authorization": "Bearer cs_live_YOUR_API_KEY_HERE"
      }
    }
  }
}
```

### 3. Claude Code CLI
```bash
claude mcp add --transport sse coneshare https://app.coneshare.com/mcp/sse \
  --header "Authorization: Bearer cs_live_YOUR_API_KEY_HERE"
```

### 4. Antigravity CLI (`agy`)
```bash
export CONESHARE_API_KEY="cs_live_1234567890abcdef"
agy mcp add coneshare --url http://localhost:8001/mcp/sse --bearer-token-env-var CONESHARE_API_KEY
```

### 5. Codex CLI
```bash
export CONESHARE_API_KEY="cs_live_1234567890abcdef"
codex mcp add coneshare --url http://localhost:8001/mcp/sse --bearer-token-env-var CONESHARE_API_KEY
```

---

## Agent skill integration (`coneshare-it`)

The [`coneshare-it`](https://github.com/coneshare/coneshare/blob/main/.agent/skills/coneshare-it/SKILL.md) skill adds preset workflows, defaults, streaming file uploads, and dataroom sharing rules for Claude Code, Codex, and Antigravity (`agy`).

### Quick skill installation

You can install `coneshare-it` for a single workspace or globally on your machine.

#### Workspace installation (current repository only)
```bash
# Works across Antigravity, Claude Code, and Codex
mkdir -p .agent/skills/coneshare-it
curl -sSL https://raw.githubusercontent.com/coneshare/coneshare/main/.agent/skills/coneshare-it/SKILL.md -o .agent/skills/coneshare-it/SKILL.md
```

#### Global installation (all local workspaces)
```bash
# Antigravity CLI (agy)
mkdir -p ~/.gemini/config/skills/coneshare-it
curl -sSL https://raw.githubusercontent.com/coneshare/coneshare/main/.agent/skills/coneshare-it/SKILL.md -o ~/.gemini/config/skills/coneshare-it/SKILL.md

# Claude Code CLI
mkdir -p ~/.claude/skills/coneshare-it
curl -sSL https://raw.githubusercontent.com/coneshare/coneshare/main/.agent/skills/coneshare-it/SKILL.md -o ~/.claude/skills/coneshare-it/SKILL.md
```

---

## Available tools (29 tools)

### Documents and folders (12 tools)
* `list_documents`: Paginated list of workspace documents with folder filtering.
* `get_document`: Retrieve detailed document metadata, versions, and active links.
* `search_documents`: Search workspace documents by filename or description query with pagination.
* `create_text_document`: Create a Markdown, CSV, or plain text document directly from in-memory text (defaults to `.md`, ensures folders along `path`, no external PUT required).
* `update_document`: Rename or update description metadata of an existing document.
* `delete_document`: `[DESTRUCTIVE]` Soft-delete a document (moves to Trash).
* `create_folder`: Create a new folder in your workspace documents hierarchy.
* `update_folder`: Rename an existing workspace folder.
* `delete_folder`: `[DESTRUCTIVE]` Soft-delete a workspace folder.
* `move_items`: Move documents and/or subfolders into a destination workspace folder.
* `request_document_upload`: Request a pre-signed URL to upload documents/datasets directly to storage.
* `finalize_document_upload`: Finalize document creation after streaming file content to pre-signed upload URL.

### Datarooms (8 tools)
* `list_datarooms`: List accessible datarooms with pagination and optional `name` substring filter.
* `get_dataroom`: Retrieve dataroom hierarchy, settings, and items.
* `search_dataroom_content`: Search folders and documents across all subfolders inside a specific dataroom.
* `create_dataroom`: Create a new dataroom to group and share documents.
* `add_content_to_dataroom`: Attach workspace documents to an existing dataroom.
* `remove_content_from_dataroom`: Remove workspace documents from an existing dataroom.
* `update_dataroom`: Update metadata (name, description) for an existing dataroom.
* `delete_dataroom`: `[DESTRUCTIVE]` Delete a dataroom.

### Share links (3 tools)
* `list_share_links`: List active share links, filterable by document or dataroom.
* `create_share_link`: Create a share link with NDA text, custom watermark text, email verification, password, and download controls.
* `update_share_link`: Modify security settings, watermark/NDA text, email controls, or toggle link active status.

### Analytics (3 tools)
* `get_document_analytics`: Fetch view counts, durations, and viewer statistics for a document.
* `list_view_sessions`: List viewer session summaries filterable by document, link, dataroom, or email.
* `get_view_session`: Retrieve detailed session breakdown (page view durations, video logs, link clicks).

### Admin (3 tools)
* `list_admin_users`: `[ADMIN ONLY]` List organization users with pagination and search.
* `get_admin_user_details`: `[ADMIN ONLY]` Detailed user profile, link count, and views.
* `list_login_activities`: `[ADMIN ONLY]` Organization login logs (IP, user agent, timestamp).
