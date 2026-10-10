# 🗺️ Coneshare Feature & Architecture Plans

This directory organizes all architectural designs, implementation plans, and technical specifications.

---

## 📌 Active & Upcoming Plans (`plans/todo/`)

These are pending implementation or active feature proposals:

| Domain | Plan Document | Scope / Goal |
|---|---|---|
| **Datarooms** | [dataroom_collaboration_notifications_phase2_plan.md](todo/dataroom_collaboration_notifications_phase2_plan.md) | In-room notification controls, room owner notification flags, and daily/weekly email digests |
| **MCP** | [cli_skills_plan.md](todo/cli_skills_plan.md) | Coneshare CLI (`@coneshare/cli`) terminal tool and Agent Skill manifest (`SKILL.md`) |
| **MCP** | [realtime_mcp_events_plan.md](todo/realtime_mcp_events_plan.md) | Real-time workspace event subscriptions over Remote MCP SSE stream without polling |

---

## 📂 Completed Plans by Domain

### 📄 [Documents](documents/)
* [markdown_preview_plan.md](documents/markdown_preview_plan.md) — Client-side Markdown (`.md`, `.markdown`) preview with sanitization, text selection, and watermark overlay
* [document-preview-modes.md](documents/document-preview-modes.md) — Multi-format preview modes and viewer strategy design
* [document_preview_renderers_refactor_plan.md](documents/document_preview_renderers_refactor_plan.md) — Document preview renderer strategy pattern refactoring
* [interactive_spreadsheet_preview_plan.md](documents/interactive_spreadsheet_preview_plan.md) — Interactive multi-sheet spreadsheet preview (`.xlsx`, `.csv`, `.xls`)
* [text_selection_for_server_rendered_documents_plan.md](documents/text_selection_for_server_rendered_documents_plan.md) — Transparent selectable text layer for server-rendered documents
* [pdfjs-canvas-viewer.md](documents/pdfjs-canvas-viewer.md) — PDF.js canvas viewer implementation
* [hybrid-preview-download-plan.md](documents/hybrid-preview-download-plan.md) — Hybrid viewer preview and flattened secure downloads
* [heic-preview-support-plan.md](documents/heic-preview-support-plan.md) — HEIC/HEIF image preview and conversion pipeline
* [video-streaming-plan.md](documents/video-streaming-plan.md) — HLS video streaming player integration
* [dynamic-video-preview-plan.md](documents/dynamic-video-preview-plan.md) — Dynamic video preview threshold configuration
* [cloud-import-enhancements.md](documents/cloud-import-enhancements.md) — Cloud provider import and sync tracking metadata
* [cloud_provider_disconnect.md](documents/cloud_provider_disconnect.md) — Cloud provider disconnection and cleanup
* [document-version-history.md](documents/document-version-history.md) — Document version history table and version promotion
* [upload-new-version.md](documents/upload-new-version.md) — Upload new document version workflow
* [copy-file.md](documents/copy-file.md) — Document and folder copy operations
* [move-file.md](documents/move-file.md) — Document and folder move operations
* [download-file-impl.md](documents/download-file-impl.md) — Secure download and authorization pipeline
* [soft_delete_design_plan.md](documents/soft_delete_design_plan.md) — Soft delete and trash lifecycle management
* [file-size.md](documents/file-size.md) — Storage tracking and file size calculations
* [star-unstar.md](documents/star-unstar.md) — Document bookmarking and favorites
* [viewer-toolbar-redesign.md](documents/viewer-toolbar-redesign.md) — Unified viewer toolbar redesign
* [wartermark.md](documents/wartermark.md) — Watermark overlay specifications

### 🏢 [Datarooms](datarooms/)
* [dataroom_direct_upload_plan.md](datarooms/dataroom_direct_upload_plan.md) — Direct uploads into Virtual Dataroom hierarchy (v2 vault)
* [dataroom-navigation-enhancement.md](datarooms/dataroom-navigation-enhancement.md) — Expandable sidebar tree and navigation
* [admin_datarooms_management_plan.md](datarooms/admin_datarooms_management_plan.md) — Admin organization-wide dataroom management and storage quotas
* [audit_trail_preservation_plan.md](datarooms/audit_trail_preservation_plan.md) — Immutable historical audit snapshots on delete/rename
* [archive_dataroom.md](datarooms/archive_dataroom.md) — Virtual Dataroom archiving and export
* [dataroom-branding-ordering-ui-optimization-issue-152.md](datarooms/dataroom-branding-ordering-ui-optimization-issue-152.md) — Custom file ordering and branding

### 🔗 [Share Links](sharelinks/)
* [sharelink_nda.md](sharelinks/sharelink_nda.md) — Clickwrap NDA gating for share links
* [sharelink-view-data-scoped-folder-endpoint.md](sharelinks/sharelink-view-data-scoped-folder-endpoint.md) — Scoped folder retrieval for public share links
* [links-more.md](sharelinks/links-more.md) — Share link access controls and expiration settings

### 📨 [File Requests](filerequests/)
* [file-requests.md](filerequests/file-requests.md) — File requests upload portal and workflow
* [file-request-custom-fields.md](filerequests/file-request-custom-fields.md) — Custom form fields for file request submissions
* [file-request-reminders.md](filerequests/file-request-reminders.md) — Automated email reminders for outstanding requests
* [file_request_export.md](filerequests/file_request_export.md) — File request bundle exports to cloud storage

### 🤖 [MCP & CLI](mcp/)
* [remote_mcp_server_plan.md](mcp/remote_mcp_server_plan.md) — Remote FastMCP server architecture for agentic integration
* [api-keys-mcp-setup-instructions.md](mcp/api-keys-mcp-setup-instructions.md) — API keys and MCP configuration setup guide

### ⚡ [Automations](automations/)
* [automation-feature-impl.md](automations/automation-feature-impl.md) — Event-driven automation rules, webhooks, and destinations
* [unifying_emails_with_automations.md](automations/unifying_emails_with_automations.md) — Routing transactional alerts through automation rules

### 📊 [Analytics](analytics/)
* [dashboard.md](analytics/dashboard.md) — Analytics summary dashboard and KPIs
* [expand-visitor-table.md](analytics/expand-visitor-table.md) — Visitor engagement and page-by-page duration tracking
* [dataroom-visits-details.md](analytics/dataroom-visits-details.md) — Dataroom visit drilldown and interaction logs
* [link_click_tracking.md](analytics/link_click_tracking.md) — Outbound document link click telemetry

### ⚙️ [Platform & Infrastructure](platform/)
* [i18n_implementation_plan.md](platform/i18n_implementation_plan.md) — Multi-language internationalization framework (EN, ZH)
* [french_locale_support_plan.md](platform/french_locale_support_plan.md) — French (fr) translation catalog implementation
* [dynamic-settings-typed-values-plan.md](platform/dynamic-settings-typed-values-plan.md) — Runtime dynamic settings and type casting
* [file-server.md](platform/file-server.md) — Go high-performance file proxy service architecture
* [openapi-source-of-truth-plan.md](platform/openapi-source-of-truth-plan.md) — OpenAPI schema generation and validation
* [signup-email-verification.md](platform/signup-email-verification.md) — Email verification and user onboarding
* [white-labeling-implementation-plan.md](platform/white-labeling-implementation-plan.md) — Custom domains, logos, and white-label branding
