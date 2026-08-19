# Remote MCP Server (`coneshare-mcp`)

## Strategy refs
- [API Keys & Permission Logic](./api-keys-and-permissions.md)
- [Skill Development & Distribution Workflow Strategy](../strategy/skill-development-workflow.md)
- [Remote MCP Server Plan](../../plans/remote_mcp_server_plan.md)

## Out of scope
- Local Stdio transport mode (`MCP_TRANSPORT=stdio` is deprecated in production; server exclusively uses network HTTP/SSE streamable transport).
- Server-side master API key (`CONESHARE_API_KEY` is not set on the server; authentication is strictly per-user).
- Direct local filesystem path scanning (Document uploads are supported via pre-signed URL tools: request_document_upload, finalize_document_upload).

## Design decisions
- Decision: Exclusive Remote HTTP/SSE Transport (`streamable-http` at path `/mcp/sse`).
  Rationale: Enables zero-installation integration for AI desktop and CLI tools (Claude Desktop, Claude Code, Antigravity CLI `agy`, Codex) over network streams.
  Tradeoff: Requires HTTP network access to port `8001` or Nginx reverse proxy.
- Decision: Header-driven, per-user API key authentication (`Authorization: Bearer cs_live_...`).
  Rationale: Eliminates server-side master token storage and key leak risks. Every tool request executes strictly within the permissions of the user's API key tier (`read_only`, `read_write`, `full_access`).
  Tradeoff: AI client configurations must pass the `Authorization: Bearer cs_live_...` HTTP header on every connection.
- Decision: Token-efficient view session analytics (`list_view_sessions` summaries vs `get_view_session` detail breakdown).
  Rationale: Returning large `page_views` and video event arrays on list endpoints wastes LLM context tokens. `list_view_sessions` returns lightweight metadata summaries, while `get_view_session` provides the granular page-by-page timeline.
  Tradeoff: AI agents requiring deep page-level engagement analysis must call `get_view_session` for specific session IDs.
- Decision: Direct chunked pre-signed uploads for remote filesystem isolation.
  Rationale: Remote containers cannot read files directly from user host disks. The two-stage `request_document_upload` and `finalize_document_upload` pattern streams files safely directly to object storage.
  Tradeoff: Agent tool execution requires two sequential tool steps for file ingestion.

---

## ⚠️ Gotchas & System Constraints

1. **Docker Container Network Binding (`0.0.0.0`)**:
   - FastMCP inside Docker Compose MUST bind to `0.0.0.0` (`MCP_HOST=0.0.0.0`). Binding to `127.0.0.1` inside the container causes Docker bridge network forwarding and Nginx proxy requests to fail with `Connection refused`.
2. **Nginx SSE Proxy Buffering (`proxy_buffering off;`)**:
   - In production Nginx reverse proxies, `proxy_buffering off;` and `proxy_read_timeout 86400s;` are **mandatory**. If proxy buffering is enabled, Nginx buffers FastMCP event stream chunks in memory instead of flushing them instantly to the client, causing tool call timeouts.
3. **Stateless Request Context Extraction**:
   - `ConeshareClient.from_ctx(ctx)` extracts the `Authorization: Bearer cs_live_...` header directly from the incoming HTTP request context (`ctx.request_context.request.headers`). If no valid Bearer header is passed, tool calls immediately return HTTP 401 Unauthorized errors.
4. **DRF 401 Challenge Retention**:
   - Backend `APIKeyAuthentication` explicitly returns `'Bearer realm="api"'` via `authenticate_header()`. This prevents Django Rest Framework from coercing unauthenticated API key attempts into HTTP 403 Forbidden.
5. **Remote Filesystem Isolation**:
   - Remote MCP servers running in Docker containers cannot read local files directly from the user's laptop disk (`/Users/...`). Document uploads are supported via pre-signed URL flows (`request_document_upload` / `finalize_document_upload`).

---

## 1. Architectural Overview

The **Coneshare MCP Server** (`coneshare-mcp`) is a standalone Python service running alongside the Coneshare Docker stack. It translates incoming Model Context Protocol (MCP) tool calls into authenticated REST API calls against the Django backend.

