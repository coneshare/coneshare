# Archive Dataroom Feature Plan

## Overview
Implement an "Archive Dataroom" feature that transitions a dataroom into a strictly read-only state. This is a permanent, one-way action meant for the end-of-lifecycle of a project or deal. Once archived, no further write operations can be performed on the dataroom, its contents, or its associated interactions (like Q&A).

## 1. Backend Updates

### 1.1 Data Model
* **File:** `backend/datarooms/models.py`
* **Changes:** Add a `status` field to the `Dataroom` model.
  ```python
  STATUS_ACTIVE = 'active'
  STATUS_ARCHIVED = 'archived'
  STATUS_CHOICES = [
      (STATUS_ACTIVE, 'Active'),
      (STATUS_ARCHIVED, 'Archived'),
  ]
  status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
  ```
* **Migration:** Generate and run the Django migration.

### 1.2 Dataroom API Restrictions
* **Files:** `backend/datarooms/views.py`, `backend/datarooms/permissions.py` (if applicable).
* **Changes:** Block all write operations for archived datarooms.
  * `DataroomViewSet`: Block `PUT`, `PATCH`, `DELETE` and custom modifying actions (like `add_files`, `add_folders`, `reorder_items`). *Note: Ensure the Archive action itself is still permitted via a custom endpoint like `POST /api/datarooms/<id>/archive/`.*
  * `DataroomFolderViewSet`: Block creating, renaming, deleting folders.
  * `DataroomDocumentViewSet`: Block renaming, removing documents.

### 1.3 Share Link & Q&A API Restrictions
* **File:** `backend/sharelinks/views.py`
* **Changes:**
  * **Freeze Q&A:** Update `ShareLinkQnAThreadListCreateView` and `ShareLinkQnAMessageListCreateView` to block `POST` requests if the associated dataroom is archived. Existing threads remain readable, but no new questions or replies can be added.
  * **Freeze Share Links:** Prevent the creation of new Share Links or modification of existing Share Links for an archived dataroom.

## 2. Frontend Updates

### 2.1 Owner Dashboard & Editor
* **Dataroom List:** Add an "Archived" badge or visual indicator next to archived datarooms.
* **Context Menu:** Add an "Archive Dataroom" option. Because it is a one-way action, clicking this must trigger a strict confirmation modal: *"Are you sure? Archiving is permanent and will lock this dataroom and all its share links from any future edits or interactions."*
* **Dataroom Editor UI:** For archived datarooms, conditionally hide or disable:
  * "Add Files" / "Upload" buttons.
  * "New Folder" buttons.
  * Drag-and-drop reordering.
  * Edit/Rename and Delete context menu options for documents and folders.
  * General settings edits (branding, names).

### 2.2 Viewer Experience (Share Links)
* **Q&A Panel:** If a viewer accesses an archived dataroom via a share link, the UI should hide the "New Question" button and reply input boxes in the Q&A panel. A small notice should indicate: *"This dataroom is archived. Q&A is closed."*

## 3. Testing
* **Backend Tests (`backend/tests/`):** Write assertions verifying that attempting to modify an archived dataroom or its Q&A threads returns a `403 Forbidden` or `400 Bad Request`.
* **Frontend Tests (`frontend/src/tests/`):** Update React Testing Library tests to verify that write-related UI elements are disabled or removed when `status: 'archived'` is present in the mock data.
