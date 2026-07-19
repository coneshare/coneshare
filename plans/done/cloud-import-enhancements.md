# Cloud Drive Import Enhancements

## Requirements
1. **Display Cloud Origin:** Display which cloud storage a file was uploaded from in the document detail page.
2. **Cloud Versioning:** The "upload new version" button should allow the user to choose a new version from cloud storage.
3. **1-Click Refresh:** Add a shortcut button (e.g., "Refresh from Dropbox") that can read and retrieve the latest version in the cloud storage and update the document.
4. **Auto-Sync Compatibility:** Ensure the architecture supports a future auto-sync feature where files can be periodically synced if they change.

## Implementation Plan

### 1. Database Schema & Metadata Modeling
*   **Approach:** Add a `metadata` `JSONField` to the `DocumentVersion` model. This is clean, robust, prevents "version drift", and preserves history for future features like version restoration and auto-sync version tracking.
*   **Database Migration:** Generate and run a migration to add `metadata = JSONField(default=dict, blank=True)` to `DocumentVersion`.
*   **Metadata Schema:** When a version is created via cloud import or refresh, populate its metadata field:
    ```json
    {
      "cloud_import": {
        "provider": "dropbox",
        "provider_display": "Dropbox",
        "connection_id": 12,
        "file_id": "id:abcdef12345",
        "etag_or_rev": "015d30000000000000000"
      }
    }
    ```
    *Note: `etag_or_rev` stores the provider-specific revision tag (e.g., Dropbox `rev`, Nextcloud WebDAV `etag`, or Google Drive `modifiedTime`/`md5Checksum`) for change-detection in future auto-sync tasks.*
*   **Document-Level Metadata:** Storing settings like whether a document auto-syncs will live on `document.metadata`:
    ```json
    {
      "auto_sync": false
    }
    ```
*   **Serializer Update:** In `DocumentSerializer`, define a `cloud_import = serializers.SerializerMethodField()` field that retrieves `cloud_import` from the currently active (`is_primary=True`) version's metadata. Also serialize the `auto_sync` status from document metadata if needed.

### 2. Unified Background Processing & Task Architecture
To avoid code duplication (streaming, temporary file management, MinIO uploads, error handling), we will reuse the existing `import_from_cloud_task` and `process_imported_file()` by adding an optional `version_id` parameter.

*   **API View Layer (Pre-creation):** 
    *   For any cloud version import/refresh, the API view pre-creates the `DocumentVersion` model (and updates the `Document` status to `'uploading'`).
    *   The `DocumentVersion` is saved with the initial `cloud_import` metadata (excluding the `etag_or_rev` which is only resolved during/after download).
    *   The task `import_from_cloud_task` is triggered, receiving `document_id`, `connection_id`, `file_id`, and `version_id`.
*   **Worker Layer (Task Re-use):**
    *   `download_file(file_id)` for each provider will return `etag_or_rev` alongside the content and size details.
    *   `process_imported_file(document, file_data, version_id=None)` reads from the specified version if `version_id` is passed (rather than hardcoding `version_number=1`), saves the resolved `etag_or_rev` into `version.metadata['cloud_import']['etag_or_rev']`, and completes document routing.

### 3. API Endpoints

#### Endpoint A: Refresh Document
*   **Path:** `POST /api/v1/documents/<doc_id>/cloud_refresh/`
*   **Logic:**
    1. Retrieve the primary `DocumentVersion` for the document.
    2. Extract `cloud_import` metadata (connection ID, provider, file ID).
    3. Check user quota using `check_user_quota_on_upload(..., document_to_update=document)` (reusing the target file size).
    4. Create a new `DocumentVersion` with incremented `version_number`, set it as `is_primary = True`, set old version to `is_primary = False`.
    5. Set `document.status = 'uploading'`.
    6. Queue `import_from_cloud_task` with the new version ID.

#### Endpoint B: Import New Version from Cloud
*   **Path:** `POST /api/v1/documents/<doc_id>/cloud_import_version/`
*   **Payload:**
    ```json
    {
      "connection_id": 12,
      "file_id": "...",
      "file_name": "...",
      "file_size": 123456
    }
    ```
*   **Logic:**
    1. Validate permissions and check user quota using `check_user_quota_on_upload(..., document_to_update=document)`.
    2. Create a new `DocumentVersion` with incremented `version_number`, initial status, and updated `cloud_import` metadata.
    3. Set `document.status = 'uploading'`.
    4. Queue `import_from_cloud_task` with the new version ID.

### 4. Frontend UI Enhancements

#### Document Detail Page Header/Meta:
*   Display a badge: `☁️ Imported from {provider_display}` if `document.cloud_import` is present.

#### Version History / Refresh:
*   Show a `🔄 Refresh from {provider_display}` button on the Document Detail panel next to document status or version info if `document.cloud_import` is present.
*   Clicking triggers the refresh API and places the document in a processing state.

#### Upload New Version Button:
*   Convert the current "Upload New Version" button to a Split Button or Dropdown Menu:
    *   *Upload from Computer*
    *   *Import from Cloud Drive*
*   Clicking *Import from Cloud Drive* opens the cloud file picker modal, allowing the user to select any file from their connected accounts, which initiates the `cloud_import_version` flow.

## Execution Checklist
1. [ ] Add `metadata` field to `DocumentVersion` in `backend/documents/models.py`.
2. [ ] Run `python manage.py makemigrations` and `python manage.py migrate` to generate and apply migrations.
3. [ ] Update provider `download_file` methods to return the revision identifier/ETag.
4. [ ] Update `DocumentSerializer` in `backend/documents/serializers.py` to expose `cloud_import` from the primary version.
5. [ ] Refactor `import_from_cloud_task` and `process_imported_file` to support optional `version_id` and saving `etag_or_rev`.
6. [ ] Create views and URLs in the backend for the `cloud_refresh` and `cloud_import_version` endpoints.
7. [ ] Implement frontend UI changes for badges, the refresh button, and split upload options.
