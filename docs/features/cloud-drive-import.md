# Coneshare: Cloud Drive Import Implementation

## Strategy refs
- [Coneshare Roadmap](./strategy/coneshare-roadmap.md)
- [Coneshare Technology Stack](./strategy/coneshare-techstack.md)

## Out of scope
- Folder import (including recursive traversal and batch folder sync).
- Multi-file selection/import in a single action.
- Background delta sync and two-way synchronization (though foundational architecture for tracking revisions is in place).
- Provider-specific advanced features (shared-drive ACL mirroring, shortcuts, comments).

## Design decisions
- Decision: Use API-driven OAuth2 flow with frontend callback handoff and backend token exchange.
  Rationale: Fits JWT-based SPA architecture and avoids relying on server-side session auth flow.
  Tradeoff: Requires explicit state-token lifecycle handling and callback route coordination.
- Decision: Keep imports asynchronous via Celery task.
  Rationale: Avoids request timeouts and supports reliable large-file transfer behavior.
  Tradeoff: Requires status tracking and UI polling/error surfacing.
- Decision: Enforce single-file import and size pre-validation (<100MB).
  Rationale: Keeps initial scope controlled while validating end-to-end provider integration.
  Tradeoff: Reduced user convenience until folder/multi-file support is added.
- Decision: Use `JSONField` metadata on `DocumentVersion` to track cloud origin.
  Rationale: Clean, robust, prevents "version drift", and preserves history for future features like version restoration and auto-sync version tracking.

This document outlines the implementation for allowing users to import files from third-party cloud storage providers like Dropbox, Google Drive, or self-hosted solutions like Nextcloud, as well as managing those connections and file versions.

---

## The User Flow

1.  **Admin Configuration**: A system administrator first enables a list of approved cloud providers (e.g., "dropbox,nextcloud") in the system's configuration.
2.  **Dynamic UI**: The "Upload" dropdown menu in the user interface is dynamically populated with the providers enabled by the administrator.
3.  **First-Time Connection (API-Driven Flow)**:
    -   The frontend makes an authenticated API call to Coneshare's backend (e.g., `GET /api/v1/cloud/connect/dropbox/`).
    -   The backend generates the provider's authorization URL, securely caches a CSRF token, and returns the URL in a JSON response.
    -   The frontend receives the URL and redirects the user's browser to the provider's OAuth2 page.
    -   After granting access, the provider redirects the user back to a dedicated frontend callback route (e.g., `/auth/dropbox/callback`).
    -   This frontend route extracts the authorization `code` and `state` from the URL and sends them to the backend's callback API (`POST /api/v1/cloud/callback/dropbox/`).
    -   The backend verifies the CSRF token, exchanges the code for access tokens, and securely saves the new connection. The frontend then redirects the user back to their documents.
4.  **Subsequent Imports & Versioning**: After a successful connection, clicking the same "Dropbox" menu item will open a file browser modal, allowing the user to navigate their cloud files and select items to import. Users can also refresh imported documents or upload new versions directly from the cloud.
5.  **Settings & Revocation**: Users can view their connected accounts in the Integrations settings and disconnect them. Disconnecting performs a best-effort OAuth revocation.

---

## Part 1: Backend - Cloud Connection Infrastructure (Django)

### 1. System Administrator Configuration

Settings are loaded from environment variables in `backend/backend/settings.py`.

```python
import os

ENABLED_CLOUD_PROVIDERS = ["dropbox", "google_drive", "nextcloud"]

CLOUD_IMPORT_FOLDER_MAPPING = {
    "dropbox": "Dropbox Imports",
    "google_drive": "Google Drive Imports",
    "nextcloud": "Nextcloud Imports",
}

# Provider API Credentials (loaded from env)
DROPBOX_APP_KEY = os.environ.get("DROPBOX_APP_KEY", "")
# ...
```

### 2. `CloudConnection` Model & Token Encryption

User-specific authorization tokens are securely stored in the `CloudConnection` model. To protect user credentials, all OAuth2 tokens are encrypted at rest in the database using the `django-cryptography` library.

