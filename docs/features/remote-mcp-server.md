# Remote MCP Server (`coneshare-mcp`)

## Strategy refs
- [API Keys & Permission Logic](./api-keys-and-permissions.md)
- [Skill Development & Distribution Workflow Strategy](../strategy/skill-development-workflow.md)
- [Remote MCP Server Plan](../../plans/mcp/remote_mcp_server_plan.md)

## Out of scope
- Local Stdio transport mode (`MCP_TRANSPORT=stdio` is deprecated in production; server exclusively uses network HTTP/SSE streamable transport).
- Server-side master API key (`CONESHARE_API_KEY` is not set on the server; authentication is strictly per-user).
- Direct local filesystem path scanning (Document uploads are supported via pre-signed URL tools: request_document_upload, finalize_document_upload).

## Design decisions
- Decision: Exclusive Remote HTTP/SSE Transport (`streamable-http` at path `/mcp/sse`).
  Rationale: Enables zero-installation integration for AI desktop and CLI tools (Claude Desktop, Claude Code, Antigravity CLI `agy`, Codex) over network streams.
  Tradeoff: Requires HTTP network access to port `8001` or Nginx reverse proxy.
- Decision: Header-driven, per-user authentication (`OAuth 2.1 PKCE` + `Authorization: Bearer cs_live_...` API keys).
  Rationale: Eliminates server-side master token storage and key leak risks. Web AI clients (Gemini Custom Apps, Claude.ai, ChatGPT) discover OAuth 2.1 via RFC 9728 / RFC 8414 / RFC 7591 and authenticate via PKCE (`S256`) with scoped permissions (`read`, `write`), while CLI/desktop clients continue using static API key tiers (`read_only`, `read_write`, `full_access`).
  Tradeoff: Unauthenticated `/mcp/sse` requests return `HTTP 401` with a `WWW-Authenticate: Bearer resource_metadata=...` challenge, and host Nginx must route `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server` appropriately.
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
| `CONESHARE_FILESERVER_INTERNAL_URL` | ❌ | None | Optional internal file-server base URL (`http://core:8080` in Docker) for `create_text_document` upload PUTs |
| `CONESHARE_OAUTH_ENABLED` | ❌ | `false` | Enable OAuth 2.1 server endpoints and FastMCP `RemoteAuthProvider` (`401` + `RFC 9728` metadata; accepts both OAuth 2.1 tokens and `cs_live_...` keys) |
| `SITE_DOMAIN` | ✅ (when OAuth enabled) | N/A | Public origin URL of the Coneshare instance (e.g. `https://app.coneshare.com`; required when `CONESHARE_OAUTH_ENABLED=true`) |
| `OAUTH_ALLOWED_CLIENT_DOMAINS` | ❌ | `.chatgpt.com,.openai.com,.claude.ai,.google.com,.googleusercontent.com,.grok.com,.x.ai` | Comma-separated trusted client domain allowlist for OAuth 2.1 DCR redirect URIs |
| `OAUTH_ALLOW_LOCALHOST_LOOPBACK` | ❌ | `false` | Allow `http://localhost:<port>` loopback redirect URIs for local/CLI OAuth testing |
| `MCP_TRANSPORT` | ❌ | `streamable-http` | Transport protocol (`streamable-http`, `http`, or `sse`) |
| `MCP_HOST` | ❌ | `0.0.0.0` | Container network bind address (`0.0.0.0` for Docker) |
| `MCP_PATH` | ❌ | `/mcp/sse` | HTTP SSE endpoint path |
| `MCP_PORT` | ❌ | `8001` | Server listening port |
| `LOG_LEVEL` | ❌ | `INFO` | Logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |

---

## 2.1 OAuth 2.1 + PKCE + DCR Architecture & Interoperability Notes

When `CONESHARE_OAUTH_ENABLED=true`, both the Django backend and `coneshare-mcp` enable OAuth 2.1 Authorization Code + PKCE (`S256`) alongside `cs_live_...` API keys.

### Web AI Clients vs. CLI / Desktop Clients

