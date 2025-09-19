# Coneshare: Document Upload Implementation Plan

This document outlines the implementation plan for adding document upload functionality to Coneshare. The approach is phased to deliver a simple, robust single-file upload feature in V1, with more advanced features like drag-and-drop and resumable uploads planned for V2.

---

## V1.0: Simple "Add Document" Feature

The goal for V1 is to implement a clean, reliable single-file upload feature using a modal interface.

### 1. Backend (Django)

-   **Modify Document Creation Endpoint**:
    -   **File**: `coneshare/documents/views.py`
    -   **Endpoint**: `POST /api/documents/`
    -   **Action**: The existing document creation view will be updated to handle a standard `multipart/form-data` request.
    -   **Logic**:
        1.  The view will receive the uploaded file directly from the request.
        2.  It will call a service function (as defined in `coneshare-document-process.md`) that saves the file to the configured storage backend (MinIO or filesystem).
        3.  It then creates the `Document` and `DocumentVersion` records in the database.
        4.  Finally, it triggers the Celery task (`generate_pdf_pages_task`) to process the document in the background.

### 2. Frontend (React)

-   **Create `AddDocumentModal` Component**:
    -   **File**: `src/components/documents/AddDocumentModal.jsx` (new file)
    -   **UI**: The component will feature a simple `<input type="file">` and an "Upload" button.
    -   **Logic**:
        1.  On form submission, it will construct a `FormData` object containing the selected file.
        2.  It will use `fetch` or `axios` to send a `POST` request with the `FormData` to the `POST /api/documents/` endpoint.
        3.  It will manage a `loading` state to provide UI feedback during the upload.
        4.  It will display success or error notifications to the user based on the API response.

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