**Implementation (`backend/cloudfiles/models.py`):**
```python
from django_cryptography.fields import encrypt

class CloudConnection(BaseModel):
    # ...
    access_token = encrypt(models.TextField())
    refresh_token = encrypt(models.TextField(blank=True, null=True))
    # ...
```

### 3. API Endpoints (`cloudfiles/urls.py`)

-   **Provider Configuration**: `GET /api/v1/cloud/providers/` returns enabled providers and connection status.
-   **Active Connections**: `GET /api/v1/cloud/connections/` lists the user's active connections.
-   **Disconnect Provider**: `DELETE /api/v1/cloud/connections/<connection_id>/`
    - Strictly enforces that the connection belongs to the requesting user.
    - Attempts best-effort OAuth token revocation with the provider before deleting the local database record.
-   **OAuth2 Flow Endpoints**:
    -   `GET /api/v1/cloud/connect/<provider>/` (Generates auth URL and CSRF state)
    -   `POST /api/v1/cloud/callback/<provider>/` (Exchanges code for tokens)
-   **Cloud File Operations**:
    -   **File Listing**: `GET /api/v1/cloud/connections/<connection_id>/list/`
    -   **Initial Import**: `POST /api/v1/cloud/connections/<connection_id>/import/`
    -   **Refresh Document**: `POST /api/v1/cloud/documents/<doc_id>/refresh/`
    -   **Import New Version**: `POST /api/v1/cloud/documents/<doc_id>/import_version/`

---

## Part 2: Backend - Document Versioning & Async Import

To prevent API timeouts, file transfers are handled by a Celery background worker. The process supports both initial imports and version updates.

### 1. Document & Metadata Modeling

The `DocumentVersion` model tracks cloud origin metadata. This preserves history and provides the foundation for future auto-sync features.

**Metadata Schema (`DocumentVersion.metadata`):**
```json
{
  "cloud_import": {
    "provider": "dropbox",
    "provider_display": "Dropbox",
    "connection_id": "12",
    "file_id": "id:abcdef12345",
    "etag_or_rev": "015d30000000000000000"
  }
}
```
*Note: `etag_or_rev` stores the provider-specific revision tag (e.g., Dropbox `rev`, Google Drive `md5Checksum`) for change-detection.*

### 2. Unified Background Processing (`import_from_cloud_task`)

- The task receives the `document_id`, `connection_id`, `file_id`, and an optional `version_id`.
- The API views (e.g., `CloudRefreshView`) pre-create the `DocumentVersion` model eagerly and set the document status to `uploading`. This synchronous reservation uses `select_for_update()` to prevent race conditions and double-submissions.
- The Celery task downloads the file, saves the resolved `etag_or_rev` into the version's metadata, and completes the document rendering pipeline.
- **Error Handling**: On success, the document is marked as `ready`. On failure, it is marked as `error` with a user-friendly `status_message`, and any reserved versions are cleaned up.

---

## Part 3: Frontend - User Interface (React)

### 1. Dynamic "Upload" & Versioning

-   **Upload Menu**: The "Upload" dropdown dynamically populates based on enabled providers (`GET /api/v1/cloudfiles/providers/`).
-   **Cloud File Picker Modal**: A modal allows users to browse their cloud drive and select a file to import.
-   **Document Detail Page**: 
    - Displays a badge (e.g., `☁️ Imported from Dropbox`) if `document.cloud_import` is present.
    - Features a **"Refresh from Cloud"** button for imported documents, triggering the refresh API endpoint.
    - The "Upload New Version" button is split, allowing users to either upload from their computer or import a new version from their cloud drive.

### 2. Integrations Settings (`/settings/integrations`)

-   A dedicated settings page renders a grid of "Integration Cards".
-   **Disconnected**: Shows the provider logo and a "Connect" button.
-   **Connected**: Shows a "Connected" badge, the connected email/account name, connection dates, and a "Disconnect" button.
-   **Disconnection UX**: Clicking "Disconnect" opens a warning modal explaining that documents imported from this provider will remain in Coneshare but can no longer be refreshed. Upon confirmation, it triggers the `DELETE` endpoint.
