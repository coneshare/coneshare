# Coneshare Data Model

## Strategy refs
- [Coneshare Roadmap](./strategy/coneshare-roadmap.md)
- [Coneshare Technology Stack](./strategy/coneshare-techstack.md)

## Out of scope
- Physical database sharding and multi-region active-active replication design.
- Historical data warehouse/BI schemas and ETL modeling.
- Detailed SaaS billing/subscription schema beyond OSS defaults.
- Provider-specific cloud-drive metadata extensions beyond base connection model.

## Design decisions
- **Decision:** Keep `Organization` as the top-level tenant and ownership boundary for domain models.  
  *Rationale:* Enforces clear tenancy, simplifies access-control checks, and unifies branding/billing.  
  *Tradeoff:* Cross-organization collaboration requires explicit future model extensions.
- **Decision:** Model `DocumentVersion` and `DocumentPage` as first-class entities instead of flattening into `Document`.  
  *Rationale:* Supports version history, async preview rasterization (`render_status`), and efficient page-level link tracking and rendering.  
  *Tradeoff:* Relational complexity and cascading lifecycle management.
- **Decision:** Use explicit folder classification (`root`, `personal`, `vault`) and a 1-to-1 `Dataroom.vault_folder` relationship for v2 Datarooms.  
  *Rationale:* Decouples team dataroom direct uploads (`__root__/__datarooms__/<id>/`) from individual user personal libraries and quotas. Files in vaults are governed by `dataroom.storage_quota_mb` rather than `user.total_document_size`.  
  *Tradeoff:* Requires structural database check constraints (`folder_type_structural_invariant`) and migration paths (`storage_version=1` vs `2`).
- **Decision:** Support soft deletion (`deleted_at`, `deleted_by`) on `Folder` and `Document`.  
  *Rationale:* Powers the workspace Trash recovery bin, prevents accidental data loss, and preserves historical share analytics.  
  *Tradeoff:* Querysets must use `.active()` / `.filter(deleted_at__isnull=True)`, and unique constraints must be conditional.
- **Decision:** Polymorphic link and session tracking (`ShareLink`, `QnAThread`, `NDAAcceptance`).  
  *Rationale:* Reuses the same secure sharing infrastructure across documents and datarooms.  
  *Tradeoff:* Requires database `CheckConstraint` rules (such as XOR constraints) to guarantee mutually exclusive targets.

---

## Sensitive Field Policy

- Encrypt sensitive secrets, tokens, and password-like values at rest using `django-cryptography` (e.g., share link passwords, cloud provider OAuth tokens, webhook signing secrets).
- Mask secrets in logs, serializer outputs, and error snapshots.
- Avoid persisting full sensitive payloads when truncated excerpts are sufficient for diagnostics.
- Provide management commands (e.g., `reencrypt_data`) for key-rotation procedures.

---

## 1. Core Tenant, User & Security Models (`core` app)

These models establish the multi-tenancy boundary, identity, authentication, dynamic configuration, and API access.

### 1. Organization

The top-level tenant in the system. Ultimate owner of all resources. In self-hosted deployments, typically represents the company.

- **id**: ULID, Primary Key
- **name**: String (max 255)
- **plan**: String (max 50, default `'self-hosted'`)
- **stripe_customer_id**: String (max 255, nullable)
- **brand_logo**: FileField (nullable, uploaded to `logos/{id}/logo.{ext}`)
- **brand_name**: String (max 255, nullable)
- **brand_website_url**: URLField (max 500, nullable)
- **branding_extras**: JSONField (validated dict, supports `terms_url` and `privacy_policy_url`)
- **created_at**: DateTime
- **updated_at**: DateTime

**Relations:** Has many Users, UserGroups, Documents, Datarooms, Folders, Viewers.

### 2. User

Custom user model inheriting from Django's `AbstractUser`, identified by email.

- **id**: ULID, Primary Key
- **organization**: ForeignKey to `Organization` (CASCADE)
- **email**: EmailField, Unique (used as `USERNAME_FIELD`)
- **name**: String (max 255, replaces separate first/last name)
- **avatar**: ImageField (nullable, uploaded to `avatars/{id}/pic.{ext}`)
- **role**: String (max 20, default `'member'`)
- **language**: String (max 10, default `'en'`, choices from `settings.LANGUAGES`)
- **total_document_size**: BigInteger (default `0`, tracks total personal active documents in bytes)
- **custom_file_size_quota_mb**: Integer (nullable, per-user custom quota; null=use global, 0=unlimited)
- **created_at**: DateTime
- **updated_at**: DateTime

