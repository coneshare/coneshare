# Coneshare: Dataroom Feature Implementation Plan

## Strategy refs
- [Coneshare Roadmap](../strategy/coneshare-roadmap.md)
- [Coneshare Technology Stack](../strategy/coneshare-techstack.md)
- [Coneshare Data Model](../coneshare-data-model.md)
- [Coneshare Dataroom Ownership and Department Scope](../strategy/dataroom-ownership-and-department-scope.md)
- [Coneshare Share Link Q&A](./share-link-qna.md)

## Out of scope
- Department ownership model changes (departments remain scoping/filtering constructs).
- Re-architecture of share link core beyond dataroom compatibility requirements.
- Production-grade audit workflows beyond foundational schema prep.
- Q&A workflows are covered separately as a share-link scoped feature; see [Coneshare Share Link Q&A](./share-link-qna.md).
- Non-dataroom sharing feature redesigns unrelated to this implementation plan.

## Design decisions
- Decision: Extend existing `ShareLink` to support dataroom targets via polymorphic relation.
  Rationale: Reuses existing secure link infrastructure for dataroom sharing.
  Tradeoff: Requires strict validation to keep link target integrity clear.
- Decision: Keep per-item controls in `ShareLinkDataroomSetting` instead of embedding in documents/folders.
  Rationale: Permissions are link-specific and need per-link isolation.
  Tradeoff: Adds join complexity for public view/download flows.
- Decision: Apply folder-level changes recursively by default for visibility/download/watermark settings.
  Rationale: Matches operator expectations and reduces repetitive manual updates.
  Tradeoff: Bulk updates must be transaction-safe and carefully validated.

This document outlines the implementation plan for the Dataroom feature in Coneshare. The feature will allow users to create collections of documents and folders, share them via a single link, and configure granular, per-item access settings for that link.

The plan also incorporates foundational data models for future enhancements, including audit logging and a Q&A system for document collaboration.

---

## Part 1: Data Model Design

The data model is implemented in the `datarooms` application. The canonical models live in `backend/datarooms/models.py`, and dataroom sharing is integrated through `sharelinks` models and APIs.

### 1. Modified Models

#### `ShareLink`
The `ShareLink` model will be modified to support a polymorphic relationship, allowing it to point to either a `Document` or a `Dataroom`.

-   `document`: Foreign Key to `Document` (now **nullable**)
-   `dataroom`: **New** Foreign Key to `Dataroom` (**nullable**)

### 2. New Dataroom Models

#### `Dataroom`
The primary container for a collection of shared content.
-   `organization`: Foreign Key to `Organization`
-   `name`: String
-   `created_by`: Foreign Key to `User`

#### `DataroomFolder`
Represents a folder within a Dataroom's custom hierarchy. This is distinct from the main `Folder` model.
-   `dataroom`: Foreign Key to `Dataroom`
-   `parent`: Self-referencing Foreign Key to `DataroomFolder` (nullable)
-   `name`: String

#### `DataroomDocument`
A linking table that places a `Document` from the main library into a `Dataroom`.
-   `dataroom`: Foreign Key to `Dataroom`
-   `document`: Foreign Key to `Document`
-   `folder`: Foreign Key to `DataroomFolder` (nullable)

#### `ShareLinkDataroomSetting`
Stores the per-item, per-link settings. This is the core of the granular permissions feature.
-   `share_link`: Foreign Key to `ShareLink`
-   `dataroom_document`: Foreign Key to `DataroomDocument` (nullable)
-   `dataroom_folder`: Foreign Key to `DataroomFolder` (nullable)
-   `is_visible`: Boolean
-   `allow_download`: Boolean
-   `enable_watermark`: Boolean

### 3. Models for Future Features

These models will be added to the schema to prepare for future development without requiring significant database changes later.