| Dimension | Web AI Clients (Gemini, ChatGPT, Claude.ai, Grok) | CLI / Desktop Clients (Claude Code, `agy`, Codex, Claude Desktop) |
| :--- | :--- | :--- |
| **Credential Type** | OAuth 2.1 Access + Refresh Tokens (`Bearer <oauth_token>`) | Static Per-User API Key (`Bearer cs_live_...`) or Loopback OAuth |
| **Requires `CONESHARE_OAUTH_ENABLED=true`?** | ✅ **Yes** (relies on RFC 9728 / RFC 8414 discovery + DCR + `/oauth/authorize`) | ❌ **No** for `cs_live_...` API keys (works regardless of `CONESHARE_OAUTH_ENABLED`) |
| **Onboarding Flow** | Zero-key browser redirect: `401` challenge -> Discovery -> DCR -> `/oauth/authorize` consent screen -> PKCE token exchange | User creates `cs_live_...` key in **Settings > API Keys** and sets `Authorization: Bearer cs_live_...` in local config |
| **Callback / Redirect URI** | Hosted HTTPS callback allowlisted via `OAUTH_ALLOWED_CLIENT_DOMAINS` (`.chatgpt.com`, `.claude.ai`, `.google.com`, `.googleusercontent.com`, etc.) | N/A for `cs_live_...` API keys (or `http://localhost:<port>` when `OAUTH_ALLOW_LOCALHOST_LOOPBACK=true`) |
| **Permission Enforcement** | `OAuth2ScopePermission` (`read`, `write`; `DELETE` and `@require_full_access` blocked) | `APIKeyTierPermission` (`read_only`, `read_write`, `full_access`) |

### OAuth 2.1 + PKCE Sequence Diagram (Web AI Client vs. CLI Client)

```mermaid
sequenceDiagram
    autonumber
    actor User as User (Browser / CLI)
    participant WebAI as Web AI Client (Gemini / ChatGPT / Claude.ai)
    participant CLI as CLI / Desktop Client (Claude Code / agy / Codex)
    participant MCP as coneshare-mcp (:8001 /mcp/sse)
    participant SPA as ConeShare SPA (/oauth/authorize)
    participant Django as ConeShare Django Backend (OAuth 2.1 AS & REST API)

    rect rgb(240, 246, 255)
    Note over User,Django: Path A: Web AI Client (OAuth 2.1 + PKCE + DCR, requires CONESHARE_OAUTH_ENABLED=true)
    WebAI->>MCP: POST / HEAD /mcp/sse (no token)
    MCP-->>WebAI: 401 Unauthorized (WWW-Authenticate resource_metadata)
    WebAI->>MCP: GET /.well-known/oauth-protected-resource/mcp/sse (RFC 9728)
    MCP-->>WebAI: 200 { resource, authorization_servers: ["https://SITE_DOMAIN/"], scopes_supported: ["read","write"] }
    WebAI->>Django: GET /.well-known/oauth-authorization-server (RFC 8414)
    Django-->>WebAI: 200 { issuer: "https://SITE_DOMAIN/", authorization_endpoint, token_endpoint, registration_endpoint }
    WebAI->>Django: POST /api/v1/oauth/register/ (RFC 7591 DCR, allowlisted redirect_uris)
    Django-->>WebAI: 201 { client_id, client_secret, client_secret_expires_at: 0, token_endpoint_auth_method }
    WebAI->>User: Open browser popup to /oauth/authorize?client_id=...&code_challenge=...&code_challenge_method=S256
    User->>SPA: Load /oauth/authorize (authenticated via ConeShare JWT)
    SPA->>Django: GET /api/v1/oauth/consent/ (validate client_id, redirect_uri, PKCE S256)
    Django-->>SPA: 200 { application_name, scopes: ["read", "write"] }
    User->>SPA: Select scopes & click Authorize
    SPA->>Django: POST /api/v1/oauth/consent/ { allow: true, scopes }
    Django-->>SPA: 200 { redirect_url: "https://client-callback?code=...&state=..." }
    SPA-->>WebAI: Browser redirect with authorization code
    WebAI->>Django: POST /api/v1/oauth/token/ (code + code_verifier)
    Django-->>WebAI: 200 { access_token, refresh_token, scope: "read write" }
    WebAI->>MCP: POST /mcp/sse (Authorization: Bearer oauth_access_token)
    MCP->>Django: GET /api/v1/oauth/verify/ (cached 30s by SHA-256 digest)
    Django-->>MCP: 200 { active: true, auth_type: "oauth2", scopes: ["read", "write"] }
    MCP->>Django: REST API call (Authorization: Bearer oauth_access_token)
    Django-->>MCP: 200 JSON (enforced by OAuth2ScopePermission)
    MCP-->>WebAI: MCP Tool Result
    end

    rect rgb(242, 250, 245)
    Note over User,Django: Path B: CLI / Desktop Client (Static API Key cs_live_..., works with or without OAuth enabled)
    User->>CLI: Configure Authorization: Bearer cs_live_...
    CLI->>MCP: POST /mcp/sse (Authorization: Bearer cs_live_...)
    opt When CONESHARE_OAUTH_ENABLED=true
        MCP->>Django: GET /api/v1/oauth/verify/ (cached 30s by SHA-256 digest)
        Django-->>MCP: 200 { active: true, auth_type: "api_key", scopes: ["read", "write"] }
    end
    MCP->>Django: REST API call (Authorization: Bearer cs_live_...)
    Django-->>MCP: 200 JSON (enforced by APIKeyTierPermission: read_only / read_write / full_access)
    MCP-->>CLI: MCP Tool Result
    end
```