**Properties:**
- `effective_file_size_quota_mb`: Returns custom quota if set, otherwise falls back to dynamic setting `FILE_SIZE_QUOTA_MB`.

### 3. UserGroup

Extends Django's built-in `Group` model with multi-tenant organization scoping.

- **id**: Integer, Primary Key
- **organization**: ForeignKey to `Organization` (CASCADE)
- **name**: String (Group name)

### 4. LoginActivity

Audit log recording user authentication events for security and compliance.

- **id**: ULID, Primary Key
- **user**: ForeignKey to `User` (CASCADE)
- **ip_address**: GenericIPAddressField (nullable)
- **user_agent**: String (max 255)
- **created_at**: DateTime
- **updated_at**: DateTime

### 5. AppConfiguration

Stores dynamic, administrator-configurable application settings as key-value pairs without requiring container restarts.

- **key**: String (max 100, Primary Key)
- **value**: Text
- **description**: Text (explanation of setting behavior)

### 6. APIKey

API keys for authenticating external developer tools and AI coding assistants (such as the Coneshare MCP Server). Uses HMAC-SHA256 one-way hashing for secure O(1) lookup.

- **id**: ULID, Primary Key
- **user**: ForeignKey to `User` (CASCADE)
- **name**: String (max 100, descriptive label)
- **prefix**: String (max 16, unique, db_index=True, e.g. `cs_live_c069`)
- **hashed_key**: String (max 64, db_index=True, HMAC-SHA256 hex digest)
- **tier**: String (`read_only | read_write | full_access`, default `'read_only'`)
- **expires_at**: DateTime (nullable)
- **last_used_at**: DateTime (nullable)
- **created_at**: DateTime
- **updated_at**: DateTime

---

## 2. Document & Storage Hierarchy Models (`documents` app)

Models managing physical/virtual file assets, multi-tiered folders, version control, and page-by-page raster rendering.

### 7. Folder

Hierarchical directory structure for organizing documents. Categorized into three explicit types:
- `root`: The invisible organization root folder (`__root__`).
- `personal`: User-created personal workspace folders.
- `vault`: System folders for v2 Datarooms (`__datarooms__/<dataroom_id>/...`).

- **id**: ULID, Primary Key
- **organization**: ForeignKey to `Organization` (CASCADE)
- **name**: String (max 255, db_index=True)
- **parent**: ForeignKey to `self` (CASCADE, nullable for root)
- **created_by**: ForeignKey to `User` (SET_NULL, nullable for root and vaults)
- **folder_type**: String (`root | personal | vault`, default `'personal'`, db_index=True)
- **is_starred**: Boolean (default False)
- **deleted_at**: DateTime (nullable, db_index=True, soft deletion timestamp)
- **deleted_by**: ForeignKey to `User` (SET_NULL, nullable)
- **created_at**: DateTime
- **updated_at**: DateTime

**Database Constraints:**
- `unique_active_folder_name`: Unique on (`created_by`, `parent`, `name`) where `deleted_at IS NULL`.
- `unique_active_vault_folder_name`: Unique on (`organization`, `parent`, `name`) where `folder_type='vault'` and `deleted_at IS NULL`.
- `folder_type_structural_invariant`: Check constraint enforcing:
  - `root`: `parent IS NULL` and `created_by IS NULL`
  - `personal`: `created_by IS NOT NULL`
  - `vault`: `parent IS NOT NULL` and `created_by IS NULL`

### 8. Document

The core file metadata model representing an active or soft-deleted document.

