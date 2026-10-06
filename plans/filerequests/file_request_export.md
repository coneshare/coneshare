# Implementation Plan: Export File Request Uploads to Connected Storage

## Overview
Enable manual exportation of files uploaded via File Requests to connected cloud storage providers (Nextcloud, Google Drive, Dropbox). This bridges the gap between controlled external intake and existing internal storage workflows.

---

## 1. OAuth Scope Upgrades (Gotcha Prevention)
Since Coneshare was previously read-only, we must update the scopes requested during connection creation to permit write operations:
*   **Google Drive (`google_drive.py`)**:
    - Add `'https://www.googleapis.com/auth/drive.file'` to `GoogleDriveProvider.SCOPES`.
    - This allows creating files and folders within Google Drive.
*   **Dropbox (`dropbox.py`)**:
    - Add `'files.content.write'` to the scope array inside `get_authorization_url()`.
    - This permits writing new file streams to Dropbox folders.

---

## 2. Database Schema
Create a new model `UploadExportJob` to track the state, progress, and audit logs of all exports.

**Model: `UploadExportJob`** (in `backend/filerequests/models.py`)
```python
class UploadExportJob(BaseModel):
    class Status(models.TextChoices):
        QUEUED = 'queued', 'Queued'
        EXPORTING = 'exporting', 'Exporting'
        EXPORTED = 'exported', 'Exported'
        FAILED = 'failed', 'Failed'
        BLOCKED_SCAN = 'blocked_security_scan', 'Blocked (Security Scan)'
        BLOCKED_POLICY = 'blocked_policy', 'Blocked (Policy)'

    uploaded_file = models.ForeignKey(
        'UploadedFile', on_delete=models.CASCADE, related_name='export_jobs'
    )
    connection = models.ForeignKey(
        'cloudfiles.CloudConnection', on_delete=models.CASCADE, related_name='export_jobs'
    )
    destination_folder_id = models.CharField(max_length=1024, help_text="Folder ID or destination path.")
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.QUEUED)
    error_message = models.TextField(blank=True, default='')
    provider_file_id = models.CharField(max_length=1024, blank=True, default='', help_text="File ID in remote storage.")

    class Meta:
        ordering = ['-created_at']
```
*   **Register in Admin**: Register `UploadExportJob` in `backend/filerequests/admin.py` to allow administrators to monitor exports.

---

## 3. Provider Interface Extensions
Extend `BaseCloudProvider` (and its subclasses) to support uploading file streams.

### Base Interface (`base.py`)
```python
def upload_file(self, file_obj, file_name, folder_id):
    """
    Uploads a file stream to the cloud provider.
    Returns: The remote file ID or path.
    """
    raise NotImplementedError
```

### Subclass Implementations
1.  **Dropbox (`dropbox.py`)**:
    - Use `self._get_client()` to get a `dropbox.Dropbox` instance.
    - Destination path: `f"{folder_id}/{file_name}"` or `f"/{file_name}"` if root.
    - Invoke `client.files_upload(file_obj.read(), path, mode=dropbox.files.WriteMode.overwrite)`.
2.  **Google Drive (`google_drive.py`)**:
    - Use `self._get_client()` to get the Drive API service.
    - Set file metadata: `{'name': file_name, 'parents': [folder_id]}`.
    - Use `MediaIoBaseUpload(file_obj, mimetype=..., resumable=True)` to stream the file.
    - Execute `service.files().create(body=metadata, media_body=media).execute()`.
3.  **Nextcloud (`nextcloud.py`)**:
    - Compute WebDAV destination URL:
      `{host}/remote.php/dav/files/{username}/{folder_path}/{file_name}`
    - Perform an `httpx.put` request, streaming the file data. Handle basic auth header constructed from OAuth credentials or WebDAV app passwords.

---

## 4. Celery Task Pipeline
Introduce an asynchronous task to run exports in the background.

*   **Task**: `export_upload_to_cloud_task(job_id)` in `backend/filerequests/tasks.py`
*   **Execution Logic**:
    1.  Fetch `UploadExportJob` with `select_related('uploaded_file__document', 'connection')`.
    2.  **Security & Policy Guard Checks**: 
        - Check malware status on the associated file. If scan failed or is pending, update job status to `BLOCKED_SCAN` and abort.
        - Evaluate any organizational export policies. If blocked by policy, update job status to `BLOCKED_POLICY` and abort.
    3.  Set status to `EXPORTING`.
    4.  Fetch the file stream from Coneshare internal storage using the document's version storage key (e.g. MinIO client helper).
    5.  Call `provider.upload_file(...)`.
    6.  On success: Set status to `EXPORTED` and save `provider_file_id`.
    7.  On failure (e.g. token expired, network failure, quota exceeded): Catch exception, set status to `FAILED`, and record the exception text in `error_message`.

---

## 5. REST API Endpoints

### 1. GET `/api/v1/cloudfiles/connections/<id>/folders/`
A lightweight endpoint that filters out files and returns only directory lists (to feed the frontend picker).
- **Serializer**: Reuses `CloudItemSerializer` or custom folder structures.

### 2. POST `/api/v1/filerequests/<request_id>/exports/`
Trigger export jobs for a list of uploaded files.
- **Request Body**:
  ```json
  {
    "connection_id": "conn_123",
    "uploaded_file_ids": ["up_1", "up_2"],
    "destination_folder_id": "dir_abc"
  }
  ```
- **Action**: Verifies requesting user is the owner of the `FileRequest`, validates connection ownership, creates `UploadExportJob` instances in `queued` state, and launches the celery tasks.

### 3. GET `/api/v1/filerequests/<request_id>/exports/`
List export jobs for a given file request so the owner can track history and failure contexts.

---

## 6. Frontend UI Changes
1.  **Directory Selection Modal**:
    - Creates a dynamic navigation picker. Selecting a connection fetches `/folders/` root. Clicking a folder navigates deep into subfolders.
2.  **Action Buttons**:
    - Add a "Export to Connected Storage" action to the row/bulk actions in the File Request Uploads list.
3.  **Status Badges**:
    - Add an "Export Status" column to the uploads table showing states: `Queued`, `Exporting`, `Exported`, `Failed`, `Blocked`. If `Failed` or `Blocked`, hovering shows a tooltip with the status detail or `error_message`.
