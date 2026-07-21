# Coneshare Document Upload Flow

## Strategy refs
- [Coneshare Roadmap](./strategy/coneshare-roadmap.md)
- [Coneshare Technology Stack](./strategy/coneshare-techstack.md)
- [Coneshare Data Model](./coneshare-data-model.md)
- [Coneshare Root Folder Strategy Implementation](./strategy/coneshare-root-folder.md)
- [Coneshare Document Processing Architecture](./coneshare-document-process.md)

## Out of scope
- Client-side resumable upload implementation in V1.
- Drag-and-drop traversal UX and deep folder ingestion UX polish.
- Cross-provider cloud import behavior (covered by cloud-drive import docs).
- Storage-level deduplication and content-addressable object reuse.

## Design decisions
- Decision: Use a three-step upload flow (request URL -> upload binary -> finalize).
  Rationale: Offloads binary transfer to file service/object storage while keeping backend as control plane.
  Tradeoff: More API round-trips and lifecycle coordination on frontend.
- Decision: Pre-create folder hierarchy in one idempotent ensure call for folder uploads.
  Rationale: Prevents hierarchy races and keeps creation atomic from backend perspective.
  Tradeoff: Requires up-front path extraction and additional preflight call.
- Decision: Return `202 Accepted` from finalize and process documents asynchronously.
  Rationale: Keeps upload path responsive for large files and expensive preview processing.
  Tradeoff: Frontend must handle eventual-consistency states (`processing` -> `ready`/`error`).

This document defines V1 upload architecture and the V2 direction for enhanced upload UX.

---

## V1 Path Contract

- `path` is root-relative and must not start with `/`.
- Valid examples:
  - `"foo.txt"`
  - `"foo/bar/baz.txt"`
  - `"foo/bar"` (folder ensure path)
- Invalid examples:
  - `"/foo.txt"`
  - `"/foo/bar/baz.txt"`
- Backend resolves from organization `__root__` folder.

Security requirements:

1. Normalize and validate path segments server-side.
2. Reject traversal-like patterns (`..`, empty segment ambiguity, invalid separators).
3. Enforce organization scoping in all folder/document resolution operations.

---

## V1 Backend (Django)

### 1. Ensure Folder Paths

- File: `backend/documents/views.py`
- Endpoint: `POST /api/v1/folders/ensure-paths/`
- Purpose: Atomically and idempotently ensure hierarchy for a set of folder paths.

Contract:

1. Accept list of folder paths.
2. Create missing intermediate paths in transaction.
3. Return stable mapping/result for downstream upload flow.

### 2. Upload Request (pre-signed URL request)

- File: `backend/documents/views.py`
- Endpoint: `POST /api/v1/uploads/document/request/`
- Purpose: Validate upload intent and return upload target details.

Inputs:

- `file_name`
- `file_size`
- optional `path`

Behavior:

1. Validate quota/policy.
2. Resolve destination folder/path in org scope.
3. Generate `storage_key` and collision-safe `unique_name`.
4. Request pre-signed URL from file service.
5. Return `upload_url`, `storage_key`, `unique_name`.

### 3. Upload Finalize

- File: `backend/documents/views.py`
- Endpoint: `POST /api/v1/uploads/document/finalize/`
- Purpose: Commit metadata and initialize preview state.

Inputs:

- `storage_key`
- `unique_name`
- `file_size`
- `content_type`
- optional `path`

Behavior:

1. Validate `storage_key` belongs to same authenticated org/upload context.
2. Create `Document` + `DocumentVersion` via service layer.
3. Set document status to `'ready'` (available to download/share immediately).
4. Set document version's `render_status` to `'not_generated'`.
5. Return `202 Accepted`.
6. Defers preview/transcoding processing until first preview access (lazy rendering).

Idempotency requirement:

- Repeated finalize for same upload intent must not create duplicate documents.
- Use request token/idempotency key or equivalent server-side guard.

---

## V1 Frontend (React)

### UI Entry Point

- File: `frontend/src/pages/DocumentsPage.jsx`
- Upload dropdown options:
  - Files
  - Folder

### File Upload Flow

For each file:

1. `POST /api/v1/uploads/document/request/`
2. `PUT` binary to returned `upload_url`
3. `POST /api/v1/uploads/document/finalize/`

Use `Promise.allSettled` for concurrent batch resilience.

### Folder Upload Flow

1. Capture files via `<input type="file" webkitdirectory>`.
2. Extract unique directory paths from `webkitRelativePath`.
3. Call once: `POST /api/v1/folders/ensure-paths/`.
4. Upload each file using same three-step flow with relative path.
5. Refresh list.

---

## Finalize/Readiness Contract

`finalize` returns `202 Accepted` and immediately exposes the document as `ready` for general file actions (downloading, renaming, moving, and sharing). However, its preview assets (rendered pages or transcoded video stream HLS segments) are **not** generated eagerly.

Frontend expectations:

1. New document appears in list immediately with `'ready'` status.
2. When the user or viewer first opens the preview modal, the client calls `GET /api/v1/documents/{id}/preview-data/`.
3. The server atomically transitions `render_status` to `queued`/`processing` and enqueues the Celery worker processing task.
4. The client receives a `'processing'` preview status and polls the endpoint every 2 seconds.
5. Once processing/transcoding completes, the server returns `'ready'` and the client displays the rendered pages or streams the video.

---

## V2 Direction (Planned Enhancements)

Planned improvements:

1. Drag-and-drop upload zone.
2. Resumable/chunked uploads (TUS-style flow).
3. Better upload progress and recovery UX.

Path policy:

- Keep versioned API conventions (`/api/v1/...`) for future upload endpoints.
- Exact V2 endpoint shapes are subject to implementation planning and may evolve.

---

## Testing Scope

Backend:

- ensure-paths idempotency and atomicity tests
- path validation/traversal rejection tests
- quota and org-scope enforcement tests
- finalize idempotency and storage-key ownership tests
- async task trigger + status transition tests

Frontend:

- files/folder upload flow tests
- batch partial-failure handling (`allSettled`) tests
- processing-state rendering and refresh behavior tests