- **id**: ULID, Primary Key
- **organization**: ForeignKey to `Organization` (CASCADE)
- **folder**: ForeignKey to `Folder` (SET_NULL, nullable, defaults to org `__root__`)
- **name**: String (max 255, db_index=True, original filename)
- **description**: Text (blank)
- **status**: String (`uploading | processing | ready | error`, default `'processing'`)
- **status_message**: String (max 255, nullable)
- **storage_key**: String (max 1024, nullable, primary version processed file)
- **original_storage_key**: String (max 1024, nullable, primary version untouched file)
- **type**: String (max 20, e.g. `'pdf'`, `'document'`, `'sheet'`, `'slides'`, `'video'`, `'file'`)
- **content_type**: String (max 255, MIME type)
- **num_pages**: Integer (nullable)
- **file_size**: BigInteger (nullable, bytes)
- **download_only**: Boolean (default False, persisted fallback)
- **assistant_enabled**: Boolean (default False)
- **is_starred**: Boolean (default False)
- **created_by**: ForeignKey to `User` (SET_NULL, nullable)
- **metadata**: JSONField (blank=True, default dict)
- **deleted_at**: DateTime (nullable, db_index=True, soft deletion timestamp)
- **deleted_by**: ForeignKey to `User` (SET_NULL, nullable)
- **created_at**: DateTime
- **updated_at**: DateTime

**Properties:**
- `is_download_only`: Dynamically evaluates whether the document can only be downloaded based on type limits, dynamic settings (`MAX_PREVIEW_FILE_SIZE_MB`, `MAX_VIDEO_PREVIEW_SIZE_MB`), and feature flags.

**Constraints:**
- `unique_active_document_name`: Unique on (`created_by`, `folder`, `name`) where `deleted_at IS NULL`.

### 9. DocumentVersion

Maintains revision history for a `Document`.

- **id**: ULID, Primary Key
- **document**: ForeignKey to `Document` (CASCADE)
- **version_number**: Integer
- **storage_key**: String (max 1024, processed preview file)
- **original_storage_key**: String (max 1024, untouched upload file)
- **content_type**: String (max 255)
- **type**: String (max 50)
- **storage_type**: String (max 20)
- **file_size**: BigInteger (nullable, bytes)
- **num_pages**: Integer (nullable)
- **length**: Integer (nullable, media duration in seconds)
- **is_primary**: Boolean (default False, active version)
- **is_vertical**: Boolean (default True, orientation hint)
- **has_pages**: Boolean (default False)
- **render_status**: String (`not_applicable | not_generated | queued | processing | ready | failed`, default `'not_applicable'`, db_index=True)
- **render_error**: Text (nullable, failure diagnostic message)
- **metadata**: JSONField (validated dict schema for `cloud_import` tracking: `provider`, `provider_display`, `connection_id`, `file_id`, `etag_or_rev`)
- **created_at**: DateTime
- **updated_at**: DateTime

### 10. DocumentPage

Represents a single rasterized page image for viewer streaming and annotation tracking.

- **id**: ULID, Primary Key
- **document_version**: ForeignKey to `DocumentVersion` (CASCADE)
- **page_number**: Integer
- **storage_key**: String (max 1024, path in MinIO / S3)
- **storage_type**: String (max 20)
- **page_links**: JSONField (stores extracted hyperlink URLs and coordinate bounding boxes)
- **metadata**: JSONField (dimensions, scale, DPI)
- **created_at**: DateTime
- **updated_at**: DateTime

---

## 3. Sharing, Access Control & Viewer Analytics Models (`sharelinks` app)

Models governing public access links, security gates (password, email verification, NDA, Q&A), and engagement telemetry.

### 11. ShareLink

A secure, configurable share link pointing to either a single `Document` or an entire `Dataroom`.

- **id**: ULID, Primary Key
- **document**: ForeignKey to `Document` (CASCADE, nullable)
- **dataroom**: ForeignKey to `Dataroom` (CASCADE, nullable)
- **created_by**: ForeignKey to `User` (CASCADE)
- **name**: String (max 255, blank)
- **slug**: String (max 50, unique, 16-char URL-safe token)
- **expires_at**: DateTime (nullable)
- **password**: String (encrypted with `django-cryptography`, nullable)
- **requires_email**: Boolean (default False)
- **requires_email_verification**: Boolean (default False)
- **allow_download**: Boolean (default True)
- **enable_qna**: Boolean (default True, link-level Q&A toggle)
- **enable_watermark**: Boolean (default False)
- **watermark_text**: String (max 255, supports template tags like `{{email}}`, `{{ip}}`, `{{date}}`)
- **receive_email_notification**: Boolean (default False)
- **is_active**: Boolean (default True)
- **require_nda**: Boolean (default False)
- **nda_text**: Text (custom legal agreement)
- **nda_version**: Integer (default 1, auto-increments on text modifications)
- **created_at**: DateTime
- **updated_at**: DateTime

