# File Requests Feature Implementation Plan

This document outlines the implementation plan for the "File Requests" feature, which allows users to create shareable links to collect files from external parties.

---

## 1. Feature Overview

The "File Requests" feature enables Coneshare users to generate a secure, unique link associated with a specific folder. External users can access this link to upload files directly into that folder without needing a Coneshare account. This streamlines workflows for
collecting documents from clients, partners, or applicants.

### User Flow

1.  **Creation**: A user selects a folder, chooses a "Request files" option, and configures settings (e.g., expiration date, file size limits) in a form to generate a public upload link.
2.  **Management**: Users can view, manage, and delete all their active file request links from a dedicated page.
3.  **Usage**: An external party receives the link, accesses a simple upload page, and submits their files. The uploaded files appear in the designated folder, with the uploader's information attached and visible in the UI.

---

## 2. Backend Implementation

### Step 1: Create the `filerequests` App

-   A new Django app named `filerequests` will be created to encapsulate all related logic.
-   `'filerequests'` will be added to `INSTALLED_APPS` in `backend/settings.py`.

### Step 2: Define Models

-   **New `FileRequest` Model**: A new model will be created in `backend/filerequests/models.py`.
    -   `folder`: ForeignKey to `documents.Folder`.
    -   `created_by`: ForeignKey to `User`.
    -   `name`: CharField for internal identification.
    -   `slug`: CharField, unique, for the public URL.
    -   `is_active`: BooleanField.
    -   `expires_at`: DateTimeField (nullable).
    -   Other constraint fields (e.g., `max_file_size`, `allowed_file_types`).

-   **Modify `Document` Model**: The `documents.models.Document` model will be updated to track externally uploaded files.
    -   **`upload_info`**: A `JSONField` will be added. It will be `null` for internal uploads but will store external uploader details (e.g., `{'name': 'John Doe', 'email': 'john.doe@example.com'}`) for file request uploads.
    -   **`created_by`**: For file request uploads, this field will be populated with the `User` who owns the file request link, ensuring consistency with existing ownership and permission logic.

### Step 3: Implement API Endpoints

-   **Management API**:
    -   A `FileRequestSerializer` and `FileRequestViewSet` will be created in the `filerequests` app to provide CRUD endpoints for authenticated users to manage their links.
-   **Public API**:
    -   Public, unauthenticated views will be created to:
        1.  Fetch the public details of a file request link (e.g., its name).
        2.  Handle the three-step upload process (request pre-signed URL, upload to file server, finalize) for external users. The finalization step will populate the `created_by` and `upload_info` fields on the new `Document` record.

### Step 4: Configure URLs

-   URL patterns for the `filerequests` app will be defined in `backend/filerequests/urls.py`.
-   This new URL configuration will be included in `backend/backend/urls.py` under the `/api/v1/` prefix.

---

## 3. Frontend Implementation

### Step 1: Integrate Creation Flow

-   The `ActionsDropdown.jsx` component will be modified to include a "Request files" option, visible only for folders.
-   This option will trigger a new modal/sheet component, `FileRequestSheet.jsx`, which will contain the form for creating and editing `FileRequest` links.

### Step 2: Create Management Page

-   A new page, `FileRequestsPage.jsx`, will be created to list all file request links for the logged-in user.
-   This page will allow users to copy links, edit settings, and delete links.
-   A new route and a link in the main sidebar navigation will be added for this page.

### Step 3: Create Public Upload Page

-   A new public page, `PublicUploadPage.jsx`, will be created, accessible via a route like `/upload/:slug`.
-   This page will display a simple interface for external users to select and upload files.

### Step 4: Display Uploader Information

-   The UI component that lists documents will be updated to check for the presence of the `upload_info` field in the document data.
-   If `upload_info` exists, it will display the uploader's name/email alongside the file, distinguishing it from internally created files.

---

## 4. Documentation

-   The `coneshare-data-model.md` document will be updated to reflect the addition of the `upload_info` field to the `Document` model and to define the schema for the new `FileRequest` model.
