# Coneshare: File Storage Architecture

This document outlines the architecture for handling file storage in Coneshare. The design is built to be secure, scalable, and adaptable for both development and production environments, especially within a containerized context (Docker Compose, Kubernetes).

---

## 1. Core Principles

-   **Security First**: Direct, public access to sensitive documents is prohibited. All file access must be gated by the application's permission logic.
-   **Scalability**: The storage solution must support different deployment scales, from single-machine setups to multi-server clusters.
-   **Environment Parity**: The system should work seamlessly in a local development environment without requiring a full production stack (like Nginx).

---

## 2. Storage Strategy

The application supports two storage backends, configurable via the `STORAGE_TYPE` environment variable.

### Production (Single-Machine): Local Filesystem with Nginx

For a standard, single-machine production deployment using Docker Compose, **the local filesystem is the recommended storage backend.** This approach is simple, performant, and secure when properly configured.

-   **Pros**:
    -   **Simplicity**: No extra services are needed for storage, reducing operational complexity.
    -   **High Performance**: Bypasses the application for file transfers, allowing Nginx to serve files directly from disk, which is highly efficient.
    -   **Security**: File access is controlled by Django, which then instructs Nginx to serve the file via a secure internal redirect (`X-Accel-Redirect`).

-   **Cons**:
    -   **Limited Scalability**: This approach is suitable for a single host. It does not scale horizontally across multiple application servers without a network filesystem (NFS).

### Alternative (Large-Scale/Kubernetes): MinIO (S3-Compatible Object Storage)

For large-scale or Kubernetes deployments, **MinIO is the recommended storage backend.**

-   **Pros**:
    -   **High Scalability**: Decouples storage from the application, allowing both to scale independently. This is essential for Kubernetes.
    -   **High Data Durability**: Provides data protection through replication and erasure coding.
    -   **Cloud-Native Standard**: Uses the S3 API, making it the standard choice for containerized applications.

-   **Cons**:
    -   **Increased Complexity**: Requires deploying and managing an additional service (MinIO).

### Development: Local Filesystem

For development, a local filesystem is used for simplicity. The Django development server serves files directly.

---

## 3. Public vs. Protected Files

The system must handle two distinct types of files:

1.  **Public Media (`/media/avatars/`)**: Non-sensitive files like user avatars. These can be served directly by a web server (like Nginx) without permission checks.
2.  **Protected Documents (`/protected-media/`)**: Sensitive user-uploaded documents. Access to these files must be strictly controlled by Django.

---

## 4. Secure File Access Pattern

The primary pattern for secure file access is **Django as the Gatekeeper**. A user never receives a direct, permanent URL to a protected file.

### Production Flow (Local FS + Nginx `X-Accel-Redirect`)

This is the recommended production pattern for single-machine deployments.

1.  **Client Request**: A user requests to download a file from a dedicated Django API endpoint (e.g., `/api/v1/links/{slug}/page/{page_number}/`).
2.  **Django Permission Check**: The Django view performs all business logic checks (authentication, share link status, download permissions, etc.).
3.  **Internal Redirect**: If checks pass, Django's API responds with an empty `200 OK` but includes a special header: `X-Accel-Redirect: /protected-media/path/to/file.png`. It also includes the `Content-Type` header.
4.  **Nginx Serves File**: Nginx intercepts this response. It sees the `X-Accel-Redirect` header and serves the file from the specified internal-only path. The client receives the file as if it came directly from Django, but the application server is freed up immediately.

### Alternative Production Flow (MinIO + Pre-signed URLs)

For large-scale deployments, this pattern is used.

1.  **Client Request**: A user requests a download from the same Django API endpoint.
2.  **Django Permission Check**: The view performs the same permission checks.
3.  **URL Generation**: If checks pass, Django communicates with MinIO to generate a **temporary, secure, pre-signed URL** for the requested file.
4.  **Redirect**: Django's API responds with a `302 Found` redirect, sending the client to the pre-signed URL.
5.  **Direct Download**: The client's browser follows the redirect and downloads the file directly and efficiently from MinIO.

---

## 5. Implementation Details

### Django `settings.py` Configuration

The settings file uses the `STORAGE_TYPE` environment variable to conditionally configure the storage backend.

**Dependencies:**
For MinIO support, `django-storages` and `boto3` are required.
```bash
pip install "django-storages[s3]"
```