#### `AuditLog`
Records significant events in the system for administrative review.
-   `organization`: Foreign Key to `Organization`
-   `user`: Foreign Key to `User` (nullable, for system actions)
-   `action`: String (e.g., 'dataroom.create', 'document.viewed')
-   `details`: JSONField
-   `related_document`: Foreign Key to `Document` (nullable)
-   `related_dataroom`: Foreign Key to `Dataroom` (nullable)

#### `QnAThread` & `QnAMessage`
Historical note: Q&A should now be treated as a share-link scoped feature that supports both single-document share links and dataroom share links. The current proposed model and permission rules live in [Coneshare Share Link Q&A](./share-link-qna.md). The older dataroom-only shape below is retained as background context, not as the implementation target.

Enables discussions between data room owners and external viewers about specific documents.
-   **`QnAThread`**:
    -   `dataroom`: Foreign Key to `Dataroom`
    -   `document`: Foreign Key to `Document`
    -   `subject`: TextField
    -   `status`: String ('open' or 'closed')
    -   `created_by_user`: Foreign Key to `User` (nullable)
    -   `created_by_viewer`: Foreign Key to `Viewer` (nullable)
-   **`QnAMessage`**:
    -   `thread`: Foreign Key to `QnAThread`
    -   `message`: TextField
    -   `sent_by_user`: Foreign Key to `User` (nullable)
    -   `sent_by_viewer`: Foreign Key to `Viewer` (nullable)

---

## Part 2: Implementation Plan (Historical)

Status note:
- The phases below describe the original execution plan and are now largely completed.
- Current implementation status is tracked in Part 6 and Part 7.

The feature will be built in three phases.

### Phase 1: Backend API for Dataroom Management

1.  **Create Dataroom CRUD API**:
    -   Implement serializers for `Dataroom` and related models in `backend/datarooms/serializers.py`.
    -   Create a `DataroomViewSet` in `backend/datarooms/views.py` to handle CRUD operations.
2.  **Implement Content Management API**:
    -   Add a custom action to the `DataroomViewSet` (e.g., `POST /api/v1/datarooms/{id}/add-content/`) that accepts a list of existing `document_ids` and `folder_ids` to populate the dataroom.
    -   Implement endpoints for managing the dataroom's internal structure (creating/renaming `DataroomFolder`, removing items).

### Phase 2: Backend API for Dataroom Sharing

1.  **Extend Share Link API**:
    -   Modify the `ShareLinkSerializer` to accept a `dataroom_id`.
    -   When a share link is created for a dataroom, the backend will automatically generate `ShareLinkDataroomSetting` records for all items, inheriting defaults from the link itself.
2.  **Implement Per-Item Settings API**:
    -   Create a new endpoint (e.g., `PATCH /api/v1/share-links/{id}/dataroom-settings/`) to bulk-update the `is_visible`, `allow_download`, and `enable_watermark` fields for items in a specific dataroom share link.
3.  **Create Public Dataroom Data Endpoint**:
    -   Implement a new public API view that performs security checks on the `ShareLink` (password, expiry).
    -   If successful, it will return a hierarchical JSON structure of the dataroom's content, filtered by `is_visible=True` and including the specific download/watermark settings for each item.

### Phase 3: Frontend for Dataroom Management & Sharing

1.  **Dataroom Pages**:
    -   Create a new page to list all datarooms.
    -   Create a dataroom detail page with a file explorer UI to manage its contents.
    -   Implement an "Add Content" modal to select existing documents/folders from the main library.
2.  **Sharing UI**:
    -   On the dataroom detail page, add a "Create Link" button that reuses the existing `LinkSheet` component, now configured for datarooms.
    -   Create a new UI for managing the per-item settings (`visible`, `download`, `watermark`) for a generated share link.
3.  **Public Viewer Page**:
    -   Create a new `DataroomViewerPage` component.
    -   This page will fetch data from the public dataroom data endpoint and render the folder/file hierarchy.
    -   Clicking a document will open it in the existing `PreviewViewer` component, respecting the per-item settings (e.g., applying a watermark if enabled for that specific file in that specific link).

