# MCP Major-Version Cleanup: Naming, Self-Teaching Responses, Toolsets & Instructions Plan

**Date:** 2026-11-28  
**Status:** Planned (Major Version Release)  
**Scope:**
- `mcp-server/` (`pyproject.toml`, `coneshare_mcp/server.py`, `coneshare_mcp/toolsets.py` *(new)*, `coneshare_mcp/client.py`, `coneshare_mcp/tools/*.py`, `mcp-server/README.md`, `mcp-server/tests/`)
- `.agent/skills/coneshare-it/SKILL.md` (`v2.0.0`)
- `portal/lib/agentsData.js`, `portal/src/tests/agents.test.jsx`
- `docs/features/remote-mcp-server.md`, `backend/tests/test_mcp_contracts.py` *(comments/docstrings only — **zero backend production code changes**)*

**Goal:** Combine the upcoming major release with a clean breaking-change upgrade across MCP tools, Skill, and Portal: eliminate tool/parameter naming ambiguities, optimize docstrings for BM25 Top-5 retrieval without keyword pollution, move `admin` tools out of the default catalog via per-request `?toolsets=` / `X-Coneshare-Toolsets` + auth-aware pruning, add self-teaching tool responses/errors for Web AI clients that do not load `SKILL.md` or `instructions`, and add concise server `instructions`.

---

## 1. Motivation & Design Principles

1. **Tool budget & multi-MCP pressure:** All 34 existing tools are exposed unconditionally, crowding clients with ~40-tool global caps (e.g., Cursor) and allowing low-frequency `[ADMIN ONLY]` tools (`list_admin_users`, `get_admin_user_details`) to rank into Top 3–6 on everyday queries like `"search documents"` or `"share links"`.
2. **Permission mismatch in `tools/list`:** Under OAuth 2.1 (`CONESHARE_OAUTH_ENABLED=true`), `ConeshareTokenVerifier` already resolves `AccessToken.scopes` and `AccessToken.claims["auth_type"]`, yet `tools/list` still exposes `delete_*`, `remove_content_from_dataroom`, `admin`, and `analytics.views` session-PII tools (`list_view_sessions`, `get_view_session`) to `oauth2` tokens (which all fail with HTTP 403), and exposes write tools to `read`-only keys. *(Note: because backend `API_KEY_TIER_SCOPES` maps both `read_write` and `full_access` API keys to `['read', 'write']`, distinguishing `read_write` from `full_access` requires exposing `tier` in `/oauth/verify/` and remains deferred to follow-up work.)*
3. **Semantic distractors & BM25 keyword overlap:**
   - Generic names (`get_document`, `update_document`) force long cross-reference warnings in docstrings (`"To replace file content ... use update_text_document (for text/Markdown)"`), creating keyword overlap with `update_text_document` / `read_text_document` / `get_document_download_url` and diluting Top-5 BM25 retrieval (observed in local ad-hoc checks where unrelated tools mentioning `"share"`/`"link"` or `"markdown"` competed closely with `list_share_links` and `update_text_document`).
   - `remove_content_from_dataroom` exposes `document_ids` / `folder_ids` while sending `dataroom_document_ids` / `dataroom_folder_ids` underneath, risking ID confusion with workspace items.
   - Missing `list_folders` leaves agents unable to discover workspace `folder_id` values directly.
4. **Web AI reality (`instructions` & `SKILL.md` are optional hints):**
   - Ordinary Web AI clients (ChatGPT, Claude.ai, Gemini) do **not** install `SKILL.md`, and hosts are free to ignore or truncate MCP `instructions`.
   - **Reliability invariant:** Only **tool names + schemas/docstrings**, **tool responses**, and **error messages** are guaranteed to reach the model across every client. Critical guardrails must live in those three places first; `instructions` and `SKILL.md` serve as additive workflow layers.

---

## 2. Major-Version Changes

### 2.1 Tool & Parameter Renaming + Missing `list_folders`

Keep `ConeshareClient` Python SDK method names backwards-compatible where practical (using `@mcp.tool(name=...)` or thin wrappers) to avoid unnecessary SDK test churn, while making the LLM-facing MCP contract unambiguous:

1. **Rename ambiguous tools:**
   - `get_document` -> **`get_document_metadata`**
   - `update_document` -> **`update_document_metadata`**
2. **Clarify `remove_content_from_dataroom` parameters (`tools/datarooms.py`):**
   - Rename tool parameters from `document_ids` / `folder_ids` to **`dataroom_document_ids`** / **`dataroom_folder_ids`** (`ConeshareClient.remove_content_from_dataroom` already accepts these exact kwargs).
   - Document explicitly that these ULIDs come from `get_dataroom` or `search_dataroom_content` (not workspace folder/document listings).
3. **Add `list_folders` (`tools/documents.py` + `client.py`):**
   - Expose `list_folders(parent_folder_id: Optional[str] = None)` wrapping `GET /folders/` and `GET /folders/{parent_folder_id}/` (already used internally by `_find_subfolder_id`), tagged `folders` + `read`.
4. **Add "Produced by ..." origin hints to every ID parameter:**
   - `document_id`: `"Workspace document ULID (from list_documents, search_documents, or create_text_document)"`
   - `folder_id` / `parent_folder_id` / `destination_folder_id`: `"Workspace folder ULID (from list_folders or create_folder)"`
   - `dataroom_id`: `"Dataroom ULID (from list_datarooms or create_dataroom)"`
   - `share_link_id`: `"Share link ULID (from list_share_links or get_document_metadata['share_links'])"`
   - `session_id`: `"View session ULID (from list_view_sessions)"`
5. **Pre-flight parameter guard on `create_share_link` (`tools/share_links.py`):**
   - Reject missing or mutually-present `document_id` / `dataroom_id` upfront with an actionable error pointing to `list_documents`/`search_documents` or `list_datarooms`.

### 2.2 BM25-Clean Docstrings + Self-Teaching Responses & Errors

1. **Docstring hygiene (negative boundaries without competitor keyword stuffing):**
   - Remove multi-line cross-references that repeat other tools' format/action keywords (`markdown`, `upload`, `version`, `update_text_document`) inside unrelated tools.
   - Replace with crisp **self-scoped negative boundaries**:
     - `update_document_metadata`: `"Rename a document or edit its description metadata only. Does NOT modify file content or create a new version."`
     - `get_document_metadata`: `"Metadata only: retrieve document properties, versions, and active share links. Does NOT return file text or download URLs."`
   - Ensure `list_share_links` includes both `"share link"` and `"share links"` in its summary so singular/plural BM25 queries keep it inside Top 5.
   - Where helpful for multi-MCP disambiguation, mention `"Coneshare workspace"` cleanly in tool summaries without inflating token length.
2. **Self-teaching tool responses (`coneshare_mcp/client.py` or tool layer):**
   - **`get_document_metadata`**: Attach a compact `next_step_hint` derived from file extension / `type` / `file_size`:
     - Readable text (`<= 2 MiB`): `"Call read_text_document(document_id=...) to read the UTF-8 text content."`
     - Binary or oversized (`> 2 MiB`): `"Binary or large file; call get_document_download_url(document_id=...) for a temporary download URL."`
   - **`create_text_document`**: If the returned document `name` differs from the requested clean filename (e.g., backend auto-suffixed `(1)` due to collision), include a concise `note` advising that a separate copy was created and pointing to `update_text_document` for in-place updates.
3. **Actionable API error enrichment (`coneshare_mcp/client.py` / tools):**
   - Enrich common 400/404/order errors with concrete recovery guidance (e.g., `remove_content_from_dataroom` 400/404 -> verify IDs via `get_dataroom`; unsupported watermark type -> link works for PDF/Office/images or datarooms).
   - Align error handling documentation in `SKILL.md` with actual FastMCP tool error behavior.

### 2.3 Declarative Tool Tagging & Per-Request Toolsets (`coneshare_mcp/toolsets.py`)

With `list_folders` added, total registered tools = **35**:

