# MCP Document Content Reading & Download URL — Design & Implementation Plan

> **Status:** Implemented  
> **Scope:** `mcp-server/` (`coneshare_mcp`), `.agent/skills/coneshare-it/SKILL.md`, `backend/tests/test_mcp_contracts.py` (Backend API already exists; **zero backend code changes required**)  
> **Goal:** Enable AI agents (Web AI via OAuth 2.1 and CLI/Desktop agents via API Keys) to read text/Markdown/CSV/JSON/YAML document contents directly into context (`read_text_document`) and obtain temporary signed download URLs for binary files (`get_document_download_url`), closing the **"Read → Edit → Update"** workflow loop alongside `create_text_document` and `update_text_document`.

---

## 1. Motivation & Target User Workflows

Currently, `mcp-server` exposes 32 tools covering document discovery (`list_documents`, `search_documents`, `get_document`), creation (`create_text_document`, `request_document_upload`, `finalize_document_upload`), and in-place updates (`update_text_document`, `request_version_upload`, `finalize_version_upload`), **but lacks any tool to read document content**.

```text
+---------------------------------------------------------------------------------------------------+
|                        WORKFLOW A: READ -> EDIT -> UPDATE IN PLACE                                |
|                                                                                                   |
|  User: "Read my 'SSH ProxyJump Guide.md' from Coneshare, add a troubleshooting section,           |
|         and update it in place so the existing share link stays valid."                           |
|                                                                                                   |
|  Agent: 1. search_documents(query="SSH ProxyJump") -> doc_id                                      |
|         2. read_text_document(document_id=doc_id) -> loads Markdown into AI context               |
|         3. update_text_document(document_id=doc_id, content=updated_markdown)                     |
|            -> promotes v2 on the same Document; existing share links serve the new content        |
+---------------------------------------------------------------------------------------------------+

+---------------------------------------------------------------------------------------------------+
|                   WORKFLOW B: CROSS-CLIENT KNOWLEDGE RETRIEVAL (WEB AI / CLI)                     |
|                                                                                                   |
|  User (ChatGPT / Claude.ai / Gemini): "Summarize the Q4 meeting notes I saved in Coneshare."      |
|                                                                                                   |
|  Agent: 1. search_documents(query="Q4 meeting") -> doc_id                                         |
|         2. read_text_document(document_id=doc_id) -> reads content even without local disk access |
|         3. Summarizes or answers questions grounded in the actual document text                   |
+---------------------------------------------------------------------------------------------------+

+---------------------------------------------------------------------------------------------------+
|                   WORKFLOW C: BINARY DOCUMENT RETRIEVAL FOR LOCAL CLI AGENTS                      |
|                                                                                                   |
|  User (agy / Claude Code): "Download the latest pitch_deck.pdf from Coneshare so I can inspect   |
|                             page 3 locally."                                                      |
|                                                                                                   |
|  Agent: 1. get_document_download_url(document_id=doc_id) -> temporary signed download_url         |
|         2. Runs local curl -o pitch_deck.pdf "<download_url>" without buffering via MCP server    |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Backend Contract & Auth Compatibility (Verified Existing)

No backend endpoint changes are required for Phase 1. The existing backend already provides the required primitives:

1. **Metadata & Ownership Lookup:** `GET /api/v1/documents/{document_id}/` (`DocumentViewSet.retrieve`)
   - Scoped via `get_document_queryset_for_user(request.user)` (owner + active Dataroom collaborators).
   - Returns `id`, `name`, `type`, `content_type`, `file_size`, `status`, `versions`, etc.
2. **Signed Download URL Generation:** `GET /api/v1/documents/{document_id}/download/` (`DocumentDownloadView` in `backend/documents/views.py`)
   - Scoped via `get_document_queryset_for_user(request.user)`.
   - Uses `primary_version = document.versions.filter(is_primary=True).first()`.
   - Calls `fileserver_client.generate_download_url(primary_version.original_storage_key, is_internal=False, filename=primary_version.get_filename())` (which passes `filename` in the JSON POST body to `core`, storing `Filename` server-side in `tokenStore` for `Content-Disposition`) and returns `{"download_url": "..."}` pointing to `/files/download/<token>` with **no query parameters**.
3. **Auth & Scope Compatibility (`backend/core/permissions.py`):**
   - `OAuth2ScopePermission`: `documents.*` views under HTTP `GET` (`SAFE_METHODS`) accept both `read` and `write` scopes. Web AI clients with `read`-only OAuth tokens can call both new tools safely.
   - `APIKeyTierPermission`: `GET` requests are permitted for all tiers (`read_only`, `read_write`, `full_access`).

> **Phase 1 Limitation Note:** `DocumentDownloadView` always serves the current primary version (`is_primary=True`). Reading historical non-primary versions by `version_id` is deferred to a future backend enhancement if needed.

---

## 3. Proposed MCP Tools & SDK Design

### 3.1 New Tool 1: `read_text_document`

Reads UTF-8 text content from an existing text-based document directly into the AI context.

#### Parameters (FastMCP Tool Signature)
- `document_id: str` (required) — ULID of the document to read.
- `offset: int = Field(default=0, ge=0)` — Character offset (`>= 0`) for paging through larger text files.
- `max_chars: int = Field(default=100_000, ge=1, le=200_000)` — Maximum characters to return in one call (prevents context window overflow).

#### Return Shape
```json
{
  "document_id": "01M85RAM7JFQK88NYM3C1S274X",
  "name": "SSH ProxyJump 指南.md",
  "type": "markdown",
  "content_type": "text/markdown",
  "file_size": 11082,
  "content": "# SSH ProxyJump ...",
  "offset": 0,
  "returned_chars": 8540,
  "total_chars": 8540,
  "truncated": false,
  "next_offset": null
}
```
*(Note: for UTF-8 multibyte text such as Chinese Markdown, `file_size` in bytes exceeds `total_chars` / `returned_chars`.)*  
When truncated (`offset + max_chars < total_chars`), `truncated` is `true` and `next_offset` is `offset + returned_chars` so the agent can fetch subsequent chunks cleanly.

#### Execution Flow (`ConeshareClient.read_text_document`)
1. Validate `document_id` via `_validate_resource_id(document_id, "document_id")`.
2. Validate `offset >= 0` and `1 <= max_chars <= MAX_TEXT_READ_CHARS` (for direct Python SDK callers).
3. Fetch metadata via `GET /documents/{doc_id}/`.
   - Ensure `doc.get("status") != "uploading"` (raise actionable `ValueError` if document is still uploading or missing).
   - **Text-Type & Extension Resolution (handles renamed & versioned documents):**
     1. Look up the primary version (`is_primary=True`) in `doc.get("versions", [])` and check its `file_name` extension first.
     2. Fall back to `doc.get("name")` extension.
     3. If neither carries an extension (e.g., user renamed `"Guide.md"` to `"SSH ProxyJump Guide"` on v1 where `DocumentVersion.get_filename()` returns `doc.name`), inspect `doc.get("original_storage_key")` / `doc.get("storage_key")` extension, and also check `doc.get("content_type")` against `set(TEXT_CONTENT_TYPE_BY_EXTENSION.values())` (or `doc.get("type") == "markdown"`).
     4. Reject any resolved non-text extension (not in `TEXT_CONTENT_TYPE_BY_EXTENSION`) or unverified extensionless non-text document with an actionable `ValueError` advising `get_document_download_url` instead.
   - **Early File-Size Guard:** If `doc.get("file_size")` is present and exceeds `MAX_TEXT_READ_BYTES` (e.g., `2 * 1024 * 1024` = 2 MiB), fail fast before fetching from the file server so huge logs/CSVs do not exhaust MCP server memory.
4. Request temporary download URL via `GET /documents/{doc_id}/download/`.
5. Rewrite internal core URL if configured:
   - Generalize `_resolve_upload_url` into `_resolve_fileserver_url(url, prefixes=("/files/upload/", "/files/download/"))` so internal Docker traffic (`CONESHARE_FILESERVER_INTERNAL_URL=http://core:8080`) stays on the internal network while external S3/CDN presigned URLs remain untouched.