**Constraints & Logic:**
- `sharelink_exactly_one_target`: Check constraint enforcing exactly one of `document` or `dataroom` is set (XOR).
- `qna_enabled`: Property evaluating effective Q&A availability. Dataroom master switch takes precedence: if `dataroom.enable_qna` is False, link Q&A is disabled.

### 12. ShareLinkTemplate

Reusable security configuration presets for quick link generation.

- **id**: ULID, Primary Key
- **organization**: ForeignKey to `Organization` (CASCADE)
- **name**: String (max 255)
- **is_default**: Boolean (default False)
- **expires_in_days**: Integer (nullable)
- **requires_password**: Boolean (default False)
- **requires_email**: Boolean (default False)
- **requires_email_verification**: Boolean (default False)
- **allow_download**: Boolean (default True)
- **enable_watermark**: Boolean (default False)
- **watermark_text**: String (max 255)
- **receive_email_notification**: Boolean (default False)
- **created_at**: DateTime
- **updated_at**: DateTime

### 13. ShareLinkDataroomSetting

Granular document- and folder-level permission overrides for a specific dataroom share link.

- **id**: ULID, Primary Key
- **share_link**: ForeignKey to `ShareLink` (CASCADE)
- **dataroom_document**: ForeignKey to `DataroomDocument` (CASCADE, nullable)
- **dataroom_folder**: ForeignKey to `DataroomFolder` (CASCADE, nullable)
- **is_visible**: Boolean (default True)
- **allow_download**: Boolean (default True)
- **enable_watermark**: Boolean (default False)
- **created_at**: DateTime
- **updated_at**: DateTime

**Constraints:**
- `sharelinkdataroomsetting_exactly_one_target`: Exactly one of `dataroom_document` or `dataroom_folder` must be set.

### 14. EmailVerificationToken

Single-use verification token for viewer email identification.

- **id**: ULID, Primary Key
- **share_link**: ForeignKey to `ShareLink` (CASCADE)
- **email**: EmailField
- **token**: String (max 64, unique, db_index=True)
- **expires_at**: DateTime (15-minute lifespan)
- **created_at**: DateTime

### 15. PreviewSession

Short-lived bypass session allowing authenticated room owners to preview links as external viewers.

- **id**: ULID, Primary Key
- **share_link**: ForeignKey to `ShareLink` (CASCADE)
- **user**: ForeignKey to `User` (CASCADE)
- **token**: String (max 64, unique, db_index=True)
- **expires_at**: DateTime
- **created_at**: DateTime
- **updated_at**: DateTime

### 16. Viewer

Represents an identified external recipient who accessed a share link.

- **id**: ULID, Primary Key
- **organization**: ForeignKey to `Organization` (CASCADE)
- **email**: EmailField
- **created_at**: DateTime

**Constraints:**
- Unique together on (`organization`, `email`).

### 17. ViewSession

An individual reading/viewing session on a `ShareLink`. Core entity for visitor analytics.

- **id**: ULID, Primary Key
- **share_link**: ForeignKey to `ShareLink` (CASCADE)
- **viewer**: ForeignKey to `Viewer` (SET_NULL, nullable)
- **viewer_email**: EmailField (blank, captured prior to Viewer resolution)
- **ip_address**: GenericIPAddressField (nullable)
- **user_agent**: String (max 255, browser identification)
- **country**: String (max 100, GeoIP lookup)
- **city**: String (max 100, GeoIP lookup)
- **latitude**: Float (nullable)
- **longitude**: Float (nullable)
- **duration_seconds**: Integer (default 0)
- **completion_rate**: Float (default 0.0, 0.0 to 1.0)
- **downloaded_at**: DateTime (nullable, first file/folder download)
- **viewed_at**: DateTime (default `timezone.now`)

**Indexes:**
- Composite index on (`share_link`, `-viewed_at`) for optimized dashboard query performance.

### 18. DataroomVisit

