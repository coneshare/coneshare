# Coneshare Data Model

This document outlines the data model for Coneshare, a self-hosted, enterprise-grade document sharing platform. The model is designed to be robust, secure, and scalable, aligning with the principles in the project roadmap and tech stack.

---

## Core Tenant & User Models

These models establish the foundation for multi-tenancy and user management.

### 1. Organization

The top-level tenant in the system. It is the ultimate owner of all resources, ensuring clear data ownership and simplifying employee offboarding. In a self-hosted deployment, this typically represents one company.

-   **id**: ULID, Primary Key
-   **name**: String
-   **plan**: String (SaaS field, defaults to 'self-hosted' in OSS)
-   **stripe_customer_id**: String (SaaS field, nullable)
-   **created_at**: DateTime
-   **updated_at**: DateTime

**Relations:** Has many Users, UserGroups, Documents, Datarooms.

### 2. User

Represents an individual user account. Users belong to an `Organization`.

-   **id**: ULID, Primary Key
-   **organization_id**: Foreign Key to `Organization`
-   **email**: String, Unique
-   **password_hash**: String
-   **name**: String (Nullable)
-   **avatar**: ImageField (Nullable, path to the user's profile image)
-   **role**: String (e.g., 'admin', 'member') - Role within the Organization.
-   **total_document_size**: BigInt (Total size of user's documents in bytes)
-   **updated_at**: DateTime

**Relations:** Belongs to one Organization, can be in many UserGroups.

**Django Implementation Note:**
This model will be implemented as a custom Django User Model by inheriting from `django.contrib.auth.models.AbstractUser`. This is the recommended best practice for new Django projects.

**Why this approach?**
-   **Performance:** It stores all user data in a single database table, which is more efficient than the older `UserProfile` pattern that requires a `JOIN` for every query.
-   **Simplicity:** All fields are accessible directly from the user object (e.g., `request.user.avatar.url`).

**Key Implementation Steps:**
1.  Create a custom `User` model that inherits from `AbstractUser`.
2.  Add custom fields like `avatar` and the `organization` foreign key directly to this model.
3.  Set `AUTH_USER_MODEL = 'your_app.User'` in `settings.py` **before running the first migration**.

`AbstractUser` already provides standard fields like `password` (hashed), `email`, `first_name`, and `last_name`. The default integer primary key `id` will be overridden to use `ULIDField` as specified above.

### 3. UserGroup

A named group of users within an Organization, used for assigning permissions. Leverages Django's built-in `Group` model, extended with a link to the `Organization`.

-   **id**: Integer, Primary Key
-   **organization_id**: Foreign Key to `Organization`
-   **name**: String

**Relations:** Belongs to one Organization, has many Users.

### 4. Folder

Provides a hierarchical structure for organizing documents, similar to a filesystem. Folders are scoped to an `Organization`.

-   **id**: ULID, Primary Key
-   **organization_id**: Foreign Key to `Organization`
-   **name**: String
-   **parent_id**: Foreign Key to `Folder` (Self-referencing, Nullable for root)
-   **created_by_id**: Foreign Key to `User`
-   **is_starred**: Boolean
-   **created_at**: DateTime
-   **updated_at**: DateTime

**Relations:** Belongs to one Organization. Can have one parent Folder and many child Folders. Has many Documents.

---

## V1.0: Document & Sharing Models

These models support the core V1.0 functionality: uploading, processing, sharing, and tracking a single document.

### 5. Document

The core entity for a file. It stores metadata and points to the primary version of the content.

-   **id**: ULID, Primary Key
-   **organization_id**: Foreign Key to `Organization`
-   **folder_id**: Foreign Key to `Folder` (Nullable, for root documents)
-   **name**: String (Original filename)
-   **description**: Text (Nullable)
-   **status**: String (e.g., 'uploading', 'processing', 'ready', 'error')
-   **status_message**: String (Nullable, stores user-friendly error messages)
-   **storage_key**: String (Path to the primary version's processed file)
-   **original_storage_key**: String (Path to the primary version's original file)
-   **type**: String (e.g., 'pdf', 'sheet', 'slides')
-   **content_type**: String (MIME type of the primary version's file)
-   **num_pages**: Integer (Nullable, from the primary version)
-   **file_size**: BigInt (in bytes)
-   **download_only**: Boolean (If true, the file bypasses processing, e.g., ZIP files)
-   **assistant_enabled**: Boolean (Feature flag for AI assistant)
-   **is_starred**: Boolean
-   **created_by_id**: Foreign Key to `User`
-   **metadata**: JSONB (Stores miscellaneous metadata, including external uploader details via an `uploader_info` key, nullable)
-   **created_at**: DateTime
-   **updated_at**: DateTime

**Relations:** Belongs to one Organization and one optional Folder. Has many DocumentVersions, ShareLinks, and Views.

### 6. DocumentVersion

Enables version control for a `Document`. Each version tracks a specific file state.

-   **id**: ULID, Primary Key
-   **document_id**: Foreign Key to `Document`
-   **version_number**: Integer (e.g., 1, 2, 3)
-   **storage_key**: String (Path to the processed file, e.g., a PDF in MinIO)
-   **original_storage_key**: String (Path to the original uploaded file)
-   **content_type**: String (MIME type of the original file)
-   **type**: String (e.g., 'pdf', 'docx')
-   **storage_type**: String (e.g., 'MINIO', 'FILESYSTEM')
-   **file_size**: BigInt (in bytes)
-   **num_pages**: Integer (Nullable)
-   **length**: Integer (Nullable, duration in seconds for video/audio)
-   **is_primary**: Boolean (Indicates if this is the current, active version)
-   **is_vertical**: Boolean (Rendering hint for portrait vs. landscape)
-   **has_pages**: Boolean (Indicates if page images were successfully generated)
-   **created_at**: DateTime
-   **updated_at**: DateTime

**Relations:** Belongs to one Document. Has many DocumentPages.

### 7. DocumentPage

Represents a single page of a processed document, typically stored as an image for efficient viewing.

-   **id**: ULID, Primary Key
-   **document_version_id**: Foreign Key to `DocumentVersion`
-   **page_number**: Integer
-   **storage_key**: String (Path to the page image file in storage)
-   **storage_type**: String (e.g., 'MINIO', 'FILESYSTEM')
-   **page_links**: JSONB (Stores hyperlink data and coordinates)
-   **metadata**: JSONB (Stores original dimensions, scale factor, etc.)
-   **created_at**: DateTime
-   **updated_at**: DateTime

**Relations:** Belongs to one DocumentVersion.

### 8. ShareLink

A secure, configurable link for sharing a `Document` or `Dataroom`.

-   **id**: ULID, Primary Key
-   **document_id**: Foreign Key to `Document` (Nullable)
-   **dataroom_id**: Foreign Key to `Dataroom` (Nullable)
-   **created_by_id**: Foreign Key to `User`
-   **name**: String (Optional, for internal identification)
-   **slug**: String, Unique (The public part of the URL)
-   **expires_at**: DateTime (Nullable)
-   **password**: String (Encrypted, Nullable)
-   **requires_email**: Boolean
-   **requires_email_verification**: Boolean
-   **allow_download**: Boolean
-   **enable_watermark**: Boolean
-   **watermark_text**: String (Can be blank, supports template variables like `{{email}}`)
-   **receive_email_notification**: Boolean
-   **is_active**: Boolean
-   **created_at**: DateTime
-   **updated_at**: DateTime

**Relations:** Belongs to one Document or Dataroom. Has many Views.

### 9. EmailVerificationToken

A temporary, single-use token to verify a viewer's email address for a share link.

-   **id**: ULID, Primary Key
-   **share_link_id**: Foreign Key to `ShareLink`
-   **email**: String
-   **token**: String, Unique
-   **expires_at**: DateTime
-   **created_at**: DateTime

**Relations:** Belongs to one ShareLink.

### 10. PreviewSession

A temporary, single-use session for a user to preview a share link, bypassing its security settings.

-   **id**: ULID, Primary Key
-   **share_link_id**: Foreign Key to `ShareLink`
-   **user_id**: Foreign Key to `User`
-   **token**: String, Unique
-   **expires_at**: DateTime
-   **created_at**: DateTime
-   **updated_at**: DateTime

**Relations:** Belongs to one ShareLink and one User.

### 11. ShareLinkTemplate

A reusable template for `ShareLink` configurations, allowing teams to quickly create links with consistent security settings.

-   **id**: ULID, Primary Key
-   **organization_id**: Foreign Key to `Organization`
-   **name**: String (e.g., "Secure Investor Link", "Internal Review")
-   **is_default**: Boolean (Indicates if this is the default template for new links)
-   **expires_in_days**: Integer (Nullable, e.g., 30 for a link that expires 30 days from creation)
-   **requires_password**: Boolean
-   **requires_email**: Boolean
-   **requires_email_verification**: Boolean
-   **allow_download**: Boolean
-   **enable_watermark**: Boolean
-   **watermark_text**: String (Can be blank, supports template variables like `{{email}}`)
-   **receive_email_notification**: Boolean
-   **created_at**: DateTime
-   **updated_at**: DateTime

**Relations:** Belongs to one Organization.

### 12. ViewSession

Records an instance of a `ShareLink` being accessed. This is the core of the analytics engine.

-   **id**: ULID, Primary Key
-   **share_link_id**: Foreign Key to `ShareLink`
-   **viewer_id**: Foreign Key to `Viewer` (Nullable, for identified viewers)
-   **viewer_email**: String (If captured but not yet a `Viewer` record)
-   **ip_address**: String (IP address of the viewer)
-   **user_agent**: String (User agent string of the viewer's browser)
-   **country**: String (Country derived from GeoIP lookup)
-   **city**: String (City derived from GeoIP lookup)
-   **latitude**: Float (Latitude from GeoIP)
-   **longitude**: Float (Longitude from GeoIP)
-   **duration_seconds**: Integer
-   **completion_rate**: Float (0.0 to 1.0)
-   **downloaded_at**: DateTime (Nullable, timestamp of first download)
-   **viewed_at**: DateTime

**Relations:** Belongs to one ShareLink and one optional Viewer. Has many PageViews.

### 13. PageView

Records a granular page view event within a single viewing session (`ViewSession`).

-   **id**: ULID, Primary Key
-   **view_session_id**: Foreign Key to `ViewSession`
-   **dataroom_visit_id**: Foreign Key to `DataroomVisit` (Nullable)
-   **page_number**: Integer
-   **duration_seconds**: Integer
-   **created_at**: DateTime

**Relations:** Belongs to one ViewSession.

### 14. Viewer

Represents an external, non-team member who has accessed a shared link and has been identified (e.g., via email verification).

---

## Automation Models

### 15. AutomationDestination

Destination endpoint that receives automation notifications.

-   **id**: ULID, Primary Key
-   **organization_id**: Foreign Key to `Organization`
-   **created_by_id**: Foreign Key to `User`
-   **name**: String
-   **destination_type**: String (`webhook | slack | wechat | feishu | discord`)
-   **endpoint_url**: URL
-   **http_method**: String (`POST | PUT`)
-   **headers**: JSONB
-   **signing_secret**: String (encrypted, nullable)
-   **is_active**: Boolean
-   **created_at**: DateTime
-   **updated_at**: DateTime

### 16. AutomationRule

Rule that subscribes to events and routes to destinations.

-   **id**: ULID, Primary Key
-   **organization_id**: Foreign Key to `Organization`
-   **created_by_id**: Foreign Key to `User`
-   **name**: String
-   **is_active**: Boolean
-   **scope_type**: String (`global | share_link | dataroom`)
-   **share_link_id**: Foreign Key to `ShareLink` (nullable)
-   **dataroom_id**: Foreign Key to `Dataroom` (nullable)
-   **subscribed_events**: JSONB list
-   **actions**: JSONB list
-   **created_at**: DateTime
-   **updated_at**: DateTime

Supported V1 events include:
-   `document_viewed`
-   `dataroom_opened`
-   `document_downloaded`
-   `email_identified`
-   `file_request_uploaded` (global scope only)

### 17. AutomationDelivery

Per-attempt delivery log for a matched rule/destination pair.

-   **id**: ULID, Primary Key
-   **organization_id**: Foreign Key to `Organization`
-   **rule_id**: Foreign Key to `AutomationRule`
-   **destination_id**: Foreign Key to `AutomationDestination`
-   **event_type**: String
-   **payload**: JSONB
-   **status**: String (`pending | success | failed | dead_letter`)
-   **response_code**: Integer (nullable)
-   **response_body_excerpt**: Text
-   **attempt_count**: Integer
-   **next_retry_at**: DateTime (nullable)
-   **delivered_at**: DateTime (nullable)
-   **idempotency_key**: String
-   **created_at**: DateTime
-   **updated_at**: DateTime

### 18. AutomationAssignment

Assignment record for action-layer workflows.

-   **id**: ULID, Primary Key
-   **organization_id**: Foreign Key to `Organization`
-   **delivery_id**: Foreign Key to `AutomationDelivery`
-   **assigned_user_id**: Foreign Key to `User`
-   **assigned_by_rule_id**: Foreign Key to `AutomationRule`
-   **status**: String (`open | acknowledged | closed`)
-   **created_at**: DateTime
-   **updated_at**: DateTime

-   **id**: ULID, Primary Key
-   **organization_id**: Foreign Key to `Organization`
-   **email**: String
-   **created_at**: DateTime

**Relations:** Belongs to an Organization, has many Views. Unique on (organization_id, email).

---

## File Request Models (`filerequests` app)

### 15. FileRequest

Represents a secure, shareable link for collecting files from external parties.

-   **id**: ULID, Primary Key
-   **folder_id**: Foreign Key to `Folder`
-   **created_by_id**: Foreign Key to `User`
-   **name**: String
-   **slug**: String, Unique
-   **is_active**: Boolean
-   **expires_at**: DateTime (nullable)
-   **max_file_size**: BigInt (nullable, in bytes)
-   **allowed_file_types**: JSONB (nullable, list of extensions)
-   **created_at**: DateTime
-   **updated_at**: DateTime

**Relations:** Belongs to one Folder and one User.

---

## Cloud Integration Models (`cloudfiles` app)

### CloudConnection

Stores user-specific authorization tokens for a cloud provider.

-   **id**: ULID, Primary Key
-   **user_id**: Foreign Key to `User`
-   **provider**: String (e.g., 'dropbox', 'google_drive', 'nextcloud')
-   **email**: String (The email associated with the cloud account, Nullable)
-   **access_token**: String (Encrypted, stores the OAuth2 access token)
-   **refresh_token**: String (Encrypted, nullable, stores the OAuth2 refresh token)
-   **expires_at**: DateTime (Nullable, for tokens that expire)
-   **created_at**: DateTime
-   **updated_at**: DateTime

**Relations:** Belongs to one User. Unique on (`user_id`, `provider`).

---

## V2.0: Dataroom Models

These models introduce the concept of a `Dataroom` for sharing collections of documents. Note that `DataroomFolder` is distinct from the general-purpose `Folder` model and is scoped exclusively to a single `Dataroom`.

### 16. Dataroom

A container for organizing and sharing a collection of documents and folders.

-   **id**: ULID, Primary Key
-   **organization_id**: Foreign Key to `Organization`
-   **name**: String
-   **created_by_id**: Foreign Key to `User`
-   **created_at**: DateTime
-   **updated_at**: DateTime

**Relations:** Belongs to one Organization. Has many DataroomDocuments, DataroomFolders, and ShareLinks.

### 17. DataroomFolder

A folder within a `Dataroom` to create a hierarchical structure.

-   **id**: ULID, Primary Key
-   **dataroom_id**: Foreign Key to `Dataroom`
-   **parent_id**: Foreign Key to `DataroomFolder` (Self-referencing, Nullable for root)
-   **name**: String
-   **created_at**: DateTime
-   **updated_at**: DateTime

**Relations:** Belongs to one Dataroom.

### 18. DataroomDocument

A linking table to place a `Document` within a Dataroom's structure.

-   **id**: ULID, Primary Key
-   **dataroom_id**: Foreign Key to `Dataroom`
-   **document_id**: Foreign Key to `Document`
-   **folder_id**: Foreign Key to `DataroomFolder` (Nullable, for items in subfolders)
-   **name**: String (blank=True)
-   **created_at**: DateTime
-   **updated_at**: DateTime

**Relations:** Links a Document to a Dataroom and an optional DataroomFolder. Unique on (`dataroom_id`, `document_id`, `folder_id`).
