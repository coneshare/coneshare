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
3.  **First-Time Connection (API-Driven Flow)**:
    -   The frontend makes an authenticated API call to Coneshare's backend (e.g., `GET /api/v1/cloud/connect/dropbox/`).
    -   The backend generates the provider's authorization URL, securely caches a CSRF token, and returns the URL in a JSON response.
    -   The frontend receives the URL and redirects the user's browser to the provider's OAuth2 page.
    -   After granting access, the provider redirects the user back to a dedicated frontend callback route (e.g., `/auth/dropbox/callback`).
    -   This frontend route extracts the authorization `code` and `state` from the URL and sends them to the backend's callback API.
    -   The backend verifies the CSRF token, exchanges the code for access tokens, and securely saves the new connection. The frontend then redirects the user back to their documents.
4.  **Subsequent Imports**: After a successful connection, clicking the same "Dropbox" menu item will open a file browser modal, allowing the user to navigate their cloud files and select items to import.

---

## Part 1: Backend - Cloud Connection Infrastructure (Django)

The backend will manage secure connections to external providers and handle the asynchronous import of files.

### 1. System Administrator Configuration

To allow administrators to control which services are available, new settings will be added to `backend/settings.py`. These settings are configured directly in the Python settings file.

**File**: `backend/backend/settings.py`
```python
# Cloud Services Configuration
# A list of enabled cloud providers.
# Example: ENABLED_CLOUD_PROVIDERS = ["dropbox", "google_drive"]
ENABLED_CLOUD_PROVIDERS = ["dropbox"]

# A dictionary mapping cloud providers to their default import folder names.
CLOUD_IMPORT_FOLDER_MAPPING = {
    "dropbox": "Dropbox Imports",
    "google_drive": "Google Drive Imports",
}

# Dropbox API Credentials
# Get these from your Dropbox App Console.
DROPBOX_APP_KEY = 'your_dropbox_app_key'
DROPBOX_APP_SECRET = 'your_dropbox_app_secret'
```

### 2. New `CloudConnection` Model

A new model is required to securely store user-specific authorization tokens for each cloud provider.

-   **Fields**: It will include a foreign key to the `User`, the provider's name (e.g., `google_drive`, `dropbox`), and encrypted fields for the `access_token` and `refresh_token`.

### 3. OAuth2 and API Endpoints

-   **Provider Configuration Endpoint**: A new API endpoint (`GET /api/v1/cloud/providers/` in `cloudfiles/urls.py`) will be created to return the list of `ENABLED_CLOUD_PROVIDERS` to the frontend.
-   **API-Driven OAuth2 Flow**: To integrate smoothly with the SPA frontend and its JWT-based authentication, the OAuth2 flow is handled via API endpoints without relying on traditional sessions.
    -   **Authorization URL Endpoint (`GET /api/v1/cloud/connect/<provider>/`)**:
        -   The frontend makes an authenticated request to this endpoint.
        -   The backend generates the provider's authorization URL and a unique CSRF `state` token.
        -   The `state` token is cached on the server (e.g., in Redis) with a short expiry, keyed to the user.
        -   The endpoint returns a JSON response containing the `authorization_url`. The frontend then performs the client-side redirect.
    -   **Frontend Callback Route (`/auth/<provider>/callback`)**:
        -   This is a new, dedicated route in the React application. It is configured as the "Redirect URI" in the cloud provider's app settings.
        -   Its sole purpose is to capture the `code` and `state` query parameters from the provider's redirect and send them to the backend's callback API.
    -   **Backend Callback Endpoint (`POST /api/v1/cloud/callback/<provider>/`)**:
        -   The frontend sends the `code` and `state` to this authenticated endpoint.
        -   The backend retrieves the cached `state` token for the user and compares it to the one received, preventing CSRF attacks.
        -   It then securely exchanges the `code` for an `access_token` and `refresh_token` by making a server-to-server request to the provider.
        -   Finally, it saves the new `CloudConnection` in the database.
-   **Cloud File Operations API** (all in `cloudfiles/urls.py`):
    -   **File Listing Endpoint**: `GET /api/v1/cloud/connections/<connection_id>/list/` will allow the frontend to browse files and folders in a connected drive.
    -   **Import Endpoint**: `POST /api/v1/cloud/connections/<connection_id>/import/` will trigger the asynchronous import process for selected files and folders.

### 4. Token Encryption (Security Implementation)

To protect user credentials, all OAuth2 tokens (`access_token`, `refresh_token`) stored in the `CloudConnection` model must be encrypted at rest in the database. This provides a critical layer of defense if the database is ever compromised. The recommended implementation uses the `django-cryptography` library.

**Implementation Steps:**

1.  **Install the Library**: Add `django-cryptography` to the project's dependencies.
    ```bash
    docker compose exec backend pip install django-cryptography
    ```

2.  **Generate and Store an Encryption Key**: A strong encryption key is required. Generate one and store it securely as an environment variable (e.g., in `.env`).
    ```bash
    # Command to generate a new key:
    docker compose exec backend python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

    # Example .env entry:
    FIELD_ENCRYPTION_KEY=your-generated-key-here
    ```

3.  **Configure Django Settings**: Update `backend/settings.py` to load the key into the required `FERNET_KEYS` setting.
    ```python
    # Field Encryption Key
    FIELD_ENCRYPTION_KEY = os.environ.get('FIELD_ENCRYPTION_KEY')
    FERNET_KEYS = [FIELD_ENCRYPTION_KEY] if FIELD_ENCRYPTION_KEY else []
    ```

4.  **Update the `CloudConnection` Model**: In `cloudfiles/models.py`, change the token fields from `models.TextField` to `EncryptedTextField`.
    ```python
    from django_cryptography.fields import EncryptedTextField

    class CloudConnection(BaseModel):
        # ...
        access_token = EncryptedTextField()
        refresh_token = EncryptedTextField(blank=True, null=True)
        # ...
    ```

5.  **Create and Apply Migrations**: The final step is to apply these changes to the database schema. `django-cryptography` will automatically handle the encryption of any existing, unencrypted data during the migration process.
    ```bash
    docker compose exec backend python manage.py makemigrations cloudfiles
    docker compose exec backend python manage.py migrate
    ```

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
