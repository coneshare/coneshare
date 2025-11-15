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

---

## 6. Future Architecture: Dedicated File Server

To further enhance scalability, security, and support advanced enterprise features, the long-term architecture will introduce a dedicated file server component, likely written in Go. This service will be simple and focused, exclusively handling file I/O operations (upload, download, delete) and replacing the direct file storage role currently managed by Django.

### Rationale

-   **Django Worker Efficiency**: Offloads long-running file transfer tasks from Python web workers, allowing Django to handle a much higher volume of concurrent API requests.
-   **Security**: A compiled Go binary is harder to decompile or reverse-engineer than Python code, providing a more secure environment for handling sensitive enterprise logic (e.g., licensing, advanced watermarking).
-   **Separation of Concerns**: Creates a clean microservice architecture where Django manages metadata and permissions, while the Go service manages file storage and streaming.

### The Pre-Signed URL Pattern

This architecture relies on temporary, secure URLs (pre-signed URLs) for all file operations. Django acts as the gatekeeper, and the client interacts directly with the file server for the actual data transfer.

#### Download Flow

1.  **Client Request**: The client asks the Django API for a file.
2.  **Django Permission Check**: Django performs all business logic checks (authentication, share link status, etc.).
3.  **URL Generation**: If checks pass, Django makes a fast, internal API call to the Go file server, requesting a temporary download URL for the file's storage key.
4.  **Response**: The Go server returns a short-lived, pre-signed URL. Django sends this URL back to the client.
5.  **Direct Download**: The client downloads the file directly from the Go file server using the pre-signed URL.

#### Upload Flow

1.  **Client Request**: The client informs the Django API it wants to upload a file (providing metadata like filename, size, and destination folder).
2.  **Django Permission Check**: Django verifies that the user is allowed to upload to the specified location.
3.  **URL Generation**: If authorized, Django asks the Go file server to generate a pre-signed URL for an upload.
4.  **Response**: The Go server returns a URL that the client can `PUT` or `POST` to. Django sends this URL to the client.
5.  **Direct Upload**: The client uploads the file's content directly to the Go server using the pre-signed URL.
6.  **Finalization**: After the upload is complete, the client notifies Django, which then finalizes the creation of the `Document` record in the database.

### Communication: Django to Go Server

The internal communication between Django and the Go server is critical. The two primary options are HTTP/REST and gRPC.

#### 1. HTTP/REST

-   **Pros**:
    -   **Simplicity**: Easy to implement and debug with standard tools (`requests` in Python, `net/http` in Go, `curl` for testing).
    -   **Compatibility**: Works with any standard load balancer or proxy.
-   **Cons**:
    -   **Performance**: Text-based JSON serialization is less efficient than binary formats.
    -   **Loose Contract**: The API contract is based on documentation, not code, which can lead to integration errors.

#### 2. gRPC

-   **Pros**:
    -   **High Performance**: Uses efficient binary Protocol Buffers and HTTP/2 for low-latency communication.
    -   **Strict Contract**: The API is defined in a `.proto` file, ensuring type safety and catching breaking changes at compile time.
-   **Cons**:
    -   **Complexity**: Requires managing `.proto` files and a code generation step.
    -   **Debugging**: The binary protocol is not human-readable and requires special tools (`grpcurl`).

### Storage Backend

The Go file server would abstract the physical storage. It could be configured to use:

-   **A Dedicated Local Volume**: A directory like `coneshare-data`, physically separate from Django's `media` volume. This provides strong security isolation, as the Django container would not have the protected files mounted at all.
-   **An Object Store**: An S3-compatible service like MinIO, allowing the file server to be completely stateless and highly scalable.