**Configuration:**
```python
# backend/backend/settings.py

# This setting is for local FS storage
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Storage Configuration (for FileSystem or MinIO)
STORAGE_TYPE = os.environ.get('STORAGE_TYPE', 'FILESYSTEM')

if STORAGE_TYPE == 'MINIO':
    DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
    AWS_ACCESS_KEY_ID = os.environ.get('MINIO_ROOT_USER')
    AWS_SECRET_ACCESS_KEY = os.environ.get('MINIO_ROOT_PASSWORD')
    AWS_STORAGE_BUCKET_NAME = os.environ.get('MINIO_BUCKET_NAME', 'coneshare')
    AWS_S3_ENDPOINT_URL = os.environ.get('MINIO_ENDPOINT')
    AWS_S3_OBJECT_PARAMETERS = {
        'CacheControl': 'max-age=86400',
    }
    # For local MinIO, which uses http
    AWS_S3_USE_SSL = os.environ.get('AWS_S3_USE_SSL', 'false').lower() == 'true'
    # Required for MinIO
    AWS_S3_ADDRESSING_STYLE = 'path'
    AWS_S3_SIGNATURE_VERSION = 's3v4'

    # Subdirectory within the bucket for all files
    AWS_LOCATION = 'media'
else:  # Default to FileSystemStorage for development and standard production
    DEFAULT_FILE_STORAGE = 'django.core.files.storage.FileSystemStorage'
```

### Production Docker Compose Configuration

A `docker-compose.prod.yml` should be used for production deployments. It introduces an Nginx container to handle web traffic and serve files.

```yaml
# docker-compose.prod.yml
services:
  backend:
    # ... (same as dev, but without port mapping and using gunicorn)
    volumes:
      - ./backend:/app
      - media_volume:/app/media

  nginx:
    build: ./nginx
    ports:
      - "80:80"
    depends_on:
      - backend
    volumes:
      - media_volume:/usr/src/app/media

volumes:
  media_volume:
```

### Nginx Configuration

Nginx acts as a reverse proxy and file server.

```nginx
# nginx/nginx.conf

server {
    listen 80;

    # Publicly accessible media like avatars
    location /media/avatars/ {
        alias /usr/src/app/media/avatars/;
    }

    # Protected media, only accessible via X-Accel-Redirect from the backend
    location /protected-media/ {
        internal; # This is the key security feature
        alias /usr/src/app/media/;
    }

    # Proxy all other requests to the Django application
    location / {
        proxy_pass http://backend:8000;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        proxy_redirect off;
    }
}
```

### Example Django Download View

A download view (like `ShareLinkPageView`) contains conditional logic to handle both development and production environments.

```python
# In a view like ShareLinkPageView

from django.http import HttpResponse, HttpResponseRedirect
from django.conf import settings
import os
import mimetypes

# ... inside your GET method after all permission checks have passed ...

# Assuming 'storage_key' is the path to your file within the media root.
storage_key = "path/to/your/file.png"

if settings.STORAGE_TYPE == 'MINIO':
    # MINIO: Generate a pre-signed URL and redirect.
    from django.core.files.storage import default_storage
    url = default_storage.url(storage_key, expire=60) # 60 second expiry
    return HttpResponseRedirect(url)
else:
    # LOCAL FS (Dev or Prod)
    if settings.DEBUG:
        # --- DEVELOPMENT LOGIC ---
        # Serve the file directly from Django's dev server.
        file_path = os.path.join(settings.MEDIA_ROOT, storage_key)
        try:
            with open(file_path, 'rb') as f:
                content_type, _ = mimetypes.guess_type(storage_key)
                return HttpResponse(f.read(), content_type=content_type)
        except FileNotFoundError:
            return Response({"detail": "File not found on server."}, status=404)
    else:
        # --- PRODUCTION LOGIC (LOCAL FS with NGINX) ---
        # Use X-Accel-Redirect.
        content_type, _ = mimetypes.guess_type(storage_key)
        response = HttpResponse(content_type=content_type)
        # Nginx will serve the file from this internal path.
        response['X-Accel-Redirect'] = f'/protected-media/{storage_key}'
        # This is for inline viewing, not download
        # response['Content-Disposition'] = f'inline; filename="your_file.png"'
        return response
```