6. Stream-download bytes via nested async context managers:
   ```python
   async with httpx.AsyncClient(timeout=60.0) as client:
       async with client.stream("GET", target_url) as response:
           if not response.is_success:
               ...  # read bounded error snippet and raise ValueError (matching _upload_bytes)
           ...      # iterate response.aiter_bytes() while enforcing MAX_TEXT_READ_BYTES
   ```
   - Checking `response.is_success` prevents `core` `403`/`404` UTF-8 error bodies (e.g., `"Invalid or expired download link"`) from being returned as document content.
   - Enforcing `MAX_TEXT_READ_BYTES` incrementally while streaming defends against missing or stale `file_size` metadata.
7. Decode strictly as UTF-8 (`data.decode("utf-8")`):
   - If `UnicodeDecodeError` is raised (e.g., binary bytes masquerading under a `.txt` or `.md` filename), raise a clear `ValueError` rejecting non-UTF-8 / binary content.
8. Slice `content_text[offset : offset + max_chars]` and compute `total_chars`, `returned_chars`, `truncated`, `next_offset`.

---

### 3.2 New Tool 2: `get_document_download_url`

Returns a temporary signed download URL for the primary version of any document (PDF, Office, video, ZIP, dataset, or text).

#### Parameters (FastMCP Tool Signature)
- `document_id: str` (required) — ULID of the document.

#### Return Shape
```json
{
  "document_id": "01M85RAM7JFQK88NYM3C1S274X",
  "name": "Quarterly_Report.pdf",
  "type": "pdf",
  "content_type": "application/pdf",
  "file_size": 1048576,
  "download_url": "https://app.coneshare.com/files/download/<token>"
}
```
> **Note:** `get_document_download_url` must return the **external** `download_url` (never rewritten to `http://core:8080`), because the caller (e.g., a local CLI agent running `curl`) fetches it from outside the Docker network.