| Tag | Tools | Count |
|---|---|---|
| `core` | Daily non-destructive workspace, dataroom, share-link & analytics tools (outside `folders`, `destructive`, `admin`) | 24 |
| `folders` | `list_folders`, `create_folder`, `update_folder`, `delete_folder`, `move_items` | 5 |
| `destructive` | `delete_document`, `delete_folder`, `delete_dataroom`, `remove_content_from_dataroom` *(all `DELETE` / `@require_full_access` actions blocked for `oauth2` and `read_write` keys)* | 4 |
| `admin` | `list_admin_users`, `get_admin_user_details`, `list_login_activities` | 3 |
| `viewer_analytics` | `list_view_sessions`, `get_view_session` *(PII session telemetry under `analytics.views`, included in `core` for API keys but blocked by backend `OAuth2ScopePermission` under `oauth2`)* | 2 |
| `read` / `write` | Mutability tags (`read_*`, `list_*`, `get_*`, `search_*` -> `read`; mutating tools -> `write`) | 35 |

*(Note: `delete_folder` carries both `folders` and `destructive` (+ `write`), so `folders ∪ destructive` = 8 tools; `default` = `35 - 3 (admin)` = **32 tools**. Both `list_view_sessions` and `get_view_session` remain part of `core` for API-key callers while carrying the `viewer_analytics` capability tag for OAuth pruning.)*

#### Per-Request Selection (`?toolsets=` & `X-Coneshare-Toolsets`)
Verified against **`fastmcp 3.4.11`** (`mcp_server` container): `@mcp.tool(...)` supports `name=` and `tags=set[str]`; `FastMCP.enable()`/`disable()` append server-global `Visibility` transforms (`self._transforms`) and are **not** per-request. Therefore per-request filtering uses **`Middleware` (`on_list_tools` + `on_call_tool`)** in `coneshare_mcp/toolsets.py`:

1. **Transport & context extraction:**
   - Wrap `get_http_request()` in `try ... except Exception:` (matching `ConeshareClient.from_ctx`), falling back to `default` when no HTTP request is active (`stdio` transport or direct `mcp.get_tool(...)` unit tests).
   - Read `?toolsets=` query param first, falling back to `X-Coneshare-Toolsets` header.
   - **Web AI vs CLI/IDE constraint:** Web AI clients (ChatGPT, Claude.ai, Gemini) cannot configure custom HTTP headers—only the MCP URL—so `?toolsets=` is their only opt-in mechanism (specifically `?toolsets=core`, since `admin` is already blocked under `oauth2`). `X-Coneshare-Toolsets` applies to CLI/IDE clients only.
   - **RFC 8707 OAuth risk:** `ConeshareTokenVerifier.resource_url` (`auth.py`) and `OAuthTokenVerifyView` (`oauth_views.py`) validate tokens against the **configured** `SITE_DOMAIN + MCP_PATH` (queryless `/mcp/sse`) via `validate_resource_as_url_prefix`. If a Web AI client consents a token with `resource=".../mcp/sse?toolsets=core"`, `validate_resource_as_url_prefix` will fail with `401 invalid_audience`. End-to-end verification of `?toolsets=` with OAuth 2.1 is mandatory before documenting query-string presets for Web AI (fallback if clients enforce strict URL equality: serve queryless alias routes or normalize queryless resource comparison).
2. **Formal preset & additive parsing rule (deterministic precedence):**
   - Split raw value on `,`, strip whitespace, lowercase, drop empty items.
   - Base presets: `all`, `core`, `default`. Additive tags: `folders`, `destructive`, `admin`.
   - **Unknown tokens:** Ignore unknown tokens with a `logger.warning(...)` so a minor typo does not break `tools/list`.
   - **Single precedence rule:**
     1. Choose base by precedence **`all` > `core` > `default`** (if none of the three is present, base = `default` = `{"core", "folders", "destructive"}`; if `core` wins, base = `{"core"}`; if `all` wins, base = `{"core", "folders", "destructive", "admin"}`).
     2. Union any recognized additive tags (`folders`, `destructive`, `admin`) into the selected base.
     *(Examples: `""` / omitted -> `default` (**32**); `default,core` -> `core` (**24**); `core,folders` -> **28**; `core,folders,destructive` -> **32**; `admin` -> `default + admin` (**35**); `core,admin` -> **27**; `all` -> **35**.)*
