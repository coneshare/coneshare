# Coneshare: Cloud Drive Import Implementation Plan

This document outlines the implementation plan for allowing users to import files from third-party cloud storage providers like Dropbox, Google Drive, or self-hosted solutions like ownCloud.

The architecture is designed to be configurable by a system administrator, secure through the use of OAuth2, and scalable by leveraging an asynchronous import process.

---

## V1 Scope & Limitations

The initial implementation of this feature will focus exclusively on **single file imports**.

-   **Folder Imports**: The ability to import entire folders will be deferred to a future version. The user interface will only allow the selection of individual files.
-   **File Size Limit**: Each imported file must be less than 100MB. The backend will validate the file size using metadata from the cloud provider's API before initiating a download.

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

To allow administrators to control which services are available, new settings will be added to `backend/settings.py`. These settings will parse environment variables to configure enabled providers and their destination folders.

**File**: `backend/backend/settings.py`
```python
# Cloud Services Configuration
# A comma-separated list of enabled cloud providers (e.g., "dropbox,google_drive")
ENABLED_CLOUD_PROVIDERS_STR = os.environ.get('ENABLED_CLOUD_PROVIDERS', '')
ENABLED_CLOUD_PROVIDERS = [
    provider.strip() for provider in ENABLED_CLOUD_PROVIDERS_STR.split(',') if provider.strip()
]

# A JSON string mapping cloud providers to their default import folder names.
# e.g., '{"dropbox": "Dropbox Imports", "google_drive": "Google Drive"}'
CLOUD_IMPORT_FOLDER_MAPPING_JSON = os.environ.get('CLOUD_IMPORT_FOLDER_MAPPING', '{}')
try:
    CLOUD_IMPORT_FOLDER_MAPPING = json.loads(CLOUD_IMPORT_FOLDER_MAPPING_JSON)
except json.JSONDecodeError:
    print("Warning: Invalid JSON in CLOUD_IMPORT_FOLDER_MAPPING. Using empty mapping.")
    CLOUD_IMPORT_FOLDER_MAPPING = {}
```

### 2. New `CloudConnection` Model

A new model is required to securely store user-specific authorization tokens for each cloud provider.

-   **Fields**: It will include a foreign key to the `User`, the provider's name (e.g., `google_drive`, `dropbox`), and encrypted fields for the `access_token` and `refresh_token`.

### 3. OAuth2 and API Endpoints

-   **Provider Configuration Endpoint**: A new API endpoint (`GET /api/v1/cloud/providers/` in `cloudfiles/urls.py`) will be created to return the list of `ENABLED_CLOUD_PROVIDERS` to the frontend.
-   **OAuth2 Endpoints**: For each supported provider, two endpoints (in `cloudfiles/urls.py`) will handle the OAuth2 flow:
    -   **Authorization Endpoint**: Initiates the process by redirecting the user to the cloud provider's consent screen.
    -   **Callback Endpoint**: Handles the redirect back from the provider, exchanges the authorization code for tokens, and securely saves them in the `CloudConnection` model.
-   **Cloud File Operations API** (all in `cloudfiles/urls.py`):
    -   **File Listing Endpoint**: `GET /api/v1/cloud/connections/<connection_id>/list/` will allow the frontend to browse files and folders in a connected drive.
    -   **Import Endpoint**: `POST /api/v1/cloud/connections/<connection_id>/import/` will trigger the asynchronous import process for selected files and folders.

---

## Part 2: Backend - Asynchronous Import (Celery)

To prevent API timeouts when importing large files, the file transfer process must be handled by a background worker.

-   **New Celery Task (`import_from_cloud_task` in `cloudfiles/tasks.py`)**:
    -   The `POST /api/v1/cloud/connections/<connection_id>/import/` endpoint will trigger this new background task.
    -   **Logic**:
        -   The task receives the connection details and the ID of the file to import.
        -   It determines the destination folder for the import based on the provider (e.g., "Dropbox Imports"), creating it if it does not exist.
        -   It uses the stored tokens to download the file directly from the cloud provider's server to Coneshare's storage backend (e.g., MinIO) as a stream.
        -   After the transfer, it calls existing internal services to create the `Document` and `DocumentVersion` records within the designated folder.

### Error Handling and Status Updates

To communicate the status of the asynchronous import back to the user, especially in case of connection failures, the following mechanism will be used:

1.  **Error Detection**: The `import_from_cloud_task` will wrap the cloud provider API calls (e.g., file download) in a `try...except` block to catch connection errors or other API exceptions.
2.  **Status Update**:
    -   On success, the task will set the corresponding `Document` status to `'ready'`.
    -   On failure, it will set the status to `'error'` and store a user-friendly message (e.g., "Connection to the cloud provider was lost. Please try again.") in the new `status_message` field on the `Document` model.

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
-   When opened, it will use the `GET /api/v1/cloud/<connection_id>/list/` endpoint to display the user's cloud files and folders (though only files will be selectable in V1).
-   The user can select a single file and click an "Import" button, which will call the `POST /api/v1/cloud/import/` endpoint to start the asynchronous background process.

### 4. Displaying Import Status and Errors

-   After an import is initiated, the frontend will periodically poll the document's API endpoint (`GET /api/v1/documents/{id}/`).
-   The UI will display an "Importing..." indicator while the document's status is `'processing'`.
-   If the status changes to `'error'`, the frontend will display the `status_message` from the API response in a toast notification to inform the user of the failure.
