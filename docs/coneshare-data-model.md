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
-   **avatar_url**: String (Nullable, URL to the user's profile image)
-   **role**: String (e.g., 'admin', 'member') - Role within the Organization.
-   **created_at**: DateTime

**Relations:** Belongs to one Organization, can be in many UserGroups.

**Django Implementation Note:**
This model will be implemented as a custom Django User Model by inheriting from `django.contrib.auth.models.AbstractUser`. This is the recommended best practice for new Django projects.

**Why this approach?**
-   **Performance:** It stores all user data in a single database table, which is more efficient than the older `UserProfile` pattern that requires a `JOIN` for every query.
-   **Simplicity:** All fields are accessible directly from the user object (e.g., `request.user.avatar_url`).

**Key Implementation Steps:**
1.  Create a custom `User` model that inherits from `AbstractUser`.
2.  Add custom fields like `avatar_url` and the `organization` foreign key directly to this model.
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
-   **description**: String (Nullable)
-   **status**: String (e.g., 'uploading', 'processing', 'ready', 'error')
-   **storage_key**: String (Path to the primary version's processed file)
-   **original_storage_key**: String (Path to the primary version's original file)
-   **type**: String (e.g., 'pdf', 'sheet', 'slides')
-   **content_type**: String (MIME type of the primary version's file)
-   **num_pages**: Integer (Nullable, from the primary version)
-   **download_only**: Boolean (If true, the file bypasses processing, e.g., ZIP files)
-   **assistant_enabled**: Boolean (Feature flag for AI assistant)
-   **created_by_id**: Foreign Key to `User`
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
-   **password_hash**: String (Nullable)
-   **requires_email_verification**: Boolean
-   **allow_download**: Boolean
-   **enable_watermark**: Boolean
-   **is_archived**: Boolean
-   **created_at**: DateTime
-   **updated_at**: DateTime

**Relations:** Belongs to one Document or Dataroom. Has many Views.

### 9. ShareLinkPreset

A reusable template for `ShareLink` configurations, allowing teams to quickly create links with consistent security settings.

-   **id**: ULID, Primary Key
-   **organization_id**: Foreign Key to `Organization`
-   **name**: String (e.g., "Secure Investor Link", "Internal Review")
-   **is_default**: Boolean (Indicates if this is the default preset for new links)
-   **expires_in_days**: Integer (Nullable, e.g., 30 for a link that expires 30 days from creation)
-   **requires_password**: Boolean
-   **requires_email_verification**: Boolean
-   **allow_download**: Boolean
-   **enable_watermark**: Boolean
-   **created_at**: DateTime
-   **updated_at**: DateTime

**Relations:** Belongs to one Organization.

### 10. View

Records an instance of a `ShareLink` being accessed. This is the core of the analytics engine.

-   **id**: ULID, Primary Key
-   **share_link_id**: Foreign Key to `ShareLink`
-   **viewer_id**: Foreign Key to `Viewer` (Nullable, for identified viewers)
-   **viewer_email**: String (If captured but not yet a `Viewer` record)
-   **duration_seconds**: Integer
-   **completion_rate**: Float (0.0 to 1.0)
-   **viewed_at**: DateTime

**Relations:** Belongs to one ShareLink and one optional Viewer.

### 11. Viewer

Represents an external, non-team member who has accessed a shared link and has been identified (e.g., via email verification).

-   **id**: ULID, Primary Key
-   **organization_id**: Foreign Key to `Organization`
-   **email**: String
-   **created_at**: DateTime

**Relations:** Belongs to an Organization, has many Views. Unique on (organization_id, email).

---

## V2.0: Dataroom Models

These models introduce the concept of a `Dataroom` for sharing collections of documents. Note that `DataroomFolder` is distinct from the general-purpose `Folder` model and is scoped exclusively to a single `Dataroom`.

### 12. Dataroom

A container for organizing and sharing a collection of documents and folders.

-   **id**: ULID, Primary Key
-   **organization_id**: Foreign Key to `Organization`
-   **name**: String
-   **description**: String (Nullable)
-   **created_by_id**: Foreign Key to `User`
-   **created_at**: DateTime
-   **updated_at**: DateTime

**Relations:** Belongs to one Organization. Has many DataroomDocuments, DataroomFolders, and ShareLinks.

### 13. DataroomFolder

A folder within a `Dataroom` to create a hierarchical structure.

-   **id**: ULID, Primary Key
-   **dataroom_id**: Foreign Key to `Dataroom`
-   **parent_folder_id**: Foreign Key to `DataroomFolder` (Self-referencing, Nullable for root)
-   **name**: String
-   **order_index**: Integer (for custom sorting)
-   **created_at**: DateTime

**Relations:** Belongs to one Dataroom.

### 14. DataroomDocument

A linking table to place a `Document` within a Dataroom's structure.

-   **id**: ULID, Primary Key
-   **dataroom_id**: Foreign Key to `Dataroom`
-   **document_id**: Foreign Key to `Document`
-   **folder_id**: Foreign Key to `DataroomFolder` (Nullable, for items in subfolders)
-   **order_index**: Integer (for custom sorting)

**Relations:** Links a Document to a Dataroom and an optional DataroomFolder.

### 15. DocumentUpload

A log entry created when a new document is uploaded by an external viewer via a `ShareLink`. This is critical for tracking contributions in a deal room context.

-   **id**: ULID, Primary Key
-   **document_id**: Foreign Key to `Document` (the newly created document)
-   **organization_id**: Foreign Key to `Organization`
-   **viewer_id**: Foreign Key to `Viewer` (Nullable)
-   **view_id**: Foreign Key to `View` (Nullable)
-   **share_link_id**: Foreign Key to `ShareLink`
-   **dataroom_id**: Foreign Key to `Dataroom` (Nullable)
-   **original_filename**: String
-   **file_size**: BigInt
-   **mime_type**: String
-   **uploaded_at**: DateTime

**Relations:** Belongs to a Document, ShareLink, and Organization. Can optionally link to a Viewer, View, and Dataroom.

---

## Permissions and Audit Models (V2.0/Future)

### 16. DataroomPermission

Assigns permissions for a `UserGroup` on a specific `DataroomDocument` or `DataroomFolder`.

-   **id**: ULID, Primary Key
-   **user_group_id**: Foreign Key to `UserGroup`
-   **dataroom_id**: Foreign Key to `Dataroom`
-   **document_id**: Foreign Key to `Document` (Nullable)
-   **folder_id**: Foreign Key to `DataroomFolder` (Nullable)
-   **permission_level**: String (e.g., 'view', 'download')

### 17. AuditLog

Records significant events in the system for administrative review.

-   **id**: ULID, Primary Key
-   **organization_id**: Foreign Key to `Organization`
-   **user_id**: Foreign Key to `User` (Who performed the action)
-   **action**: String (e.g., 'user.login', 'document.create', 'permission.update')
-   **details**: JSONB (Contextual data about the event)
-   **created_at**: DateTime
