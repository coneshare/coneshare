# Dataroom Direct Upload Plan

## Overview
Currently, uploading files to a dataroom is a two-step process:
1. Upload files/folders to the user's personal/org library.
2. Add files/folders to the target dataroom using the `add-content` action.

This two-step coordination on the frontend is slow, prone to network failures (which leave orphaned files in the user's library), and creates friction. This plan defines the architecture for uploading files and folders **directly** into a dataroom.

### Target Folder Resolution & Cleanup Behavior
To align with standard user expectations in file management UI (such as Google Drive/Dropbox), uploads will target the **currently active folder context** of the dataroom explorer view:
1. **Dataroom Root**: If the user is at the root level, `destination_folder_id` is set to `null` (or omitted) and files/folders are created at the root level.
2. **Dataroom Subfolder**: If the user has navigated into a subfolder, its `DataroomFolder` ID is passed as `destination_folder_id`.

This navigation-centric target assignment avoids prompt fatigue/extra selection dialogs for the user while providing precise destination control.

### Library Storage & Lifecycle Behavior
- **Under the Hood Placement**: To prevent cluttering the root level of the user's main personal files view, direct uploads to a dataroom will automatically be organized inside a **`Dataroom Uploads`** directory at the root of their library:
  `Dataroom Uploads / <Dataroom-Name> / [Uploaded-Folder-Tree] / file.pdf`
- **Automatic Lifecycle Cleanup**:
  - When a Dataroom is deleted, the backend will clean up all directly uploaded files by deleting the matching standard folder `Dataroom Uploads / <Dataroom-Name>/` in the user's library. This deletes the underlying `Document` and `Folder` records and cascades to free up server storage and quota.
  - Sourced files added via standard library directories (via "Add Content") remain untouched.

---

## 1. Backend Design (Django REST Framework)

To allow direct uploads, we will introduce specific endpoints on the Dataroom viewsets to handle folder structure creation, URL requests, and finalization in a single step.

### A. Ensure Dataroom Folder Paths
- **Endpoint**: `POST /api/v1/datarooms/<dataroom_id>/ensure-paths/`
- **Purpose**: Idempotently create the `DataroomFolder` hierarchy before uploading a folder.
- **Request Body**:
  ```json
  {
    "paths": ["folderA/subB", "folderC"],
    "parent_folder_id": "optional-parent-dataroom-folder-uuid"
  }
  ```
- **Behavior**:
  1. Fetches the `Dataroom` and validates write permissions.
  2. Resolves destination parent `DataroomFolder` (if `parent_folder_id` is supplied).
  3. Inside a transaction (`transaction.atomic()`), recursively creates any missing nested `DataroomFolder` paths.
  4. Prevents name collisions using `_get_unique_folder_name` (e.g. renaming to `folderA (2)`).
  5. Returns a `path_mappings` map (original top-level folder name -> ensured/renamed folder name).

### B. Dataroom Upload Request
- **Endpoint**: `POST /api/v1/datarooms/<dataroom_id>/uploads/request/`
- **Purpose**: Validate storage quotas, resolve destination path folder, generate unique names, and retrieve pre-signed file-server upload URLs.
- **Request Body**:
  ```json
  {
    "file_name": "example.pdf",
    "file_size": 1048576,
    "destination_folder_id": "optional-dataroom-folder-uuid",
    "path": "optional/folder/path/example.pdf"
  }
  ```
- **Behavior**:
  1. Enforces upload size constraints and checks user quota.
  2. Resolves the target `DataroomFolder` where the file belongs (using `destination_folder_id` and extracting nested directories from `path`).
  3. Resolves filename collisions inside the target folder using `_get_unique_dataroom_document_name`.
  4. Requests a secure pre-signed URL from the Go file server.
  5. Returns `upload_url`, `storage_key`, and `unique_name`.

### C. Dataroom Upload Finalize
- **Endpoint**: `POST /api/v1/datarooms/<dataroom_id>/uploads/finalize/`
- **Purpose**: Commit metadata, create database links, and trigger async processing tasks.
- **Request Body**:
  ```json
  {
    "storage_key": "storage-key-uuid",
    "unique_name": "unique-name-uuid",
    "file_size": 1048576,
    "content_type": "application/pdf",
    "destination_folder_id": "optional-dataroom-folder-uuid",
    "path": "optional/folder/path/example.pdf"
  }
  ```
- **Behavior**:
  1. Inside a single database transaction:
     - Creates the underlying standard `documents.Document` and `DocumentVersion` records.
     - Creates a matching `DataroomDocument` record linking the document to the Dataroom and the resolved target `DataroomFolder`.
     - Appends an entry to `DataroomItemOrder` (if `show_file_index` is active) to keep custom order entries correct.
  2. Enqueues the asynchronous background worker tasks to process the file and generate preview pages.
  3. Returns `202 Accepted` along with the serialized `DataroomDocument` metadata.

---

## 2. Frontend Design (Vite + React)

We will implement the direct upload trigger within the Dataroom editor view.

### A. API Service Additions (`frontend/src/services/api.js`)
We will add corresponding service functions:
```javascript
export const ensureDataroomFolderPaths = (dataroomId, paths, parentFolderId = null) =>
  api.post(`/datarooms/${dataroomId}/ensure-paths/`, { paths, parent_folder_id: parentFolderId });

export const uploadDataroomDocument = async (dataroomId, file, destinationFolderId, path, onProgress) => {
  // Step 1: Request upload pre-signed URL
  const requestResponse = await api.post(`/datarooms/${dataroomId}/uploads/request/`, {
    file_name: file.name,
    file_size: file.size,
    destination_folder_id: destinationFolderId || null,
    path: path || null
  });
  
  const { upload_url, storage_key, unique_name } = requestResponse.data;

  // Step 2: Upload raw binary to pre-signed URL (offloaded)
  await axios.put(upload_url, file, {
    headers: { 'Content-Type': file.type },
    onUploadProgress: (e) => {
      const pct = Math.round((e.loaded * 100) / e.total);
      if (onProgress) onProgress(pct);
    }
  });

  // Step 3: Finalize
  return api.post(`/datarooms/${dataroomId}/uploads/finalize/`, {
    storage_key,
    unique_name,
    file_size: file.size,
    content_type: file.type,
    destination_folder_id: destinationFolderId || null,
    path: path || null
  });
};
```

### B. UI Component Integrations
- **Upload Zone**: In the Dataroom view/management dashboard, integrate file select input fields for file and folder uploads.
- **Folder Batch Ingestion**:
  1. Trigger folder select input.
  2. Extrapolate relative directories, calling `ensureDataroomFolderPaths` once to establish folder hierarchy.
  3. Map paths according to database naming results (`path_mappings`).
  4. Conduct concurrent file uploads via `uploadDataroomDocument`, passing target folder mappings.
  5. Refresh list and display file cards showing their `processing` state loader.

---

## 3. Testing Plan

### Backend Tests (`backend/tests/datarooms/`):
- Verify `ensure-paths` correctly maps directories and rolls back on failure (permissions/db).
- Verify uploads are blocked if user quota limits are exceeded.
- Verify finalized uploads properly create all associated records (`Document`, `DataroomDocument`, `DataroomItemOrder`) in transaction.

### Frontend Tests (`frontend/src/tests/`):
- Mock `/uploads/request` and `/uploads/finalize` actions.
- Test that selecting folders correctly triggers folder pre-creation mapping before file transfers.
