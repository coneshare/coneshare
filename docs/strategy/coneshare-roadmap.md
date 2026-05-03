# Coneshare Feature Roadmap

This roadmap reflects the current implementation in this repository as of **2026-05-01**.

---
## Guiding Principles

1. **Security First**: strong link controls, access checks, and watermarking.
2. **Reliability & Scalability**: async processing and queued delivery patterns.
3. **Administrator Control**: organization/user management plus runtime settings.
4. **Self-Hosted First**: deploy and operate fully inside customer infrastructure.
5. **Unified Core Model**: shared schema foundation for OSS + future hosted editions.

---
## Implemented

### 1) Core Platform & Admin
- **Multi-tenant foundation**: `Organization`, custom `User`, and `UserGroup`.
- **Auth and account management**: login/logout/JWT flows, password set/reset flows.
- **Admin user operations**: create/update/deactivate users with last-admin safeguards.
- **Admin settings service**: dynamic key-value app settings (`AppConfiguration`) for quotas/cloud provider toggles/import limits.
- **Login activity tracking**: `LoginActivity` model + admin API page.

### 2) Documents & Storage Pipeline
- **Document library with folders**: nested folders, root folder abstraction, starring, search/sort-oriented list UX.
- **Upload pipeline**: upload-request + finalize flow to file service using pre-signed upload URLs.
- **Background processing lifecycle**: `uploading -> processing -> ready/error` status model.
- **Versioning**: `DocumentVersion` + `DocumentPage`, including page metadata/links.
- **Bulk operations**: move, delete, copy, rename across documents/folders.
- **Cloud import**: Dropbox, Google Drive, Nextcloud connect/list/import flows.
- **UI upload ergonomics**: drag-and-drop upload support in document list.

### 3) Secure Sharing
- **Share targets**: links can target exactly one of `Document` or `Dataroom`.
- **Per-link controls**: expiration, password, email requirement, email verification, download permission, active toggle.
- **Watermark controls**: link-level watermark settings and dynamic watermark rendering endpoints.
- **Share link templates**: reusable defaults via `ShareLinkTemplate`.
- **Owner preview sessions**: temporary bypass tokens for safe previewing.

### 4) Analytics & Viewer Tracking
- **Viewer identity model**: `Viewer`, `ViewSession`, `PageView`, and dataroom visit tracking.
- **Captured telemetry**: email/IP/user-agent/geo fields, duration, completion, download timestamp.
- **Dashboard endpoints**: recent views, daily visits, all links, all sessions.
- **Per-link analytics UI**: links, sessions, page-level behavior, and viewer context.

### 5) Data Rooms (VDR)
- **Data room structure**: `Dataroom`, `DataroomFolder`, `DataroomDocument`.
- **Content management**: create/rename/delete folders, add/remove/move documents/folders, nested replication from document library folders.
- **Dataroom sharing**: create dataroom share links and manage them in UI.
- **Per-item link permissions**: `ShareLinkDataroomSetting` supports visibility/download/watermark per file/folder for each link.
- **Dataroom activity views**: dataroom-scoped view sessions endpoint and UI tab.
- **Branding and presentation controls**: per-dataroom banner + theme colors, mixed item ordering API/UI, and optional file index display.

### 6) Workflow Automations
- **Destinations**: Slack, Discord, WeChat Work, Feishu, and generic webhook destination model.
- **Rules and scopes**: global/share-link/dataroom scoped rules with validation constraints.
- **Delivery operations**: queued deliveries with retry metadata, dead-letter status, and replay endpoint.
- **Assignment model**: `AutomationAssignment` for user-level follow-up ownership.

### 7) File Requests
- **Public upload links**: `FileRequest` with slug, expiry, status toggle, size/type constraints.
- **No-account external uploads**: public request-upload/finalize APIs + public upload page.
- **Uploader attribution**: `UploadedFile` records and uploader metadata attached to created documents.
- **Automation integration**: file-request upload completion dispatches automation event.

---
## Not Implemented Yet (Roadmap)

### 1) Upload & Transfer
- **Resumable/chunked uploads** (e.g., Tus or multipart checkpoint resume) are not implemented yet.

### 2) Data Room Collaboration
- **Drag-and-drop repositioning inside dataroom tree** is not implemented; move is currently dialog/action based.
- **Group-based ACLs inside dataroom trees** (permissions assigned directly to internal user groups) are not implemented.
- **Grid view for dataroom contents** is not implemented in the current release; table view is the only supported dataroom listing mode.

### 3) Analytics & Branding
- **Aggregated dataroom tree analytics** (folder/file rollups in one hierarchical analytics view) are not implemented.

### 4) Enterprise Security & Governance
- **Comprehensive audit log framework** (beyond login activity) for uploads, permission changes, and admin actions is not implemented.
- **SAML SSO** (Okta/Azure AD/etc.) is not implemented.
- **Org-wide enforced share policies** (e.g., force password on all new links) are not implemented.

---
## Notes

- This roadmap intentionally reflects **code present in this repository today**, not marketing intent.
- For detailed entities and fields, see `docs/coneshare-data-model.md`.
