# Coneshare: Document Upload Implementation Plan

This document outlines the implementation plan for adding document upload functionality to Coneshare. The approach is phased to deliver a robust multi-file and folder upload feature in V1, with more advanced features like drag-and-drop and resumable uploads planned for V2.

---

## V1.0: Multi-File & Folder Upload Feature

The goal for V1 is to implement a clean, reliable file and folder upload feature using a dropdown button in the main documents view. The upload process is a three-step flow to improve scalability by offloading file transfers to a dedicated file server.

### Path Contract (V1)

- `path` is a **root-relative virtual path** and must **not** start with `/`.
- Valid examples:
  - File at root: `"foo.txt"`
  - File in nested folder: `"foo/bar/baz.txt"`
  - Folder path for ensure call: `"foo/bar"`
- Invalid in current contract: `"/foo.txt"` or `"/foo/bar/baz.txt"`.
- The backend resolves these paths from the organization's invisible `__root__` folder.

### 1. Backend (Django)

-   **Bulk Folder Creation Endpoint**:
    -   **File**: `backend/documents/views.py`
    -   **Endpoint**: `POST /api/v1/folders/ensure-paths/`
    -   **Action**: A new `EnsureFolderPathsView` handles the atomic, idempotent creation of multiple folder structures from a list of path strings (e.g., `["Reports/Q1", "Reports/Q2/Internal"]`).
    -   **Logic**: This endpoint is called once by the frontend before a batch folder upload. It receives a list of required directory paths. The backend is responsible for parsing all paths, determining the complete hierarchy (e.g., creating `Reports` before creating `Reports/Q1`), and creating all missing folders in a single database transaction. This guarantees data integrity and prevents race conditions.

-   **Upload URL Request Endpoint**:
    -   **File**: `backend/documents/views.py`
    -   **Endpoint**: `POST /api/v1/uploads/document/request/`
    -   **Action**: The `DocumentUploadRequestView` handles the first step of an upload.
    -   **Logic**:
        1.  Receives file metadata (`file_name`, `file_size`, and an optional `path`).
        2.  Performs pre-flight checks, such as validating user storage quotas.
        3.  Generates a unique `storage_key` for the file and determines its final unique name within the destination folder.
        4.  Communicates with the Go file server to generate a secure, temporary, pre-signed URL for uploading.
        5.  Returns the `upload_url`, `storage_key`, and `unique_name` to the frontend.

-   **Upload Finalization Endpoint**:
    -   **File**: `backend/documents/views.py`
    -   **Endpoint**: `POST /api/v1/uploads/document/finalize/`
    -   **Action**: The `DocumentUploadFinalizeView` handles the final step after the file has been uploaded.
    -   **Logic**:
        1.  This endpoint is called by the frontend *after* the file has been successfully uploaded to the pre-signed URL.
        2.  It receives the `storage_key`, `unique_name`, `file_size`, `content_type`, and `path`.
        3.  It calls the `create_document_from_upload` service, which creates the `Document` and `DocumentVersion` records in the database.
        4.  It returns a `202 ACCEPTED` status and triggers a Celery task for asynchronous processing (e.g., page generation).

### 2. Frontend (React)

-   **"Upload" Dropdown Button and Logic**:
    -   **File**: `src/pages/DocumentsPage.jsx`
    -   **UI**: An "Upload" button opens a dropdown with "Files" and "Folder" options.
    -   **Logic for File Upload (Three-Step Process)**:
        1.  The "Files" option uses an `<input type="file" multiple>`.
        2.  On selection, each file is uploaded concurrently via `Promise.allSettled` using the `uploadDocument` service, which performs three steps:
            -   **Request**: Sends a `POST` request to `/api/v1/uploads/document/request/` with file metadata to get a pre-signed upload URL from the backend.
            -   **Upload**: Sends a `PUT` request with the file content directly to the received `upload_url`, transferring the data to the file server.
            -   **Finalize**: Sends a `POST` request to `/api/v1/uploads/document/finalize/` to notify the backend that the upload is complete, triggering database record creation.
    -   **Logic for Folder Upload (Two-Step Process)**: This process is designed to prevent race conditions by creating the folder structure before uploading files.
        1.  **User Action**: The user selects the "Folder" option from the "Upload" dropdown, which triggers a hidden `<input type="file" webkitdirectory>`.
        2.  **Event Handling**: The `onFolderChange` event handler in `DocumentsPage.jsx` calls the `handleFileUploads` function with the list of selected files.
        3.  **Step 1: Folder Path Extraction & Bulk Creation**:
            -   The `handleFileUploads` function first iterates through all file objects to inspect their `webkitRelativePath` property (e.g., `"Reports/Q1/Analysis.pdf"`).
            -   It extracts the directory portion of each path (e.g., `"Reports/Q1"`) and collects all unique paths into a `Set`.
            -   It then sends this entire set of paths in a **single API call** to the `POST /api/v1/folders/ensure-paths/` endpoint. This call is made once before any files are uploaded.
            -   The backend handles the complexity of creating the entire folder hierarchy atomically, ensuring the structure is fully in place before the frontend proceeds.
        4.  **Step 2: Concurrent File Uploads**:
            -   Once the folder creation promise has been successfully resolved, the function proceeds to upload the files.
            -   It calls the `uploadDocument(file, file.webkitRelativePath)` service for each file. This service performs the three-step request-upload-finalize process described above.
            -   Uploads are performed concurrently using `Promise.allSettled` to ensure that a failure of one file does not stop the entire batch.
        5.  **UI Refresh**: After the uploads are complete, `fetchData()` is called to refresh the document list and display the newly uploaded folder and its contents.

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