Records access and download events within a dataroom viewing session. Preserves point-in-time audit snapshots so historical analytics remain accurate even if documents or folders are later deleted or renamed.

- **id**: ULID, Primary Key
- **view_session**: ForeignKey to `ViewSession` (CASCADE)
- **dataroom_document**: ForeignKey to `DataroomDocument` (SET_NULL, nullable)
- **dataroom_folder**: ForeignKey to `DataroomFolder` (SET_NULL, nullable)
- **item_type**: String (`document | folder`, default `'document'`)
- **item_name**: String (max 255, point-in-time snapshot)
- **item_path**: String (max 1024, e.g. `/Financials/2026`)
- **document_type**: String (max 50, e.g. `pdf`, `video`)
- **visited_at**: DateTime (default `timezone.now`)
- **downloaded_at**: DateTime (nullable)

**Constraints:**
- `dataroomvisit_not_both_targets`: Check constraint ensuring `dataroom_document` and `dataroom_folder` cannot both be set simultaneously.

### 19. PageView

Fine-grained page-level reading duration and video streaming telemetry within a `ViewSession`.

- **id**: ULID, Primary Key
- **view_session**: ForeignKey to `ViewSession` (CASCADE)
- **dataroom_visit**: ForeignKey to `DataroomVisit` (SET_NULL, nullable)
- **page_number**: PositiveInteger
- **duration_seconds**: PositiveInteger
- **media_type**: String (max 20, default `'document'`)
- **video_start_time**: Float (nullable, playback range start in seconds)
- **video_end_time**: Float (nullable, playback range end in seconds)
- **video_volume**: Integer (nullable, audio level 0-100)
- **is_fullscreen**: Boolean (nullable)
- **playback_speed**: Float (nullable, e.g. 1.0, 1.25)
- **created_at**: DateTime

### 20. LinkClick

Telemetry tracking outbound URL clicks embedded within document pages.

- **id**: ULID, Primary Key
- **view_session**: ForeignKey to `ViewSession` (CASCADE)
- **dataroom_visit**: ForeignKey to `DataroomVisit` (SET_NULL, nullable)
- **url**: Text (destination URL)
- **page_number**: PositiveInteger
- **clicked_at**: DateTime

### 21. NDAAcceptance

Legal compliance log recording viewer acceptance of Non-Disclosure Agreements.

- **id**: ULID, Primary Key
- **share_link**: ForeignKey to `ShareLink` (CASCADE)
- **nda_version**: Integer (version accepted)
- **view_session**: ForeignKey to `ViewSession` (SET_NULL, nullable, for session-scoped acceptance)
- **viewer**: ForeignKey to `Viewer` (SET_NULL, nullable, for identity-scoped acceptance)
- **ip_address**: GenericIPAddressField (nullable)
- **user_agent**: String (max 255)
- **accepted_at**: DateTime

**Constraints:**
- `ndaacceptance_session_or_viewer`: Check constraint enforcing that exactly one of `view_session` or `viewer` is set (XOR), preventing ambiguity between transient session acceptance and persistent identity acceptance.

---

## 4. In-Viewer Q&A Models (`sharelinks` app)

Models powering real-time questions, answers, and discussions within shared documents and virtual datarooms.

### 22. QnAThread

Discussion thread scoped to a document or dataroom item.

- **id**: ULID, Primary Key
- **organization**: ForeignKey to `Organization` (CASCADE)
- **share_link**: ForeignKey to `ShareLink` (CASCADE)
- **dataroom**: ForeignKey to `Dataroom` (CASCADE, nullable)
- **document**: ForeignKey to `Document` (CASCADE, nullable)
- **dataroom_document**: ForeignKey to `DataroomDocument` (CASCADE, nullable)
- **dataroom_folder**: ForeignKey to `DataroomFolder` (CASCADE, nullable)
- **subject**: Text (question summary or title)
- **status**: String (`open | closed`, default `'open'`)
- **created_by_user**: ForeignKey to `User` (SET_NULL, nullable)
- **created_by_viewer**: ForeignKey to `Viewer` (SET_NULL, nullable)
- **created_by_view_session**: ForeignKey to `ViewSession` (SET_NULL, nullable)
- **created_at**: DateTime
- **updated_at**: DateTime

