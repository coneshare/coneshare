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

### 4.3 Document list attribution

- `frontend/src/components/documents/DraggableItem.jsx` (or current equivalent row component)
- Render external uploader attribution using `metadata.uploader_info` when present.

---

## 5. Current Implementation Notes

1. Folder selection moved from simple dropdown concept to reusable folder-browser interaction.
2. File-request public uploads follow the same high-level upload pattern used elsewhere in Coneshare.
3. Attribution model intentionally keeps ownership internal while exposing uploader identity metadata.

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