### End-to-End Discovery & Authorization Flow
1. **Challenge (`401 Unauthorized`)**: Unauthenticated requests to `/mcp/sse` receive `WWW-Authenticate: Bearer resource_metadata="<SITE_DOMAIN>/.well-known/oauth-protected-resource/mcp/sse"`.
2. **RFC 9728 Protected Resource Metadata**: `coneshare-mcp` serves `/.well-known/oauth-protected-resource/mcp/sse` (and `/.well-known/oauth-protected-resource`), advertising `authorization_servers: ["<SITE_DOMAIN>/"]` and `scopes_supported: ["read", "write"]`.
3. **RFC 8414 Authorization Server Metadata**: Django serves `/.well-known/oauth-authorization-server`, advertising `"issuer": "<SITE_DOMAIN>/"`, `"authorization_endpoint": "<SITE_DOMAIN>/oauth/authorize"`, `"token_endpoint": "<SITE_DOMAIN>/api/v1/oauth/token/"`, and `"registration_endpoint": "<SITE_DOMAIN>/api/v1/oauth/register/"`.
4. **RFC 7591 Dynamic Client Registration (DCR)**: Web AI connectors register at `POST /api/v1/oauth/register/` (rate-limited to `20/hour` via `oauth_dcr` throttle scope, with `redirect_uris` restricted to `OAUTH_ALLOWED_CLIENT_DOMAINS`).
5. **Interactive Consent UI (`/oauth/authorize`)**: Authenticated ConeShare users review the requesting application and approve `read` / `write` scopes via `/api/v1/oauth/consent/` (protected strictly by interactive `JWTAuthentication`).
6. **Token Verification & Scope Enforcement**:
   - `coneshare-mcp` verifies Bearer tokens via `GET /api/v1/oauth/verify/` with a 30-second SHA-256-keyed TTL cache.
   - `OAuth2ScopePermission` enforces `read` (`SAFE_METHODS`) and `write` (`POST`, `PUT`, `PATCH`), while blocking `DELETE`, `@require_full_access` actions, `trash`, `api-key`, `admin`, and viewer/session PII telemetry (`analytics.*`, `viewer`, `viewsession`, `view_sessions`) until dedicated scopes are introduced.

