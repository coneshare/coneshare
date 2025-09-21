# Coneshare: Document Upload Implementation Plan

This document outlines the implementation plan for adding document upload functionality to Coneshare. The approach is phased to deliver a robust multi-file and folder upload feature in V1, with more advanced features like drag-and-drop and resumable uploads planned for V2.

---

## V1.0: Multi-File & Folder Upload Feature

The goal for V1 is to implement a clean, reliable file and folder upload feature using a dropdown button in the main documents view.

### 1. Backend (Django)

-   **Decoupled Folder Creation Endpoint**:
    -   **File**: `backend/documents/views.py`
    -   **Endpoint**: `POST /api/v1/folders/from_path/`
    -   **Action**: A new `FolderFromPathView` handles the idempotent creation of nested folder structures from a path string (e.g., `Reports/Q1/Final`).
    -   **Logic**: This endpoint is called once by the frontend before a batch upload. It parses the path and creates any missing folders, ensuring the structure exists before files are uploaded. This prevents race conditions.

-   **Dedicated Upload Endpoint**:
    -   **File**: `backend/documents/views.py`
    -   **Endpoint**: `POST /api/v1/uploads/document/`
    -   **Action**: The `DocumentUploadView` handles `multipart/form-data` requests for individual files.
    -   **Logic**:
        1.  The view receives an uploaded file and an optional `path` parameter.
        2.  It **no longer creates folders**. Instead, it looks up the folder structure provided in the `path`. If the folder does not exist, the request fails.
        3.  It calls `create_document_from_upload`, which saves the file and creates the `Document` and `DocumentVersion` records.
        4.  It returns a `202 ACCEPTED` status and triggers a Celery task for asynchronous processing.

### 2. Frontend (React)

-   **"Upload" Dropdown Button and Logic**:
    -   **File**: `src/pages/DocumentsPage.jsx`
    -   **UI**: An "Upload" button opens a dropdown with "Files" and "Folder" options.
    -   **Logic for File Upload**:
        1.  The "Files" option uses an `<input type="file" multiple>`.
        2.  On selection, each file is uploaded concurrently via `Promise.allSettled` by sending a `POST` request to `/api/v1/uploads/document/`.
    -   **Logic for Folder Upload (Two-Step Process)**:
        1.  The "Folder" option uses an `<input type="file" webkitdirectory>`.
        2.  **Step 1: Ensure Folder Structure**: Before uploading, the frontend extracts all unique directory paths from the selected files' `webkitRelativePath`. It then makes a single API call for each unique path to the new `POST /api/v1/folders/from_path/` endpoint.
        3.  **Step 2: Upload Files**: Only after the folder creation call succeeds, it proceeds to upload all files concurrently using `Promise.allSettled`. Each file is sent with its full `webkitRelativePath` to the `/api/v1/uploads/document/` endpoint.
        4.  After all successful uploads, the document list is refreshed.

---

## V2.0: Future Enhancements (Drag-and-Drop & Resumable Uploads)

The following features are planned for a future release to enhance the user experience for bulk uploads.

### 1. Backend (Django)

-   **Folder Creation Endpoint**: Implement a `POST /api/folders/` endpoint to allow the frontend to create folder structures dynamically.
-   **Resumable Uploads (TUS)**: Integrate a Django TUS server library (e.g., `django-tus`) to provide a dedicated endpoint (e.g., `/api/files/upload/`) for handling chunked, resumable file uploads.
-   **Update Document Creation**: The `POST /api/documents/` endpoint will be modified to accept metadata (including a reference to a completed TUS upload) instead of a direct file stream.

### 2. Frontend (React)

-   **`resumableUpload` Utility**: Create a service that uses `tus-js-client` to communicate with the TUS backend endpoint.
-   **`UploadZone` Component**:
    -   Implement a new component using `react-dropzone`.
    -   It will include logic to recursively traverse dropped folder structures, create folders on the backend via the new API, and then queue the files for upload using the `resumableUpload` utility.
-   **Integration**: The main document list view will be wrapped in `<UploadZone>` to enable the drag-and-drop functionality.