3. **Dual enforcement (`on_list_tools` + `on_call_tool`):**
   - `on_list_tools` returns only tools matching `(requested toolsets) ∩ (token permissions)`.
   - `on_call_tool` re-evaluates the target tool (`context.message.name`) and fails closed with an actionable hint (e.g. `"Enable organization admin tools with '?toolsets=admin' or header 'X-Coneshare-Toolsets: admin'."`).

### 2.4 Auth-Aware Automatic Pruning (`auth_type` & `scopes`)

Using FastMCP's `get_access_token()` (active when `CONESHARE_OAUTH_ENABLED=true`):
1. **No `AccessToken`** (`CONESHARE_OAUTH_ENABLED=false` or `stdio`): apply `?toolsets=` / header filtering only.
2. **`"write" not in access_token.scopes`** (matches `read_only` API keys and `read`-only OAuth tokens): hide and block all `write` / `destructive` tools (keep `read` tools only).
3. **`access_token.claims.get("auth_type") == "oauth2"`**: always hide and block `admin`, `destructive` (including `remove_content_from_dataroom`), **and `viewer_analytics` (`list_view_sessions`, `get_view_session`)** even if `?toolsets=all` is passed—matching backend `OAuth2ScopePermission`, which omits `analytics.*` and blocks `requires_full_access`/`DELETE` while keeping aggregate `get_document_analytics` (`/documents/{id}/stats/`) permitted.
4. **Explicit API-key tier limitation:** Because `API_KEY_TIER_SCOPES` maps both `read_write` and `full_access` keys to `['read', 'write']`, `scopes`-based pruning cannot distinguish `read_write` from `full_access` keys. Consequently, `read_write` API keys will still list `destructive` tools (`delete_document`, `delete_folder`, `delete_dataroom`, `remove_content_from_dataroom`) in `tools/list` and receive HTTP 403 from `APIKeyTierPermission` when invoked; hiding those for `read_write` keys is deferred to follow-up work.

### 2.5 Versioning, Server `instructions`, `SKILL.md` (`v2.0.0`), Portal & Docs Sync

1. **`mcp-server/pyproject.toml` & `coneshare_mcp/server.py`**:
   - Bump package version from `0.1.0` (e.g., to `0.2.0` or `1.0.0`) and pass matching `version=` alongside concise `instructions` to `FastMCP("coneshare", instructions=..., version=..., auth=auth_provider)`.
   - `instructions` summarizes workspace vs Dataroom vs ShareLink entities, in-place version updates, and `?toolsets=admin` / `?toolsets=core` opt-in options.
2. **`.agent/skills/coneshare-it/SKILL.md` (`1.0.0` -> `2.0.0`)**:
   - Update all references to `get_document_metadata`, `update_document_metadata`, `remove_content_from_dataroom(dataroom_document_ids=...)`, `list_folders`, and `?toolsets=` presets.
   - Align Section 5 circuit-breaker wording with FastMCP's actual tool error semantics.
3. **`portal/lib/agentsData.js` & `portal/src/tests/agents.test.jsx`**:
   - Update tool names (`get_document_metadata`, `update_document_metadata`, etc.), bring the portal catalog up to date (including `read_text_document`, `get_document_download_url`, `update_text_document`, `request_version_upload`, `finalize_version_upload`, `list_folders`), note optional `?toolsets=admin` and `core` (24) / `default` (32) / `all` (35) counts, align `apiKeyOnly` flags (`get_document_analytics` works under OAuth2 as verified by `test_oauth.py`, whereas `list_view_sessions`, `get_view_session`, `remove_content_from_dataroom`, `delete_*`, and `admin` remain blocked), and update test expectations.
4. **`mcp-server/README.md` & `docs/features/remote-mcp-server.md`**:
   - Update tool catalog (35 total; 32 default / 24 core / 3 admin), `?toolsets=` / `X-Coneshare-Toolsets` docs, OAuth notes, and a **Breaking Changes / Migration Note** (`get_document` -> `get_document_metadata`, `update_document` -> `update_document_metadata`, `remove_content_from_dataroom` parameter renames, plus prompting CLI/IDE users to refresh local `SKILL.md` and reconnect MCP).