### Real-World Web AI Client Interoperability Gotchas
- **Trailing Slash on `OAUTH_ISSUER`**: FastMCP / MCP SDK's `ProtectedResourceMetadata` serializes `authorization_servers` via Pydantic `AnyHttpUrl`, which appends a trailing `/` to bare origins (`"https://app.coneshare.com/"`). Django's `OAUTH_ISSUER` (`OIDC_ISS_ENDPOINT`) intentionally includes this trailing `/` (`f"{SITE_DOMAIN.rstrip('/')}/"`) so RFC 9728 `authorization_servers[0]` and RFC 8414 `issuer` match byte-for-byte.
- **Google Gemini Custom Apps (`OpenAuth`)**:
  - Registers redirect URIs under `*.googleusercontent.com` (e.g. `https://oauth-redirect.googleusercontent.com/r/...`), so both `.google.com` and `.googleusercontent.com` must be present in `OAUTH_ALLOWED_CLIENT_DOMAINS`.
- **ChatGPT Connectors (`CIMD` vs `DCR`)**:
  - When `client_id_metadata_document_supported: true` is advertised, ChatGPT prefers CIMD (`client_id=https://chatgpt.com/oauth/.../client.json`) whose document declares `"token_endpoint_auth_method": "private_key_jwt"`. Because `django-oauth-toolkit` 3.4 only supports `"none"` for CIMD clients, `CIMD_ENABLED` is kept `False` so ChatGPT and all other web AI clients consistently use RFC 7591 DCR.

---

## 3. Tool Catalog & Per-Request Toolsets

The canonical MCP tool inventory (35 tools covering **Documents & Folders**, **Datarooms**, **Share Links**, **Analytics**, and **Admin** tools; `default`: 32 tools, slim `core`: 24 tools, opt-in `admin`: 3 tools) is maintained in a single source of truth:

- **Available Tools & Toolset Presets (`?toolsets=` / `X-Coneshare-Toolsets`):** See the `Toolsets & Filtering` and `Available tools` sections in [mcp-server/README.md](../../mcp-server/README.md)
- **Tool Definitions & Middleware:** [mcp-server/coneshare_mcp/tools/](../../mcp-server/coneshare_mcp/tools/) and [mcp-server/coneshare_mcp/toolsets.py](../../mcp-server/coneshare_mcp/toolsets.py)
- **Per-Request Filtering:** `ToolsetFilterMiddleware` excludes `admin` by default, honors `?toolsets=core` / `?toolsets=admin` (on the default `streamable-http` transport) or `X-Coneshare-Toolsets` header (required for legacy `MCP_TRANSPORT=sse`, since SSE `/messages/?session_id=...` POSTs do not retain connect-URL query params), and hides unauthorized tools (`admin`, `destructive`, and `viewer_analytics` for `oauth2`; `write` / `destructive` for `read`-only tokens) in `tools/list` while failing closed in `tools/call`.
- **Pre-Release OAuth Query Verification Note:** `django-oauth-toolkit`'s `validate_resource_as_url_prefix` and local `TestClient` OAuth mocks pass when `?toolsets=core` is appended to `/mcp/sse`, **but end-to-end RFC 8707 `resource` indicator matching with `?toolsets=core` has not yet been tested against live web AI clients (ChatGPT, Claude.ai, Gemini)**. Verify against live connectors prior to release and record the outcome here.

---

## 4. Production Client & Nginx Configuration

### Nginx Reverse Proxy (`/etc/nginx/sites-available/app.coneshare.com`)

Add the MCP OAuth discovery and SSE locations to your existing ConeShare `server` block (preserving your existing `/.well-known/oauth-authorization-server`, `/api/`, and `/` application routes):

```nginx
server {
    listen 443 ssl http2;
    server_name app.coneshare.com;

    ssl_certificate     /etc/letsencrypt/live/app.coneshare.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.coneshare.com/privkey.pem;

    location /.well-known/oauth-authorization-server {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /.well-known/oauth-protected-resource {
        proxy_pass http://mcp_server:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

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

    # Existing ConeShare application routes (/api/, /oauth/authorize, SPA root /)
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://frontend:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
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