---

## Part 4: Permission Logic and Corner Cases

This section outlines the rules for handling potential conflicts and edge cases in the granular permission settings for dataroom share links.

### 1. Core Principles

#### Visibility Conflict (Invisible Folder vs. Visible Item)
-   **Principle:** Invisibility is inherited and absolute. An item cannot be visible if its parent container is invisible. A viewer must have a visible path through the folder hierarchy to reach any content.
-   **Implementation:** The public data endpoint must enforce this rule. If a `DataroomFolder` is set to `is_visible=False`, the API will exclude that folder and all of its descendants from the response, regardless of their individual visibility settings.

#### Watermark Scope
-   **Principle:** Watermarking is a property applied to a file, not a folder. The `enable_watermark` setting on a folder serves as a bulk-management tool for the link owner, but the final check during rendering or download happens at the document level.
-   **Implementation:** The dynamic watermarking endpoints will only check the `enable_watermark` setting of the specific `ShareLinkDataroomSetting` associated with the requested `DataroomDocument`.

#### Download Conflict (Downloadable Folder vs. Non-Downloadable Item)
-   **Principle:** The most specific permission wins. A viewer can initiate a "download folder" action, but the resulting archive will only contain the content they are explicitly permitted to download.
-   **Implementation:** The backend logic for a "Download Folder as ZIP" feature must:
    1.  Deny the request if the root folder being requested has `allow_download=False`.
    2.  Recursively iterate through all child items (documents and subfolders).
    3.  For each item, check its individual `allow_download` setting.
    4.  Only include documents in the ZIP archive for which `allow_download` is `True`.
    5.  Empty folders will be created in the ZIP structure, but the final archive will only contain the permitted files.

### 2. Other Identified Corner Cases

-   **Recursive Settings Application:** When a user changes a setting on a folder (e.g., makes it invisible), should that change cascade to all items within that folder?
    -   **Plan:** The settings update is applied recursively by default. When a user changes a setting on a folder from the UI, the change cascades to the folder and all of its descendants. The frontend calculates the full list of affected items and sends their IDs to the backend API, which processes them in a single transaction.

-   **Empty Visible Folders:** If a folder is `is_visible=True` but all of its immediate children are `is_visible=False`, the folder should still appear in the dataroom hierarchy, but will be displayed as empty to the viewer. This is correct and expected behavior.

-   **Moving Content:** When an item is moved to a different location within the dataroom, its granular permissions (`ShareLinkDataroomSetting`) are tied to the item itself, not its location. All settings will persist with the item after it is moved.

-   **Deleting Content from Dataroom:** When a `DataroomDocument` or `DataroomFolder` is removed from a dataroom, the `on_delete=models.CASCADE` on the `ShareLinkDataroomSetting` model ensures that all associated granular settings are automatically deleted.

---

## Part 5: Folder Download Implementation Details

This part implement the "Download Folder" feature for public dataroom views, including support for watermarking. The implementation will be divided into backend and frontend tasks.

