# Coneshare: File Storage Architecture

This document outlines the architecture for handling file storage in Coneshare. The design is built to be secure, scalable, and adaptable for both development and production environments, especially within a containerized context using Docker Compose.

---

## 1. Core Principles

-   **Security First**: Direct, public access to sensitive documents is prohibited. All file access must be gated by the application's permission logic.
-   **Simplicity**: The default storage solution should be easy to set up and manage for a standard single-machine deployment.
-   **Performance**: File serving should be efficient and not block application workers.

---

## 2. Storage Strategy: Local Filesystem with Nginx

For both development and standard production deployments, **the local filesystem is the primary and recommended storage backend.** This approach is simple, performant, and secure when properly configured with Nginx.

-   **Pros**:
    -   **Simplicity**: No extra services are needed for storage, reducing operational complexity and resource usage.
    -   **High Performance**: Bypasses the application for file transfers, allowing Nginx to serve files directly from disk, which is highly efficient.
    -   **Security**: File access is controlled by Django, which then instructs Nginx to serve the file via a secure internal redirect (`X-Accel-Redirect`).

-   **Cons**:
    -   **Limited Scalability**: This approach is suitable for a single host. It does not scale horizontally across multiple application servers without a shared network filesystem (like NFS).

### Development Environment

For local development, the same local filesystem storage is used. The Django development server is configured to serve the media files directly, providing a consistent experience without requiring Nginx.

### Future Alternatives (Large-Scale Deployments)

For large-scale or Kubernetes deployments where a single-host filesystem is insufficient, alternative storage backends like a shared NFS volume or an S3-compatible object store (e.g., MinIO) can be configured. These are considered advanced setups and are not part of the default configuration.

---

## 3. Public vs. Protected Files

The system handles two distinct types of files:

1.  **Public Media (`/media/avatars/`)**: Non-sensitive files like user avatars. These can be served directly by Nginx without permission checks.
2.  **Protected Documents (`/protected-media/`)**: Sensitive user-uploaded documents. Access to these files must be strictly controlled by Django.

---

## 4. Secure File Access Pattern: Django as the Gatekeeper

The primary pattern for secure file access is **Django as the Gatekeeper**. A user never receives a direct, permanent URL to a protected file.

### Production Flow (Local FS + Nginx `X-Accel-Redirect`)

This is the recommended production pattern.

1.  **Client Request**: A user requests to view or download a file from a dedicated Django API endpoint (e.g., `/api/v1/links/{slug}/page/{page_number}/`).
2.  **Django Permission Check**: The Django view performs all business logic checks (authentication, share link status, download permissions, etc.).
3.  **Internal Redirect**: If checks pass, Django's API responds with an empty `200 OK` but includes a special header: `X-Accel-Redirect: /protected-media/path/to/file.png`. It also includes the `Content-Type` header.
4.  **Nginx Serves File**: Nginx intercepts this response. It sees the `X-Accel-Redirect` header and serves the file from the specified internal-only path. The client receives the file as if it came directly from Django, but the application server is freed up immediately.

---

## 5. Implementation Details

### Django `settings.py` Configuration

The settings file defaults to using the local filesystem. The `STORAGE_TYPE` environment variable can be used to switch to other backends in advanced setups.

```python
# backend/backend/settings.py

# This setting is for local FS storage
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Storage Configuration (Defaults to FileSystem)
STORAGE_TYPE = os.environ.get('STORAGE_TYPE', 'FILESYSTEM')

if STORAGE_TYPE == 'MINIO':
    # Configuration for MinIO would go here for advanced setups
    DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
    # ... other MinIO settings
else:  # Default to FileSystemStorage for development and standard production
    DEFAULT_FILE_STORAGE = 'django.core.files.storage.FileSystemStorage'
```

### Production Docker Compose Configuration

A `docker-compose.prod.yml` is used for production deployments. It introduces an Nginx container to handle web traffic and serve files from a shared volume.

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

Nginx acts as a reverse proxy and secure file server.

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

A download view (like `ShareLinkPageView`) contains logic to handle both development and production environments, as well as different storage backends if configured.

```python
# In a view like ShareLinkPageView

from django.http import HttpResponse, HttpResponseRedirect
from django.conf import settings
from django.core.files.storage import default_storage
import mimetypes

# ... inside your GET method after all permission checks have passed ...

# Assuming 'storage_key' is the path to your file.
storage_key = "path/to/your/file.png"

if settings.STORAGE_TYPE == 'FILESYSTEM' and not settings.DEBUG:
    # Production with local filesystem: Use X-Accel-Redirect for performance and security.
    content_type, _ = mimetypes.guess_type(storage_key)
    response = HttpResponse(content_type=content_type or 'application/octet-stream')
    response['X-Accel-Redirect'] = f'/protected-media/{storage_key}'
    return response
else:
    # Handles:
    # 1. Development with local filesystem (serves via Django dev server).
    # 2. Production with an object store like MinIO (generates a pre-signed URL).
    url = default_storage.url(storage_key)
    return HttpResponseRedirect(url)
```

