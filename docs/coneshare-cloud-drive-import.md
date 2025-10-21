# Coneshare: Cloud Drive Import Implementation Plan

This document outlines the implementation plan for allowing users to import files and folders from third-party cloud storage providers like Dropbox, Google Drive, or self-hosted solutions like ownCloud.

The architecture is designed to be configurable by a system administrator, secure through the use of OAuth2, and scalable by leveraging an asynchronous import process.

---

## The User Flow

The user experience is designed to be intuitive and follows a conditional logic path:

1.  **Admin Configuration**: A system administrator first enables a list of approved cloud providers (e.g., "dropbox,owncloud") in the system's configuration.
2.  **Dynamic UI**: The "Upload" dropdown menu in the user interface is dynamically populated with the providers enabled by the administrator.
3.  **First-Time Connection**: When a user clicks on a provider (e.g., "Dropbox") for the first time, they are redirected to that provider's OAuth2 authorization page to grant Coneshare access to their files.
4.  **Subsequent Imports**: After a successful connection, clicking the same "Dropbox" menu item will open a file browser modal, allowing the user to navigate their cloud files and select items to import.

---

## Part 1: Backend - Cloud Connection Infrastructure (Django)

The backend will manage secure connections to external providers and handle the asynchronous import of files.

### 1. System Administrator Configuration

To allow administrators to control which services are available, a new setting will be added to `backend/settings.py`. This setting will parse a comma-separated list of provider names from an environment variable.

**File**: `backend/backend/settings.py`
```python
# Cloud Services Configuration
# A comma-separated list of enabled cloud providers (e.g., "dropbox,google_drive")
ENABLED_CLOUD_PROVIDERS_STR = os.environ.get('ENABLED_CLOUD_PROVIDERS', '')
ENABLED_CLOUD_PROVIDERS = [
    provider.strip() for provider in ENABLED_CLOUD_PROVIDERS_STR.split(',') if provider.strip()
]
```

### 2. New `CloudConnection` Model

A new model is required to securely store user-specific authorization tokens for each cloud provider.

-   **Fields**: It will include a foreign key to the `User`, the provider's name (e.g., `google_drive`, `dropbox`), and encrypted fields for the `access_token` and `refresh_token`.

### 3. OAuth2 and API Endpoints

-   **Provider Configuration Endpoint**: A new API endpoint (`GET /api/v1/cloud/providers/`) will be created to return the list of `ENABLED_CLOUD_PROVIDERS` to the frontend.
-   **OAuth2 Endpoints**: For each supported provider, two endpoints will handle the OAuth2 flow:
    -   **Authorization Endpoint**: Initiates the process by redirecting the user to the cloud provider's consent screen.
    -   **Callback Endpoint**: Handles the redirect back from the provider, exchanges the authorization code for tokens, and securely saves them in the `CloudConnection` model.
-   **Cloud File Operations API**:
    -   **File Listing Endpoint**: `GET /api/v1/cloud/<connection_id>/list/` will allow the frontend to browse files and folders in a connected drive.
    -   **Import Endpoint**: `POST /api/v1/cloud/import/` will trigger the asynchronous import process for selected files and folders.

---

## Part 2: Backend - Asynchronous Import (Celery)

To prevent API timeouts when importing large files, the file transfer process must be handled by a background worker.

-   **New Celery Task (`import_from_cloud_task`)**:
    -   The `POST /api/v1/cloud/import/` endpoint will trigger this new background task.
    -   **Logic**: The task will receive the connection details and the ID of the file to import. It will use the stored tokens to download the file directly from the cloud provider's server to Coneshare's storage backend (e.g., MinIO) as a stream.
    -   After the transfer, the task will call existing internal services to create the `Document` and `DocumentVersion` records.
    -   For folder imports, the task will recursively list the folder's contents and queue individual import tasks for each file.

---

## Part 3: Frontend - User Interface (React)

The frontend will manage the user-facing components for connecting to and importing from cloud services.

### 1. Dynamic "Upload" Menu

-   On page load, the `DocumentsPage` will call the `GET /api/v1/cloud/providers/` endpoint.
-   The "Upload" dropdown menu will be dynamically populated with an item for each provider returned by the API.

### 2. Conditional Click Handler

A handler function for the dynamic menu items will implement the core conditional logic:
1.  Check if a `CloudConnection` exists for the user and the selected provider.
2.  If **no**, redirect the user to the backend's OAuth2 authorization endpoint for that provider.
3.  If **yes**, open a new "Cloud File Picker" modal.

### 3. Cloud File Picker Modal

-   A new modal component will serve as a file browser for the user's connected cloud drives.
-   When opened, it will use the `GET /api/v1/cloud/<connection_id>/list/` endpoint to display the user's cloud files and folders.
-   The user can select items and click an "Import" button, which will call the `POST /api/v1/cloud/import/` endpoint to start the asynchronous background process.