**Constraints:**
- `qna_thread_exactly_one_context`: Ensures thread targets either a standalone document or a dataroom context.
- `qna_thread_at_most_one_creator_type`: Restricts creator to at most one live principal.

### 23. QnAMessage

Messages posted within a `QnAThread`.

- **id**: ULID, Primary Key
- **thread**: ForeignKey to `QnAThread` (CASCADE)
- **body**: Text
- **sent_by_user**: ForeignKey to `User` (SET_NULL, nullable)
- **sent_by_viewer**: ForeignKey to `Viewer` (SET_NULL, nullable)
- **sent_by_view_session**: ForeignKey to `ViewSession` (SET_NULL, nullable)
- **created_at**: DateTime
- **updated_at**: DateTime

**Constraints:**
- `qna_message_at_most_one_sender_type`: Check constraint enforcing at most one sender principal type.

---

## 5. Virtual Dataroom Models (`datarooms` app)

Models managing virtual deal rooms, multi-user collaboration, custom manual ordering, and system vault backing storage.

### 24. Dataroom

The top-level deal room container.

- **id**: ULID, Primary Key
- **organization**: ForeignKey to `Organization` (CASCADE)
- **name**: String (max 255)
- **created_by**: ForeignKey to `User` (SET_NULL, nullable, room owner)
- **show_file_index**: Boolean (default True, displays sequential index badges)
- **enable_qna**: Boolean (default True, room-wide Q&A master toggle)
- **branding_banner**: ImageField (nullable, uploaded to `dataroom-branding/{org_id}/{id}/banner.{ext}`)
- **brand_primary_color**: String (max 9, hex color, nullable)
- **brand_secondary_color**: String (max 9, hex color, nullable)
- **brand_accent_color**: String (max 9, hex color, nullable)
- **storage_quota_mb**: Integer (default 0, room storage capacity in MB; 0=unlimited)
- **storage_version**: PositiveSmallInteger (default 2, `1`=legacy user-scoped, `2`=v2 system vault)
- **vault_folder**: OneToOneField to `documents.Folder` (SET_NULL, nullable, points to backing vault `__root__/__datarooms__/<id>`)
- **created_at**: DateTime
- **updated_at**: DateTime

### 25. DataroomFolder

Hierarchical folder structure exclusively scoped to a single `Dataroom`.

- **id**: ULID, Primary Key
- **dataroom**: ForeignKey to `Dataroom` (CASCADE)
- **parent**: ForeignKey to `self` (CASCADE, nullable for room root)
- **name**: String (max 255)
- **created_by**: ForeignKey to `User` (SET_NULL, nullable)
- **is_starred**: Boolean (default False)
- **created_at**: DateTime
- **updated_at**: DateTime

**Methods:**
- `get_full_path()`: Traverses ancestors to return a `/`-delimited path string (e.g. `/Financials/2026/Q1`).

### 26. DataroomDocument

Links a `Document` into a Dataroom's structure with optional display name overrides.

- **id**: ULID, Primary Key
- **dataroom**: ForeignKey to `Dataroom` (CASCADE)
- **document**: ForeignKey to `Document` (CASCADE)
- **folder**: ForeignKey to `DataroomFolder` (CASCADE, nullable)
- **name**: String (max 255, blank, custom display name in room)
- **is_starred**: Boolean (default False)
- **is_direct_upload**: Boolean (nullable, default None; `True`=uploaded directly to room vault, `False`=linked from user personal documents, `None`=legacy)
- **created_at**: DateTime
- **updated_at**: DateTime

**Constraints:**
- Unique together on (`dataroom`, `document`, `folder`).

### 27. DataroomItemOrder

Enables arbitrary manual reordering of folders and documents within a Dataroom or subfolder.

- **id**: ULID, Primary Key
- **dataroom**: ForeignKey to `Dataroom` (CASCADE)
- **parent_folder**: ForeignKey to `DataroomFolder` (CASCADE, nullable, null indicates room root)
- **item_type**: String (`folder | document`)
- **folder**: OneToOneField to `DataroomFolder` (CASCADE, nullable)
- **dataroom_document**: OneToOneField to `DataroomDocument` (CASCADE, nullable)
- **position**: PositiveInteger (default 0, db_index=True)
- **created_at**: DateTime
- **updated_at**: DateTime

