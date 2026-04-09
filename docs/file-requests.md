# File Requests Feature: High-Level Design

This document outlines the high-level design and critical decisions made during the implementation of the "File Requests" feature.

## 1. Feature Overview

The "File Requests" feature allows authenticated users to generate a secure, shareable link that external, unauthenticated parties can use to upload files directly into a designated folder within the user's account.

-   **Goal**: To streamline the process of collecting files from external collaborators (e.g., clients, partners) without requiring them to have an account.
-   **Core User Flow**:
    1.  An internal user creates a "File Request" link, pointing it to a specific destination folder and configuring its settings (e.g., expiration date).
    2.  An external party receives the link, opens a public upload page, provides their name and email, and uploads one or more files.
    3.  The uploaded files appear in the designated folder, and the uploader's information is displayed in the UI.

## 2. Backend Design

### Architectural Decision: Dedicated `filerequests` App

A new Django app, `filerequests`, was created to encapsulate all logic related to this feature.

-   **Rationale**: Although conceptually similar to "Share Links" (sharing content *out*), "File Requests" (getting content *in*) represents a different data flow and purpose. A dedicated app provides better separation of concerns, improving maintainability and aligning with Django's app-centric design philosophy.

### Data Model

-   **`filerequests.FileRequest` Model**: A new model was introduced to store the configuration for each file request link, including a unique `slug`, a foreign key to the destination `documents.Folder`, the `created_by` user, and optional constraints like `expires_at` and `max_file_size`.

-   **Modification to `documents.Document` Model**: The existing `metadata` `JSONField` on the `Document` model is used to track the origin of externally uploaded files.
    -   **Critical Decision**:
        -   The `created_by` field on the `Document` is populated with the **owner of the file request link**, not `NULL`. This ensures that existing permission checks, ownership logic, and filtering continue to work seamlessly.
        -   The `uploader_info` key within the `metadata` field stores the external uploader's details (e.g., `{'uploader_info': {'name': 'John Doe', 'email': 'john.doe@example.com'}}`). This provides clear attribution in the UI without disrupting the core ownership model.

### API Endpoints

-   **Management API**: A standard `FileRequestViewSet` provides authenticated CRUD endpoints for users to manage their file request links.

-   **Public API**: A set of unauthenticated endpoints under `/api/v1/public/file-requests/<slug>/` handles the upload process.
    -   **Rationale**: This follows the secure three-step upload pattern already established in the system:
        1.  **Request Upload**: The client requests a pre-signed upload URL from the backend, which performs all necessary validation (e.g., checking link status, file size limits, owner's quota).
        2.  **Upload to File Server**: The client uploads the file directly to the pre-signed URL, offloading the data transfer from the Django application.
        3.  **Finalize Upload**: The client notifies the backend that the upload is complete. The backend then creates the `Document` record and populates the `created_by` field and the `uploader_info` key within the `metadata` field.

### Automation Integration

-   On successful `finalize-upload`, the backend emits an internal automation event: `file_request_uploaded`.
-   The event is queued after DB commit and includes normalized payload fields such as:
    -   `organization_id`, `file_request_id`, `file_request_slug`
    -   `folder_id`, `document_id`
    -   `uploaded_by_name`, `uploaded_by_email`
    -   `uploaded_file_name`, `uploaded_file_size`, `uploaded_at`
-   This enables automation rules to notify configured destinations (webhook/Slack/WeChat/FeiShu/Discord) whenever files are uploaded through a file request link.

## 3. Frontend Design

### UI/UX and Component Reusability

-   **Folder Selection**:
    -   **Initial Idea**: A simple `<select>` dropdown to choose the destination folder. This was discarded as it does not scale well for users with many nested folders.
    -   **Final Decision**: A reusable `FolderBrowser.jsx` component was created by refactoring the existing folder navigation logic from `MoveItemsDialog.jsx`. This component provides a consistent, scalable, and interactive file-explorer-like experience for selecting a folder. It is now used in both the `MoveItemsDialog` and the `FileRequestSheet`.

-   **Creation/Editing UI**:
    -   A `FileRequestSheet.jsx` component (a slide-over panel) provides the form for creating and editing file request links.
    -   **Critical Decision**: To maintain a consistent user experience, the `FolderBrowser` is always visible in the sheet, allowing the user to change the destination folder during both creation and editing.

-   **Public Upload Page**:
    -   A new page at `/upload/:slug` provides a simple UI for external users.
    -   It includes a drop zone with full drag-and-drop functionality.
    -   **Critical Decision**: The uploader's name and email are **required fields**. This ensures that every externally uploaded file can be attributed to a specific person, which is crucial for auditing and tracking purposes.

-   **Displaying Uploader Information**:
    -   The `DraggableItem.jsx` component, used in the main documents list, was updated to check for the `uploader_info` field in the serialized document data (derived from the `metadata` field). If present, it displays the external uploader's name in the "Owner" column, providing clear and immediate attribution.