5. **`backend/tests/test_mcp_contracts.py`**:
   - Update comment/docstring references to renamed MCP tools if any (zero backend code/API changes).

---

## 3. Target Files (~15–19 files)

- `mcp-server/pyproject.toml` *(version bump from `0.1.0`)*
- `mcp-server/coneshare_mcp/toolsets.py` *(new)*
- `mcp-server/coneshare_mcp/server.py`
- `mcp-server/coneshare_mcp/client.py`
- `mcp-server/coneshare_mcp/tools/{documents,datarooms,share_links,analytics,admin}.py`
- `mcp-server/README.md`
- `mcp-server/tests/{test_toolsets.py,test_server.py}` *(new — `tests/` currently has neither file)* + updates to `{test_documents.py,test_datarooms.py,test_share_links.py,...}`
- `.agent/skills/coneshare-it/SKILL.md`
- `portal/lib/agentsData.js`, `portal/src/tests/agents.test.jsx`
- `docs/features/remote-mcp-server.md`, `backend/tests/test_mcp_contracts.py` *(doc/comment sync only)*

---

## 4. Verification Checklist

1. **Toolsets, server config & auth pruning (`mcp-server/tests/test_toolsets.py` & `test_server.py`):**
   - Default = 32 tools (`admin` excluded); `?toolsets=core` = 24 (`admin`, `folders`, `destructive` excluded, including `remove_content_from_dataroom`); `?toolsets=admin` / `all` = 35; `?toolsets=core,admin` = 27; `?toolsets=core,folders` = 28; `default,core` = 24; unknown tokens ignored cleanly with warning.
   - `X-Coneshare-Toolsets` header fallback + `?toolsets=` override.
   - `on_call_tool` fails closed with actionable hints for disabled toolsets and unauthorized tokens.
   - `scopes=["read"]` hides/blocks `write` & `destructive`; `auth_type="oauth2"` hides/blocks `admin`, `destructive` (including `remove_content_from_dataroom`), and `viewer_analytics` (`list_view_sessions`, `get_view_session`) while keeping `get_document_analytics` (default = 26 tools, `?toolsets=core` = 22 tools under `oauth2`); `CONESHARE_OAUTH_ENABLED=false` & `stdio` fallback safely.
   - Verify `FastMCP` server exposes expected `instructions` and bumped `version`.
   - **End-to-end OAuth 2.1 + `?toolsets=core` verification:** test the full PKCE / `/oauth/verify/` `resource` flow with `?toolsets=core` on the MCP URL to confirm RFC 8707 audience checks do not return `401 invalid_audience`.
2. **Renamed tools, `list_folders`, self-teaching hints & reproducible BM25 check:**
   - Verify `get_document_metadata` returns `next_step_hint`, `create_text_document` emits collision copy `note` when renamed `(1)`, `remove_content_from_dataroom` uses `dataroom_document_ids`/`dataroom_folder_ids`, and `list_folders` works cleanly.
   - Add a reproducible BM25 retrieval check script/test over the 35 tool schemas and verify key queries (`share link`, `share links`, `update markdown document content`, `get document metadata`, `list folders`) surface expected tools in Top 5.
3. **Test suites & lint:**
   - `COMPOSE_PROJECT_NAME=coneshare docker-compose exec -T mcp_server mypy`
   - `COMPOSE_PROJECT_NAME=coneshare docker-compose exec -T mcp_server python -m unittest discover -s tests`
   - `cd portal && npm run lint` and portal `agents.test.jsx` test run.
   - `COMPOSE_PROJECT_NAME=coneshare docker-compose exec -T backend pytest tests/test_mcp_contracts.py` (if touched).

---

## 5. Deferred to Future Follow-ups (Separate Scope)

- Extending backend `OAuthTokenVerifyView` (`backend/core/oauth_views.py`) to emit `is_admin` and API key `tier` (`read_write` vs `full_access`) so `scopes`-blind `read_write` API keys no longer see `delete_*` or `remove_content_from_dataroom` (`@require_full_access`) in `tools/list`, and non-admin API keys never see `admin` tools even with `?toolsets=admin`.
- Tightening `get_document_metadata` / `get_dataroom` response projections if large version lists or large dataroom trees bloat context in real sessions.