Part 1: Backend Implementation

 1 Create a New API Endpoint
    • A new endpoint will be created to handle folder download requests: GET /api/v1/links/<slug:slug>/download-folder/<str:folder_id>/. This endpoint will generate and stream a ZIP archive.
 2 Refactor Watermarking Logic
    • The PDF watermarking logic currently inside WatermarkedFileDownloadView will be refactored into a reusable service function. This function will accept a document version and watermark text, and
      return a file-like object (BytesIO) containing the watermarked PDF. This allows both the existing single-file download view and the new folder download view to use the same logic.
 3 Implement the Folder Download View
    • The new view will perform the following steps: a. Security Checks: It will reuse the existing share link validation logic to check for an active link, expiration, and session authorization
      (password/email). b. Permission Check: It will verify that the requested DataroomFolder has its allow_download setting set to True for this specific share link. If not, it will return a 403
      Forbidden error. c. Recursive Content Gathering: It will recursively traverse the folder structure to find all child documents. For each document, it will check its individual
      ShareLinkDataroomSetting to ensure it is both visible and downloadable. Any non-compliant documents will be skipped. d. In-Memory ZIP Creation: Using Python's zipfile and io.BytesIO, it will create
      a ZIP archive in memory. e. File Processing Loop: For each valid document to be included: *   If enable_watermark is True for the document, it will call the refactored watermarking service to
      generate a watermarked PDF. *   Otherwise, it will fetch the document's original file from storage. *   The file (either original or watermarked) will be added to the ZIP archive with its correct
      relative path. f. Streaming Response: The final in-memory ZIP archive will be streamed back to the user as an HttpResponse with the appropriate Content-Type (application/zip) and Content-Disposition
      headers to trigger a browser download.

Part 2: Frontend Implementation

 1 Update the Dataroom Viewer UI
    • Use an always-visible actions ("three dots") button for each row in `DataroomViewer.jsx` (no hover-only reveal).
    • Actions include:
      - `View` (always shown)
      - `Download` (shown only when `allow_download` is `True` for the item)
 2 Create a New API Service Function
    • A new function, downloadDataroomFolder(slug, folderId), will be added to frontend/src/services/api.js.
    • This function will make a GET request to the new backend endpoint and must be configured to handle a blob response type instead of JSON.
 3 Implement the Download Handler
    • The onClick handler for the new "Download" button will call the API service function.
    • Upon receiving the blob response, it will use a standard browser technique to trigger a file download: create an object URL from the blob, assign it to a temporary <a> element with a download
      attribute, and programmatically click the link.

---

## Part 6: Current Status Alignment (April 2026)

This section aligns this document with the current codebase so new work can be planned accurately.

- Dataroom backend module exists as `backend/datarooms/` (plural), with active models, serializers, viewsets, routes, and signals.
- Dataroom frontend pages exist in `frontend/src/pages/DataroomsPage.jsx` and `frontend/src/pages/DataroomPage.jsx`.
- Dataroom CRUD, add/remove/move content, share links, public viewing, and folder download API/service plumbing are already present.
- Existing serializers include a known ancestor lookup scalability note (`TODO: N+1 query problem`) in `DataroomFolderSerializer.get_ancestors`.
- This means this document should now be treated as a living implementation + extension plan, not a greenfield build spec.

---

## Part 7: Issue #152 Alignment (Branding, Ordering, UI Optimization)

### Status

- Branding fields and validations are implemented on `Dataroom` (`branding_banner`, `brand_primary_color`, `brand_secondary_color`, `brand_accent_color`).
- Mixed folder/document ordering is implemented via `DataroomItemOrder` (scoped by `dataroom` + `parent_folder`), not per-row `position` fields on `DataroomFolder`/`DataroomDocument`.
- Public dataroom share-link viewer now supports scoped folder loading (`parent_id`) and server-provided breadcrumbs.

### Ongoing Goals

- Add per-dataroom branding (logo + theme colors).
- Add owner-controlled manual ordering for dataroom folders/documents.
- Improve dataroom page scalability and usability for larger datasets.

### 1. Backend Data Model Updates

#### `Dataroom` branding fields

- `branding_banner` (image/file field, nullable)
- `brand_primary_color` (char field, hex format validation)
- `brand_secondary_color` (char field, hex format validation)
- optional `brand_accent_color` (char field, nullable) for near-term extensibility

Design note:
- Keep these fields dataroom-scoped for now, but group naming under `brand_*` to allow future layering with organization branding/custom domains.

#### Manual ordering model

- Use `DataroomItemOrder` rows to represent sibling ordering within one scope:
  - scope key: (`dataroom`, `parent_folder`)
  - target: one of `folder` or `dataroom_document`
  - deterministic rank: `position`
