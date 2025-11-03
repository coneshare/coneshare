# Coneshare: Dataroom Feature Implementation Plan

This document outlines the implementation plan for the Dataroom feature in Coneshare. The feature will allow users to create collections of documents and folders, share them via a single link, and configure granular, per-item access settings for that link.

The plan also incorporates foundational data models for future enhancements, including audit logging and a Q&A system for document collaboration.

---

## Part 1: Data Model Design

The data model will be implemented in the new `dataroom` application. The following models will be created in `backend/dataroom/models.py`, with `ShareLink` being modified in `backend/documents/models.py` to establish the relationship.

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

## Part 2: Implementation Plan

The feature will be built in three phases.

### Phase 1: Backend API for Dataroom Management

1.  **Create Dataroom CRUD API**:
    -   Implement serializers for `Dataroom` and related models in `backend/dataroom/serializers.py`.
    -   Create a `DataroomViewSet` in `backend/dataroom/views.py` to handle CRUD operations.
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
    2.  Recursively iterate through all child items.
    3.  Only include documents in the ZIP archive for which `allow_download` is `True`.

### 2. Other Identified Corner Cases

-   **Recursive Settings Application:** When a user changes a setting on a folder (e.g., makes it invisible), should that change cascade to all items within that folder?
    -   **Plan:** The settings update API should support an optional `recursive=true` parameter to apply the setting change to the folder and all its descendants. By default, it should be non-recursive.

-   **Empty Visible Folders:** If a folder is `is_visible=True` but all of its immediate children are `is_visible=False`, the folder should still appear in the dataroom hierarchy, but will be displayed as empty to the viewer. This is correct and expected behavior.

-   **Moving Content:** When an item is moved to a different location within the dataroom, its granular permissions (`ShareLinkDataroomSetting`) are tied to the item itself, not its location. All settings will persist with the item after it is moved.

-   **Deleting Content from Dataroom:** When a `DataroomDocument` or `DataroomFolder` is removed from a dataroom, the `on_delete=models.CASCADE` on the `ShareLinkDataroomSetting` model ensures that all associated granular settings are automatically deleted.
