# Coneshare: File Storage Architecture

This document outlines the architecture for handling file storage in Coneshare. The design is built to be secure, scalable, and adaptable for both development and production environments, especially within a containerized context (Docker Compose, Kubernetes).

---

## 1. Core Principles

-   **Security First**: Direct, public access to sensitive documents is prohibited. All file access must be gated by the application's permission logic.
-   **Scalability**: The storage solution must support horizontal scaling of the application, a key requirement for Kubernetes deployments.
-   **Environment Parity**: The system should work seamlessly in a local development environment without requiring a full production stack (like Nginx).

---

## 2. Storage Strategy: Local FS vs. MinIO

The application supports two storage backends, configurable via an environment variable.

### Production: MinIO (S3-Compatible Object Storage)

For production, **MinIO is the recommended storage backend.**

-   **Pros**:
    -   **High Scalability**: Decouples storage from the application, allowing both to scale independently. This is essential for Kubernetes.
    -   **High Data Durability**: Provides data protection through replication and erasure coding, which is not possible with a simple filesystem.
    -   **Cloud-Native Standard**: Uses the S3 API, making it the standard choice for containerized applications and simplifying any future migration to a cloud provider like AWS S3.
    -   **Incompatible with Orchestration**: Using a local filesystem is an anti-pattern in Kubernetes, as it ties application pods to specific nodes, defeating the purpose of orchestration. MinIO is designed for this environment.

-   **Cons**:
    -   **Increased Complexity**: Requires deploying and managing an additional service (MinIO).

### Development: Local Filesystem

For development, a local filesystem is used for simplicity.

-   **Pros**:
    -   **Simplicity**: No extra services are needed. Files are stored in a local `media` directory.
-   **Cons**:
    -   **Not Scalable**: This approach does not scale beyond a single host and is unsuitable for production.

---

## 3. Public vs. Protected Files

The system must handle two distinct types of files:

1.  **Public Media (`/media/`)**: Non-sensitive files like user avatars. These can be served directly by a web server (like Nginx) or from a public MinIO bucket without permission checks.
2.  **Protected Documents (`/protected-media/` or via Pre-signed URLs)**: Sensitive user-uploaded documents. Access to these files must be strictly controlled by Django.

---

## 4. Secure File Access Pattern

The primary pattern for secure file access is **Django as the Gatekeeper**. A user never receives a direct, permanent URL to a protected file.

### Production Flow (MinIO + Pre-signed URLs)

This is the recommended production pattern.

1.  **Client Request**: A user requests to download a file from a dedicated Django API endpoint (e.g., `/api/v1/links/{slug}/download/`).
2.  **Django Permission Check**: The Django view performs all business logic checks (authentication, share link status, download permissions, etc.).
3.  **URL Generation**: If checks pass, Django communicates with the MinIO service and asks it to generate a **temporary, secure, pre-signed URL** for the requested file. This URL has a short expiry time (e.g., 60 seconds).
4.  **Redirect**: Django's API responds with a `302 Found` redirect, sending the client to the pre-signed URL.
5.  **Direct Download**: The client's browser follows the redirect and downloads the file directly and efficiently from MinIO.

### Development Flow (Local FS + Django Dev Server)

In development, the Django development server serves the files directly.

1.  **Client Request**: The client requests a download from the same Django API endpoint.
2.  **Django Permission Check**: The view performs the same permission checks.
3.  **Direct File Serving**: If checks pass, the view opens the file from the local filesystem (`media` directory), creates an `HttpResponse`, and streams the file's contents back to the client.

---

## 5. Implementation Details

### Docker Compose Configuration

The `docker-compose.yml` is configured to run MinIO and initialize a bucket for the application.

```yaml
services:
  backend:
    # ...
    environment:
      - STORAGE_TYPE=MINIO
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
      - MINIO_ENDPOINT=http://minio:9000
      - MINIO_BUCKET_NAME=coneshare
    depends_on:
      - redis
      - minio

  # ... other services

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    restart: unless-stopped

  mc: # MinIO Client to initialize bucket
    image: minio/mc
    depends_on:
      - minio
    entrypoint: >
      /bin/sh -c "
      /usr/bin/mc alias set myminio http://minio:9000 minioadmin minioadmin;
      /usr/bin/mc mb myminio/coneshare --ignore-existing;
      /usr/bin/mc policy set public myminio/coneshare/avatars;
      exit 0;
      "

volumes:
  minio_data:
```

### Django `settings.py` Configuration

The settings file uses the `STORAGE_TYPE` environment variable to conditionally configure the storage backend.

**Dependencies:**
This setup requires `django-storages` and `boto3`.
```bash
pip install "django-storages[s3]"
```

**Configuration:**
```python
# backend/backend/settings.py

# This setting is for local FS storage used in development
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
    AWS_S3_USE_SSL = False  # For local MinIO, which uses http
    AWS_S3_ADDRESSING_STYLE = 'path' # Required for MinIO
    AWS_S3_SIGNATURE_VERSION = 's3v4'
    AWS_S3_OBJECT_PARAMETERS = {
        'CacheControl': 'max-age=86400',
    }
    # All protected files will be stored under a 'documents/' prefix in the bucket
    AWS_LOCATION = 'documents'
else:  # Default to FileSystemStorage for development
    DEFAULT_FILE_STORAGE = 'django.core.files.storage.FileSystemStorage'
```