- Keep ordering logic out of `DataroomFolder` and `DataroomDocument` rows.

### 2. Backend API and Permission Updates

- Extend `DataroomSerializer`/`DataroomDetailSerializer` with branding fields.
- Add update validations:
  - color format (`#RRGGBB` / optional `#RRGGBBAA` if approved)
  - logo content type and size limits.
- Use owner-only reorder endpoint:
  - `POST /api/v1/datarooms/{id}/reorder-items/`
- Payload accepts explicit ordered mixed item IDs (`folder` + `document`) scoped to one container level.
- Enforce strict scope checks:
  - all IDs must belong to target dataroom and same parent/folder context.
  - non-owners receive 403.

### 3. Frontend Dataroom UX Updates

#### Branding management

- Add branding controls in dataroom settings/actions:
  - upload/replace/remove logo
  - color inputs/picker with validation preview
- Apply branding as dataroom-level CSS variables in `DataroomPage` and related components.
- Ensure consistent fallback to product default theme when branding fields are unset.

#### Custom ordering UX

- Add drag-and-drop reorder for current folder/root list, with keyboard-accessible fallback controls.
- Persist order through new reorder endpoints.
- Use optimistic update with rollback on API failure.

### 4. UI Performance and Scalability

- Resolve high-impact N+1 patterns (especially folder ancestry path resolution).
- Ensure list rendering avoids unnecessary recomputation/re-render:
  - stable memoization boundaries
  - avoid rebuilding merged item arrays on unrelated state changes
- Add pagination/virtualization strategy for large dataroom content when thresholds are crossed.
- Tighten loading states/skeleton behavior for nested navigation and large folder transitions.

### 5. Test Plan Updates

#### Backend tests

- Branding field validation and persistence.
- Branding update permission checks (owner vs non-owner).
- Reorder endpoint correctness, atomicity, and invalid payload handling.
- Reorder permission and scope validation tests.

#### Frontend tests

- Branding form behavior and themed rendering.
- Reorder interaction and API payload correctness.
- Error rollback behavior for failed reorder operations.
- Large-list render/performance smoke coverage for dataroom content views.

### 6. Delivery Sequence

1. Continue performance hardening for large dataroom trees/scopes.
2. Expand regression coverage for scoped public viewer navigation (`parent_id` + breadcrumbs).
3. Refine reorder UX and failure rollback behavior.
4. Add enterprise controls where roadmap marks gaps (org share policy, broader audit logs).

---

## Part 8: Dataroom Navigation Enhancement (In-page SPA & Collapsible File Tree)

### Implementation Details
- **In-page Single-Page Application (SPA) Transition:** The public dataroom viewer (`DataroomViewer.jsx`) was refactored from opening documents in new tabs to displaying them inline. Selecting a document updates the `dataroom_document_id` in the URL and renders the document viewer inline, preserving user context and avoiding popup blocker restrictions.
- **Collapsible File Tree (`DataroomFileTree.jsx`):** Replacing the previous folder-scoped sidebar, we implemented a full file browser tree anchored to the Dataroom Root (`parentId: null`).
  - Expanding folders fetches children dynamically via collapsible tree nodes.
  - When deep-linking directly to a document, the component automatically expands parent folder paths by comparing node IDs against the active document's `breadcrumbs` hierarchy (`activePathFolderIds`), resulting in an automatic domino-style expansion to reveal and highlight the active document.
- **Stable Navigation Base:** The URL parameter `parent_id` serves as the stable navigation base for the main listing pane, while the sidebar file tree remains anchored at the Dataroom Root level.

---

## Part 9: Dataroom Multi-User Collaboration & Document Access Control

