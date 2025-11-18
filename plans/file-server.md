Based on docs/file-storage.md, here is the implementation plan for the dedicated Go file server.

1. New Go File Server (core/)

This new service will handle all direct file I/O operations, abstracting the storage backend from Django.

a. Project Setup & API (HTTP/REST)

 • Initialize a new Go project in the core/ directory.
 • Use a lightweight router like chi or gorilla/mux.
 • Implement two primary internal API endpoints for Django to call:
    • POST /internal/v1/generate-upload-url: Receives a desired storage key, performs validation, and returns a short-lived, pre-signed URL for PUT operations.
    • POST /internal/v1/generate-download-url: Receives a storage key and returns a pre-signed URL for GET operations.
 • Implement public-facing handlers to serve the actual file content based on the pre-signed URLs generated.
 • Secure internal endpoints with a shared secret token passed via an HTTP header from Django.

b. Storage Abstraction

 • The Go server will directly interface with the storage backend (local filesystem or an S3-compatible service like MinIO).
 • Configuration will be managed via environment variables (e.g., STORAGE_TYPE, MINIO_ENDPOINT, S3_BUCKET).

c. Containerization

 • Create a core/Dockerfile to build a minimal, production-ready container for the Go service.

2. Django Backend Changes (backend/)

Django will be modified to delegate all file operations to the new Go file server.

a. Internal API Client

 • Create a simple client/service in Django to handle authenticated communication with the Go server's internal endpoints.

b. Refactor Upload Logic

 • Modify documents.views.DocumentUploadView: Instead of processing the file, it will now:
    1 Ask the Go server for a pre-signed upload URL.
    2 Return this URL to the frontend.
 • Add a new "finalize upload" endpoint. After the frontend uploads the file to the Go server, it will call this endpoint. Django will then create the final Document and DocumentVersion records and
   trigger processing tasks.

c. Refactor Download/Preview Logic

 • Modify documents.views._prepare_pages_data: Instead of generating storage URLs itself, it will now call the Go server to get pre-signed download URLs for each page image.
 • Modify sharelinks.views.ShareLinkPageView, sharelinks.views.WatermarkedFileDownloadView, and sharelinks.views.DataroomFolderDownloadView: After performing permission checks, these views will request
   pre-signed download URLs from the Go server and return a 302 Redirect to the client. The X-Accel-Redirect logic will be removed.

3. Deployment & Integration

a. Docker Compose

 • Add the new core service to docker-compose.yml and docker-compose.prod.yml.
 • Ensure the backend service can communicate with the core service over the internal Docker network.
 • Configure environment variables for both services (e.g., the CORE_API_URL for Django and the shared secret for both).

b. Nginx Configuration (nginx/nginx.conf)

 • The Nginx configuration will be simplified. The /protected-media/ location and X-Accel-Redirect logic will be removed, as the Go server will now handle serving all files directly.
