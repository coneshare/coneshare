# Coneshare: File Storage Architecture

This document outlines the architecture for handling file storage in Coneshare. The design uses a dedicated Go file server to handle all sensitive document I/O, separating file management from the main Django application's business logic.

---

## 1. Core Principles

-   **Security First**: Direct public access to sensitive documents is prohibited. All file access is gated by temporary, token-based URLs generated on demand.
-   **Separation of Concerns**: The Django backend handles business logic, permissions, and metadata, while a dedicated Go service handles all file storage and streaming.
-   **Performance**: Offloading file transfers to a compiled Go service frees up Python web workers, allowing the Django API to remain responsive under load.

---

## 2. Architecture Overview

The system consists of three primary services running in Docker containers:

1.  **Frontend (`frontend/`)**: The React-based user interface. It communicates with the Django backend for data and with the Go file server for file transfers.
2.  **Backend (`backend/`)**: A Django application that serves as the main API. It manages users, documents, permissions, and all other metadata. It acts as the gatekeeper for file access but never handles the file contents directly.
3.  **File Server (`core/`)**: A lightweight Go service that manages all file I/O operations (upload, download, delete) on a shared storage volume.

These services use a shared Docker volume (`media_volume`) for file storage, which is mounted into the `core` service.

---

## 3. Secure File Access Pattern: The Temporary URL Method

All access to protected documents is managed through temporary, single-use, token-based URLs. The Django backend authorizes requests, and the client (frontend) interacts directly with the Go file server for the actual data transfer.

### Upload Flow

The upload process is a three-step dance between the client, the backend, and the file server.

1.  **Request Upload URL**: The frontend sends the filename and destination path to the Django backend (`/api/v1/uploads/document/request/`).
2.  **Generate Temporary URL**: Django performs permission checks, then makes an internal API call to the Go file server, requesting a temporary upload URL for a unique storage key. The Go server generates a single-use token and returns a relative URL like `/files/upload/<token>`.
3.  **Return URL to Frontend**: Django sends the full, absolute upload URL back to the frontend.
4.  **Direct Upload**: The frontend `PUT`s the file content directly to the provided URL. The request is proxied by Nginx to the Go file server, which validates the token and saves the file to the shared storage volume.
5.  **Finalize Upload**: After the upload succeeds, the frontend notifies the Django backend (`/api/v1/uploads/document/finalize/`), providing metadata like the `storage_key` and file size. Django then creates the final `Document` and `DocumentVersion` records in the database and triggers background processing tasks (e.g., PDF conversion).

### Download & Preview Flow

The download flow follows a similar pattern, ensuring every request is authorized.

1.  **Request File URL**: The frontend requests data for a document preview or download from a Django API endpoint (e.g., `/api/v1/documents/{id}/preview-data/`).
2.  **Permission Check**: Django verifies that the user has permission to access the requested document.
3.  **Generate Temporary URL**: Django makes an internal API call to the Go file server for each required file (e.g., page images), requesting a temporary download URL. The Go server generates a token and returns a relative URL like `/files/download/<token>`.
4.  **Return URL to Frontend**: Django returns the full, absolute download URLs to the frontend as part of its JSON response.
5.  **Direct Download**: The frontend uses these URLs in `<img>` tags or download links. The browser requests the URL, which is proxied by Nginx to the Go server. The Go server validates the token and serves the file.

---

## 4. Public vs. Protected Files

The system handles two distinct types of files:

1.  **Public Media (`/media/avatars/`)**: Non-sensitive files like user avatars are stored in a volume mounted into the `backend` container and served directly by Nginx for efficiency.
2.  **Protected Documents (`/storage/`)**: All sensitive user-uploaded documents are stored in a separate volume accessible *only* by the Go file server. The Django backend does not have direct filesystem access to these files.

---

## 5. Implementation Details

### Docker Compose Configuration

The services are orchestrated in `docker-compose.yml`. The `core` (Go) and `backend` (Django) services are configured to communicate over the internal Docker network. A shared volume, `media_volume`, is mounted as `/storage` in the `core` service.

```yaml
# docker-compose.yml (simplified)
services:
  core:
    build: ./core
    volumes:
      - media_volume:/storage
    environment:
      - STORAGE_PATH=/storage
      - INTERNAL_API_TOKEN=...

  backend:
    build: ./backend
    depends_on:
      - core
    environment:
      - CORE_API_URL=http://core:8080
      - INTERNAL_API_TOKEN=...
```

### Nginx Configuration

In production, Nginx acts as a reverse proxy, routing traffic to the correct service based on the URL path.

```nginx
# nginx/nginx.conf
server {
    # ...

    # Proxy file upload/download requests to the Go file server
    location /files/ {
        proxy_pass http://core:8080;
        # ...
    }

    # Proxy all other API requests to the Django application
    location /api/ {
        proxy_pass http://backend:8000;
        # ...
    }
}
```

### Django `FileServerClient`

A client class in Django (`documents/fileserver.py`) handles all communication with the Go server's internal API.

```python
# backend/documents/fileserver.py

class FileServerClient:
    def __init__(self):
        self.base_url = settings.CORE_API_URL
        self.token = settings.INTERNAL_API_TOKEN
        # ...

    def generate_upload_url(self, storage_key: str, is_internal: bool = True) -> str:
        # ... makes POST request to Go server's /internal/v1/generate-upload-url
        # Constructs and returns an absolute URL for internal or external use.

    def generate_download_url(self, storage_key: str, is_internal: bool = True) -> str:
        # ... makes POST request to Go server's /internal/v1/generate-download-url

    def delete_file(self, storage_key: str):
        # ... makes POST request to Go server's /internal/v1/delete-file
```