**Constraints:**
- `uq_dataroom_item_order_scope_position`: Unique on (`dataroom`, `parent_folder`, `position`).
- `ck_dataroom_item_order_target_matches_type`: Check constraint verifying item type matches the attached target pointer.

### 28. DataroomCollaborator

Manages multi-user access and collaboration in a Dataroom without granting organization admin privileges.

- **id**: ULID, Primary Key
- **dataroom**: ForeignKey to `Dataroom` (CASCADE)
- **user**: ForeignKey to `User` (CASCADE)
- **role**: String (`collaborator`, default `'collaborator'`)
- **invited_by**: ForeignKey to `User` (SET_NULL, nullable)
- **created_at**: DateTime
- **updated_at**: DateTime

**Constraints:**
- `uq_dataroom_collaborator_dataroom_user`: Unique on (`dataroom`, `user`).

---

## 6. File Request & Ingestion Security Models (`filerequests` app)

Models managing external document collection, public intake schemas, malware scanning, and cloud exports.

### 29. FileRequest

A secure public intake link allowing external parties to upload files directly into a designated folder.

- **id**: ULID, Primary Key
- **folder**: ForeignKey to `Folder` (CASCADE)
- **created_by**: ForeignKey to `User` (CASCADE)
- **name**: String (max 255)
- **message**: Text (blank, instructions for uploaders)
- **slug**: String (max 50, unique, 16-char URL-safe token)
- **is_active**: Boolean (default True)
- **expires_at**: DateTime (nullable)
- **max_file_size**: BigInteger (nullable, max bytes per upload)
- **allowed_file_types**: JSONField (nullable, list of extensions, e.g. `['.pdf', '.docx']`)
- **custom_fields**: JSONField (blank=True, default list, dynamic intake form schema)
- **created_at**: DateTime
- **updated_at**: DateTime

### 30. UploadedFile

Audit record linking a newly created `Document` back to the `FileRequest` through which it was uploaded.

- **id**: ULID, Primary Key
- **file_request**: ForeignKey to `FileRequest` (CASCADE)
- **document**: ForeignKey to `Document` (CASCADE)
- **uploader_name**: String (max 255)
- **uploader_email**: EmailField
- **submitted_fields**: JSONField (default dict, key-value answers to custom intake questions)
- **created_at**: DateTime
- **updated_at**: DateTime

### 31. SecurityThreatEvent

Security audit log tracking malware detection and antivirus scan results on uploaded files.

- **id**: ULID, Primary Key
- **organization**: ForeignKey to `Organization` (CASCADE)
- **owner_user**: ForeignKey to `User` (CASCADE)
- **file_request**: ForeignKey to `FileRequest` (CASCADE)
- **event_type**: String (`malware_detected | scan_failed`)
- **severity**: String (`high | medium`)
- **status**: String (`new | acknowledged | resolved`, default `'new'`)
- **storage_key**: String (max 1024, blank)
- **file_name**: String (max 255, blank)
- **file_size**: BigInteger (nullable)
- **content_type**: String (max 255, blank)
- **uploader_name**: String (max 255, blank)
- **uploader_email**: EmailField (blank)
- **scanner_engine**: String (max 64, default `'clamav'`)
- **scanner_message**: Text (blank, antivirus engine report)
- **storage_cleanup_status**: String (`pending | deleted | failed`, default `'pending'`)
- **storage_cleanup_at**: DateTime (nullable)
- **storage_cleanup_error**: Text (blank)
- **created_at**: DateTime
- **updated_at**: DateTime

### 32. UploadExportJob

Background processing job tracking asynchronous export of uploaded files into connected cloud drives.

- **id**: ULID, Primary Key
- **uploaded_file**: ForeignKey to `UploadedFile` (CASCADE)
- **connection**: ForeignKey to `CloudConnection` (CASCADE)
- **destination_folder_id**: String (max 1024, destination folder ID or path)
- **status**: String (`queued | exporting | exported | failed | blocked_security_scan | blocked_policy`, default `'queued'`)
- **error_message**: Text (default `''`)
- **provider_file_id**: String (max 1024, remote file ID in cloud storage)
- **created_at**: DateTime
- **updated_at**: DateTime

---

