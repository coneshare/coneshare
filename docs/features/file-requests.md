# Coneshare File Requests Design

## Strategy refs
- [Coneshare Roadmap](./strategy/coneshare-roadmap.md)
- [Coneshare Technology Stack](./strategy/coneshare-techstack.md)
- [Coneshare Data Model](./coneshare-data-model.md)
- [Coneshare Data Ownership Model Analysis](../strategy/coneshare-data-ownership.md)
- [Coneshare Document Upload Flow](./coneshare-upload-file.md)

## Out of scope
- External uploader account creation/login flows.
- Full anti-abuse product controls beyond baseline endpoint safeguards.
- Cross-organization destination routing for uploaded files.
- Advanced uploader identity verification beyond required name/email fields.

## Design decisions
- Decision: Implement file requests in a dedicated `filerequests` app.
  Rationale: Inbound external uploads are a separate domain from outbound share links.
  Tradeoff: More app boundaries and integration points to maintain.
- Decision: Keep `Document.created_by` as the file-request owner for externally uploaded files.
  Rationale: Preserves existing ownership/permission logic across document APIs.
  Tradeoff: External uploader identity must be represented separately (`metadata.uploader_info`).
- Decision: Use a three-step public upload flow (request -> direct upload -> finalize).
  Rationale: Offloads binary transfer and keeps backend as secure control plane.
  Tradeoff: Multi-step client coordination and finalize idempotency requirements.

This document defines the current architecture and API contracts for the File Requests feature.

---

## 1. Feature Overview

File Requests lets authenticated users create secure public upload links for external collaborators.

Core flow:

1. Internal user creates a file request linked to a destination folder.
2. External uploader opens public link, provides name/email, uploads file(s).
3. Uploaded files appear in target folder with uploader attribution.

---

## 2. Backend Architecture

### 2.1 App boundary

- App: `backend/filerequests/`
- Management APIs live in authenticated scope.
- Public upload APIs live under public slug-based routes.

### 2.2 Data model decisions

- `filerequests.FileRequest` stores link config:
  - `slug`, `folder`, `created_by`, optional `expires_at`, `max_file_size`, etc.
- `documents.Document.metadata.uploader_info` stores external uploader attribution.
- `Document.created_by` remains set to file-request owner (internal user).

### 2.3 API contract

Management API (authenticated):

- `GET/POST /api/v1/file-requests/`
- `GET/PATCH/DELETE /api/v1/file-requests/{id}/`

Public API (unauthenticated):

- `POST /api/v1/public/file-requests/{slug}/request-upload/`
- `POST /api/v1/public/file-requests/{slug}/finalize-upload/`
- optional read endpoint for public page data (if implemented in current UI flow)

Upload transport:

- Binary upload is performed directly to file service/object storage using returned pre-signed URL.

### 2.4 Security and validation requirements

Required checks on public endpoints:

1. File request exists, active, and not expired.
2. Destination folder belongs to request owner organization.
3. File size/type constraints enforced.
4. Owner quota checks enforced before upload URL issuance.
5. `storage_key` ownership/binding validation during finalize.
6. Finalize idempotency guard to prevent duplicate `Document` creation.
7. Rate limiting and abuse controls on public endpoints.

File type enforcement specifics:

- `allowed_file_types` is enforced server-side in both:
  - `POST /api/v1/public/file-requests/{slug}/request-upload/`
  - `POST /api/v1/public/file-requests/{slug}/finalize-upload/` (defense-in-depth)
- Matching is case-insensitive and normalizes values with or without leading dot.
- Invalid file types return `400` with a clear message including the normalized allowed list.

---

## 3. Automation Integration

On successful finalize:

- Emit internal event: `file_request_uploaded` after DB commit.
- Include normalized payload fields:
  - `organization_id`, `file_request_id`, `file_request_slug`
  - `folder_id`, `document_id`
  - `uploaded_by_name`, `uploaded_by_email`
  - `uploaded_file_name`, `uploaded_file_size`, `uploaded_at`

This supports routing to automations destinations (webhook/Slack/WeChat/FeiShu/Discord).

---

## 4. Frontend Architecture

### 4.1 Internal management UI

Suggested files:

- `frontend/src/components/filerequests/FileRequestSheet.jsx`
- `frontend/src/components/FolderBrowser.jsx`
- `frontend/src/pages/DocumentsPage.jsx` (entry integration)

