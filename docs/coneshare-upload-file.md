# Coneshare: Document Upload Implementation Plan

This document outlines the implementation plan for adding document upload functionality to Coneshare. The approach is phased to deliver a simple, robust single-file upload feature in V1, with more advanced features like drag-and-drop and resumable uploads planned for V2.

---

## V1.0: Multi-File & Folder Upload Feature

The goal for V1 is to implement a clean, reliable file and folder upload feature using a dropdown button in the main documents view.

### 1. Backend (Django)

-   **Dedicated Upload Endpoint**:
    -   **File**: `backend/documents/views.py`
    -   **Endpoint**: `POST /api/v1/uploads/document/`
    -   **Action**: A dedicated `DocumentUploadView` handles `multipart/form-data` requests for both individual files and files within a folder structure.
    -   **Logic**:
        1.  The view requires authentication and receives the uploaded file.
        2.  It accepts an optional `path` parameter in the request body, which is used to create a nested folder structure if provided.
        3.  It calls the `create_document_from_upload` service function, which saves the file to the configured storage backend (MinIO or filesystem) and creates the `Document` and `DocumentVersion` records.
        4.  It returns a `202 ACCEPTED` status and triggers the Celery task (`generate_pdf_pages_task`) for asynchronous processing.

### 2. Frontend (React)

-   **Create "Upload" Dropdown Button**:
    -   **File**: `src/pages/DocumentsPage.jsx`
    -   **UI**: The main documents page features an "Upload" button that opens a dropdown with two options: "Files" and "Folder".
    -   **Logic**:
        1.  **File Upload**: The "Files" option opens a system file picker allowing multiple file selection (`<input type="file" multiple>`).
        2.  **Folder Upload**: The "Folder" option uses a directory picker (`<input type="file" webkitdirectory>`).
        3.  On file selection, an `uploadDocument` service function (in `src/services/api.js`) constructs a `FormData` object for each file.
        4.  For folder uploads, it extracts the relative path from the file object (`file.webkitRelativePath`) and includes it in the `FormData`.
        5.  It sends a `POST` request to the `/api/v1/uploads/document/` endpoint with the correct `multipart/form-data` header.
        6.  After a successful upload, the document list is refreshed to show the new content.

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