```text
+-----------------------------------------------------------------------------------+
|                            USER'S MACHINE / AI CLIENT                             |
|                                                                                   |
|  +---------------------------------+                                              |
|  |   AI Client                     |                                              |
|  |   (Claude Desktop / Code /      |                                              |
|  |    Cursor / Codex / VS Code)    |                                              |
|  +---------------------------------+                                              |
|                  |                                                                |
|                  | (HTTPS / SSE Remote MCP Protocol)                              |
|                  | Header: Authorization: Bearer cs_live_...                      |
|                  v                                                                |
+------------------|----------------------------------------------------------------+
                   |
+------------------|----------------------------------------------------------------+
|                  v        CONESHARE HOSTED / DOCKER STACK                         |
|  +---------------------------------+               +---------------------------+  |
|  |   coneshare-mcp                 |   (HTTP REST  |   Coneshare Backend       |  |
|  |   (Remote SSE Endpoint :8001)   |-------------->|   http://backend:8000/api/v1  |  |
|  +---------------------------------+               +---------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 2. Environment Configuration

The service is configured via environment variables in [docker-compose.yml](../../docker-compose.yml) and [.env.template](../../.env.template):

| Variable | Required | Default | Description |
|---|---|---|---|
| `CONESHARE_API_URL` | ✅ | N/A | Target Coneshare REST API base URL (required at startup) |
| `MCP_TRANSPORT` | ❌ | `streamable-http` | Transport protocol (`streamable-http`, `http`, or `sse`) |
| `MCP_HOST` | ❌ | `0.0.0.0` | Container network bind address (`0.0.0.0` for Docker) |
| `MCP_PATH` | ❌ | `/mcp/sse` | HTTP SSE endpoint path |
| `MCP_PORT` | ❌ | `8001` | Server listening port |
| `LOG_LEVEL` | ❌ | `INFO` | Logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |

---

## 3. Tool Catalog (27 Tools)

### 📁 Documents & Folders (11 tools)
* `list_documents`: Paginated list of workspace documents with folder filtering.
* `get_document`: Retrieve detailed document metadata, versions, and active links.
* `search_documents`: Search documents by full-text title or description query.
* `update_document`: Rename or update description metadata of an existing document.
* `delete_document`: `[DESTRUCTIVE]` Soft-delete a document (moves to Trash, recoverable via web UI).
* `create_folder`: Create a new folder in your workspace documents hierarchy.
* `update_folder`: Rename an existing workspace folder.
* `delete_folder`: `[DESTRUCTIVE]` Soft-delete a workspace folder.
* `move_items`: Move documents and/or subfolders into a destination workspace folder.
* `request_document_upload`: Request a pre-signed URL to upload documents/datasets directly to storage (supports optional destination `path`).
* `finalize_document_upload`: Finalize document creation after streaming file content to pre-signed upload URL.

### 🏛️ Datarooms (7 tools)
* `list_datarooms`: List organization datarooms with pagination metadata.
* `get_dataroom`: Retrieve dataroom hierarchy, settings, and items.
* `create_dataroom`: Create a new dataroom to group and share multiple workspace documents.
* `add_content_to_dataroom`: Attach workspace documents to an existing dataroom.
* `remove_content_from_dataroom`: Remove workspace documents from an existing dataroom.
* `update_dataroom`: Update metadata (name, description) for an existing dataroom.
* `delete_dataroom`: `[DESTRUCTIVE]` Soft-delete a dataroom.

### 🔗 Share Links (3 tools)
* `list_share_links`: List active share links filterable by document or dataroom.
* `create_share_link`: Create a share link with NDA gate, custom agreement body (`nda_text`), dynamic watermark (`watermark_text`), download controls (`allow_download`), OTP email verification (`requires_email_verification`), email gating (`requires_email`), owner view notifications (`receive_email_notification`), password, and expiration.
* `update_share_link`: Modify security settings, custom texts, expiration, or toggle link active status (`is_active`).

### 📊 Analytics (3 tools)
* `get_document_analytics`: Overall page view durations, total viewers, and engagement statistics.
* `list_view_sessions`: List viewer sessions with summary metadata (viewer email, location, total duration, completion rate).
* `get_view_session`: Retrieve detailed session breakdown including page-by-page view durations, video engagement logs, and link clicks.

### 👑 Admin (3 tools)
* `list_admin_users`: `[ADMIN ONLY]` List organization users with pagination and search filter.
* `get_admin_user_details`: `[ADMIN ONLY]` Detailed user profile, created links, datarooms count, and total views.
* `list_login_activities`: `[ADMIN ONLY]` Organization user login activity logs (IP, user agent, timestamp).

---

## 4. Production Client & Nginx Configuration

### Nginx Reverse Proxy (`/etc/nginx/sites-available/app.coneshare.com`)

```nginx
server {
    listen 443 ssl http2;
    server_name app.coneshare.com;

    ssl_certificate     /etc/letsencrypt/live/app.coneshare.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.coneshare.com/privkey.pem;

    location /mcp/sse {
        proxy_pass http://mcp_server:8001/mcp/sse;

        # Mandatory SSE Directives:
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Chunked_Transfer_Encoding off;
        proxy_buffering off;
        proxy_cache off;

        # Keep long-lived SSE streams active
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;

        # Forward headers and Bearer token
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
    }
}
```

### Client Integration Examples

#### 1. Claude Desktop (`claude_desktop_config.json`)

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

#### 2. Claude Code CLI

```bash
claude mcp add --transport sse coneshare https://app.coneshare.com/mcp/sse --header "Authorization: Bearer cs_live_YOUR_API_KEY_HERE"
```

#### 3. Antigravity CLI (`agy`) & Other JSON-configured AI Clients

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

---

## 5. Error Handling & Agent Control Flow Strategy

### Error Response Contract
All MCP tools catch server, network, and validation errors gracefully, returning structured JSON error objects:
```json
{
  "error": true,
  "status": 500,
  "detail": "Failed to finalize document processing: Storage key not found"
}
```

### Agent Control Flow & Circuit Breaker Rules
To prevent AI agents from executing orphaned downstream tool calls after an error:

1. **Stop-on-Error**: When a tool response contains `"error": true` or `"isError": true`, the AI client runner MUST halt multi-step tool execution immediately.
2. **No Orphaned Downstream Calls**: Downstream tools (such as `create_share_link`) MUST NOT be called if an upstream prerequisite step (such as `finalize_document_upload`) failed.
3. **Defensive Auto-Deduplication**: Backend endpoints (e.g. `create_document_from_upload`) defensively deduplicate filenames (e.g. `README_zh.md` -> `README_zh (1).md`) to prevent database unique constraint crashes.