#### Execution Flow (`ConeshareClient.get_document_download_url`)
1. Validate `document_id` via `_validate_resource_id`.
2. Fetch document metadata sequentially via `GET /documents/{doc_id}/` and verify `doc.get("status") != "uploading"` before calling `GET /documents/{doc_id}/download/` (since `DocumentDownloadView` does not check `document.status` and mints a 1-hour token in `core`'s in-memory `tokenStore`, sequential calls avoid leaking orphaned tokens on rejected documents).
3. Request signed URL via `GET /documents/{doc_id}/download/` and return normalized metadata + external `download_url`.

---

## 4. Security & Robustness Considerations

1. **No Raw Binary Leakage into LLM Context:**
   - Enforcing both `TEXT_CONTENT_TYPE_BY_EXTENSION` and strict UTF-8 decoding prevents PDFs, Office archives, or images from being dumped as corrupted text tokens.
2. **Memory & Context-Window Protection:**
   - `MAX_TEXT_READ_BYTES` (2 MiB hard streaming limit) protects `mcp_server` worker RAM.
   - `max_chars` (default 100k, max 200k) with `offset` pagination protects LLM context limits.
3. **Internal URL Boundary:**
   - Only `read_text_document` rewrites `/files/download/` paths to `CONESHARE_FILESERVER_INTERNAL_URL` for server-side fetching.
   - `get_document_download_url` preserves the external `SITE_DOMAIN` URL returned by Django.
4. **Input Validation:**
   - Reuse `_validate_resource_id(document_id, "document_id")` and guard `offset` / `max_chars` against `bool` / out-of-range values.
5. **Untrusted Content Handling:**
   - Document contents returned by `read_text_document` are user-stored data; keep tool descriptions clear that returned text is document data (not instructions).

---

## 5. Implementation Checklist & Files to Modify

1. **`mcp-server/coneshare_mcp/client.py`**
   - Generalize `_resolve_upload_url` → `_resolve_fileserver_url` supporting `/files/upload/` and `/files/download/`.
   - Add `_download_bytes_bounded(download_url, max_bytes)` using nested `async with httpx.AsyncClient(...)` + `client.stream("GET", ...)` with explicit `response.is_success` check.
   - Add `ConeshareClient.read_text_document(document_id, offset=0, max_chars=100_000)`.
   - Add `ConeshareClient.get_document_download_url(document_id)`.
2. **`mcp-server/coneshare_mcp/tools/documents.py`**
   - Register `@mcp.tool() read_text_document` and `@mcp.tool() get_document_download_url`.
   - Cross-reference `read_text_document` in `get_document` / `search_documents` docstrings for discoverability.
3. **`mcp-server/tests/test_documents.py`**
   - Test `read_text_document` happy path (`.md`, `.csv`, renamed extensionless doc via `versions[].file_name` / `original_storage_key` / `content_type`, internal URL rewrite via `CONESHARE_FILESERVER_INTERNAL_URL`, external URL passthrough).
   - Test pagination (`offset`, `max_chars`, `truncated=True`, `next_offset`).
   - Test rejection of non-text extensions (`.pdf`, `.png`, unverified extensionless binary), non-2xx streaming responses (`403` / `404` from `core` must raise `ValueError` instead of returning error text), oversized files (`> MAX_TEXT_READ_BYTES`, both metadata check and streaming byte check), `status="uploading"`, and invalid UTF-8 bytes.
   - Test `get_document_download_url` checks document status sequentially before requesting `/download/` and preserves external URL (never rewrites to internal `core:8080`).
   - Test FastMCP tool execution and parameter validation (`offset < 0`, `max_chars <= 0`, invalid `document_id`).
4. **`backend/tests/test_mcp_contracts.py`**
   - Add `/api/v1/documents/{sample_id}/download/` (`DocumentDownloadView`) to `test_all_mcp_client_endpoints_resolve`.
   - Add live contract test verifying `GET /api/v1/documents/{doc.id}/download/` works for API keys (including `read_only` tier) and OAuth `read` scope.
5. **Documentation & Skill**
   - Update `mcp-server/README.md` tool count (32 → 34 tools; Documents and folders 15 → 17).
   - Update `.agent/skills/coneshare-it/SKILL.md` with the "Read → Edit → `update_text_document`" workflow.

---

## 6. Verification Plan

After implementation, run:
```bash
COMPOSE_PROJECT_NAME=coneshare docker-compose exec -T mcp_server mypy
COMPOSE_PROJECT_NAME=coneshare docker-compose exec -T mcp_server python -m unittest discover -s tests
COMPOSE_PROJECT_NAME=coneshare docker-compose exec -T backend pytest tests/test_mcp_contracts.py
```

---

## 7. Future Enhancements (Out of Scope for Phase 1)

- **Server-side PDF / Office text extraction endpoint** (`GET /api/v1/documents/{id}/text/`): expose extracted/OCR page text so Web AI clients without local `curl` can also read PDFs and Office documents.
- **Version-specific content reading:** support optional `version_id` query parameter on `DocumentDownloadView` if agents need to diff historical document versions.