## 7. Cloud Storage Integration Models (`cloudfiles` app)

Stores OAuth2 authorization tokens for external storage providers.

### 33. CloudConnection

User-scoped connection credentials to external cloud storage services.

- **id**: ULID, Primary Key
- **user**: ForeignKey to `User` (CASCADE)
- **provider**: String (`dropbox | google_drive | nextcloud`)
- **email**: EmailField (blank, account email on provider)
- **access_token**: Text (encrypted at rest via `django-cryptography`)
- **refresh_token**: Text (encrypted at rest, nullable)
- **expires_at**: DateTime (nullable)
- **created_at**: DateTime
- **updated_at**: DateTime

**Constraints:**
- Unique together on (`user`, `provider`).

---

## 8. Webhook & Notification Automation Models (`automations` app)

Event-driven notification system routing workspace activity to webhooks, chat applications, and debounced summary emails.

### 34. AutomationDestination

Endpoint definition receiving event notifications.

- **id**: ULID, Primary Key
- **organization**: ForeignKey to `Organization` (CASCADE)
- **created_by**: ForeignKey to `User` (CASCADE)
- **name**: String (max 255)
- **destination_type**: String (`slack | discord | wechat | feishu | webhook | email`, default `'webhook'`)
- **endpoint_url**: URLField (max 2048, nullable for email destinations, required for others)
- **http_method**: String (`POST | PUT`, default `'POST'`)
- **headers**: JSONField (default dict, custom HTTP request headers)
- **signing_secret**: String (encrypted at rest, nullable)
- **is_active**: Boolean (default True)
- **created_at**: DateTime
- **updated_at**: DateTime

### 35. AutomationRule

Subscription filter matching events and dispatching them to destinations.

- **id**: ULID, Primary Key
- **organization**: ForeignKey to `Organization` (CASCADE)
- **created_by**: ForeignKey to `User` (CASCADE)
- **name**: String (max 255)
- **is_active**: Boolean (default True)
- **scope_type**: String (`global | share_link | dataroom`, default `'global'`)
- **share_link**: ForeignKey to `ShareLink` (CASCADE, nullable)
- **dataroom**: ForeignKey to `Dataroom` (CASCADE, nullable)
- **subscribed_events**: JSONField (list of event types, e.g. `document_viewed`, `dataroom_opened`, `document_downloaded`, `email_identified`, `file_request_uploaded`)
- **actions**: JSONField (default list)
- **destinations**: ManyToManyField to `AutomationDestination` (blank=True)
- **created_at**: DateTime
- **updated_at**: DateTime

**Constraints:**
- `automationrule_scope_target_consistency`: Check constraint ensuring targets match the selected `scope_type`:
  - `global`: neither `share_link` nor `dataroom` set.
  - `share_link`: `share_link` set, `dataroom` null.
  - `dataroom`: `dataroom` set, `share_link` null.

### 36. AutomationDelivery

Per-attempt delivery record and retry lifecycle tracker.

- **id**: ULID, Primary Key
- **organization**: ForeignKey to `Organization` (CASCADE)
- **rule**: ForeignKey to `AutomationRule` (CASCADE)
- **destination**: ForeignKey to `AutomationDestination` (CASCADE)
- **event_type**: String (max 100)
- **payload**: JSONField (serialized event context)
- **status**: String (`pending | processing | success | failed | dead_letter`, default `'pending'`)
- **response_code**: Integer (nullable)
- **response_body_excerpt**: Text (blank)
- **attempt_count**: PositiveInteger (default 0)
- **next_retry_at**: DateTime (nullable)
- **delivered_at**: DateTime (nullable)
- **idempotency_key**: String (max 100, blank)
- **created_at**: DateTime
- **updated_at**: DateTime

### 37. AutomationAssignment

Workflow assignment record for automated task routing.

- **id**: ULID, Primary Key
- **organization**: ForeignKey to `Organization` (CASCADE)
- **delivery**: ForeignKey to `AutomationDelivery` (CASCADE)
- **assigned_user**: ForeignKey to `User` (CASCADE)
- **assigned_by_rule**: ForeignKey to `AutomationRule` (CASCADE)
- **status**: String (`open | acknowledged | closed`, default `'open'`)
- **created_at**: DateTime
- **updated_at**: DateTime