Key behavior:

1. Create/edit file request in sheet UI.
2. Select destination folder via `FolderBrowser`.
3. Keep folder selection visible/editable during create and edit.

### 4.2 Public uploader UI

Suggested page:

- `frontend/src/pages/PublicFileRequestUploadPage.jsx` (route `/upload/:slug`)

Key behavior:

1. Collect uploader name/email (required).
2. Execute request-upload -> direct upload -> finalize flow.
3. Show progress/error/success states per file.

### 4.3 Embed mode (website intake)

File request public upload pages can be embedded on external websites via iframe.

Example snippet:

```html
<iframe
  src="https://your-coneshare-domain/upload/<file_request_slug>?embed=1"
  title="Secure file upload"
  width="100%"
  height="760"
  style="border:0;max-width:720px"
  loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin">
</iframe>
```

Upload behavior remains the same 3-step backend flow:

1. `POST /api/v1/public/file-requests/{slug}/request-upload/`
2. Direct upload to returned pre-signed URL
3. `POST /api/v1/public/file-requests/{slug}/finalize-upload/`

### 4.4 Document list attribution

- `frontend/src/components/documents/DraggableItem.jsx` (or current equivalent row component)
- Render external uploader attribution using `metadata.uploader_info` when present.

---

## 5. Current Implementation Notes

1. Folder selection moved from simple dropdown concept to reusable folder-browser interaction.
2. File-request public uploads follow the same high-level upload pattern used elsewhere in Coneshare.
3. Attribution model intentionally keeps ownership internal while exposing uploader identity metadata.
4. Embed mode is presentation-level only; backend validation rules are unchanged.

---

## 5.1 Security headers for embedding

Most deployments terminate HTTPS on an external reverse proxy in front of Coneshare.
That front proxy should be treated as the source of truth for embed headers.
In production, do not depend on editing container-internal runtime Nginx config files.

Recommended policy:

- Default all routes to non-embeddable.
- Allow embedding only on `/upload/*` using CSP `frame-ancestors` with explicit origins.
- Remove/override upstream `X-Frame-Options` on `/upload/*` if upstream sends `DENY`.

External Nginx reverse-proxy example:

```nginx
# Default: deny framing for all routes
location / {
  proxy_pass http://coneshare_upstream;
  add_header X-Frame-Options "DENY" always;
  add_header Content-Security-Policy "frame-ancestors 'none'" always;
}

# Embed-enabled upload route only
location ~ ^/upload/ {
  proxy_pass http://coneshare_upstream;

  # Upstream may send restrictive headers; remove them for this route.
  proxy_hide_header X-Frame-Options;
  proxy_hide_header Content-Security-Policy;

  # Explicit allowlist for trusted embed origins
  add_header Content-Security-Policy "frame-ancestors 'self' https://www.example.com https://portal.partner.com" always;
}
```

Why this works with React Router:

- `/upload/<slug>` is a client-side React route, but the browser still first requests that URL from the server.
- Nginx serves `index.html` for that path (via `try_files`), and response headers are evaluated before React renders.
- Therefore frame/embed policy must be correct on the HTTP response for `/upload/<slug>`, not only in frontend code.

Deployment caveats:

- Route matching must match the deployed URL structure. If Coneshare is mounted under a prefix (for example `/app/upload/<slug>`), adjust proxy location/match rules accordingly.
- Final behavior is determined by the edge response headers seen by the browser. If an upstream layer still returns `X-Frame-Options: DENY`, embedding will fail even with a permissive CSP.
- In reverse-proxy setups, explicitly remove or override upstream `X-Frame-Options` and `Content-Security-Policy` on the embed-enabled upload route, then set the final route-scoped CSP at the edge.

Operator constraints:

- Use explicit HTTPS origins in production.
- Avoid wildcard origins.
- Keep non-upload routes non-embeddable.
- Backend validations remain unchanged (active/expiry/type/size/quota/storage binding).

---

## 6. Testing Scope

Backend:

- management API authz tests
- public request/finalize validation tests
- expiry/active-state tests
- quota/size/type enforcement tests
- finalize idempotency + storage-key binding tests
- automation event emission-on-commit tests

Frontend:

- file request create/edit form tests
- folder selection tests
- public upload flow tests (success/failure/retry)
- uploader attribution rendering tests