### 1. Multi-User Collaboration Architecture
- **`DataroomCollaborator` Model:** Supports adding internal organization members as co-managers to a Dataroom with a unique `(dataroom, user)` constraint.
- **Collaborator Management Endpoints:**
  - `GET /api/v1/datarooms/{id}/collaborators/`: List active room collaborators.
  - `POST /api/v1/datarooms/{id}/collaborators/`: Add one or more eligible org members as collaborators.
  - `DELETE /api/v1/datarooms/{id}/collaborators/{user_id}/`: Remove a collaborator or allow a collaborator to self-leave.
  - `POST /api/v1/datarooms/{id}/transfer-ownership/`: Transfer primary room ownership to another teammate.
  - `GET /api/v1/datarooms/{id}/eligible-collaborators/`: Query available organization users not yet in the room.

### 2. Document Access Scoping & Permissions
- **Cross-User Scoped Queryset (`get_document_queryset_for_user`):**
  - Standard users can access files they created **or** files inside any active Dataroom where they are an Owner or Collaborator (`dataroomdocument__dataroom__collaborators__user=user` or `dataroomdocument__dataroom__created_by=user`).
  - Org Admins maintain supervisor access across the entire organization.
- **Endpoint Separation:**
  - `GET /api/v1/documents/` (Personal Document Library): Returns only documents created by `request.user` to keep personal libraries strictly private.
  - Detail Read Endpoints (`retrieve`, `status`, `stats`, `view-sessions`, `download`, `preview-data`): Accessible to Dataroom collaborators to inspect preview, download files, and track visitor analytics.
  - Write / Mutation Endpoints (`update`, `destroy`, `promote_version`, `upload_version`): Restricted to the original Document Owner or Org Admin; non-owner collaborators receive `403 Forbidden`.

### 3. Frontend UX & View-Only Controls
- **Document Page View-Only Mode:**
  - Calculates `canManage = isOwner || isAdmin`.
  - Non-owner collaborators viewing another user's document see an `Owner: <Name>` badge.
  - Mutation controls (inline rename, "+ Share" link creation, upload new version, cloud sync, delete) are disabled/omitted.
  - Read actions (Preview, Download, Stats, Analytics) remain fully functional.
  - Breadcrumb trails preserve context back to the originating Dataroom: `Datarooms > [Dataroom Name] > [Folder Name] > [Document Name]`.

---

## Part 10: Dataroom Storage Architecture Evolution (System Storage Vault & Versioning)

### 1. Storage Architecture Evolution (v1 vs. v2)
To decouple Dataroom physical storage from individual personal document libraries and support clean multi-user collaboration, Dataroom storage is evolved via `Dataroom.storage_version`:

- **Legacy v1 (User-Scoped Storage):**
  - Storage path: `Root -> Dataroom Uploads -> <Name> (<Timestamp_Suffix>)`.
  - Stored inside the individual uploader's document library.
  - Retained for backward compatibility with existing Datarooms.

- **Modern v2 (Organization System Storage Vault):**
  - Storage path: `Root -> __datarooms__ -> <dataroom_id>`.
  - Stored inside an organization-wide system vault (`created_by=None`), keeping all users' personal `/documents` libraries 100% clean.
  - Keyed to the immutable `dataroom.id`, eliminating the need to rename physical folders when the Dataroom title changes.
  - Enables instant `O(1)` ownership transfers and single-step room deletion (`__datarooms__/<id>`).

### 2. Compatibility & Strangler Fig Transition Strategy
1. **Zero-Migration Risk:** Existing production Datarooms default to `storage_version=1`. Newly created Datarooms automatically use `storage_version=2`.
2. **Feature Gating:** Multi-user collaboration and ownership transfers operate natively on `v2` Datarooms.
3. **Unified Storage Resolver (`services.get_or_create_dataroom_storage_folder`):** Dynamically resolves either the `v2` System Vault or `v1` legacy path based on `dataroom.storage_version`.
4. **Sunset Plan:** Legacy `v1` branches will be deprecated and safely pruned in future releases as legacy rooms are naturally archived or migrated.


