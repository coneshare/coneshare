# Implementation Plan: Fully Dynamic Video and Document Preview Evaluation

## 1. Goal
Currently, video and document previewability (`download_only`) is computed during file upload and persisted statically as a boolean on the `Document` database table. Adjusting settings like `MAX_VIDEO_PREVIEW_SIZE_MB`, `MAX_PREVIEW_FILE_SIZE_MB`, or `ENABLE_VIDEO_PREVIEW` does not affect already uploaded files, resulting in an awkward user experience.

This plan details the steps to transition to **Option A (Fully Dynamic Read-Time Evaluation)**, which resolves the `download_only` status dynamically when queried.

---

## 2. Proposed Changes

### A. Backend Model (`backend/documents/models.py`)
Add a new `@property` named `is_download_only` to the [Document](file:///Users/xiez/coneshare/backend/documents/models.py#L49-L90) model to evaluate preview status at runtime based on the file type, size, and system configurations.

```python
    @property
    def is_download_only(self) -> bool:
        """
        Dynamically calculates whether the document can only be downloaded.
        Checks file type limits and enabled settings in real-time.
        """
        from django.conf import settings
        from core.services import get_dynamic_setting

        # 1. Unsupported raw files
        if self.type == 'file':
            return True

        # 2. Videos
        if self.type == 'video':
            if not settings.ENABLE_VIDEO_PREVIEW:
                return True
            max_video_size = get_dynamic_setting('MAX_VIDEO_PREVIEW_SIZE_MB')
            return bool(self.file_size and self.file_size > (max_video_size * 1024 * 1024))

        # 3. Office Documents
        if self.type == 'document':
            if not settings.ENABLE_OFFICE_PREVIEW:
                return True
            max_preview_size = get_dynamic_setting('MAX_PREVIEW_FILE_SIZE_MB')
            return bool(self.file_size and self.file_size > (max_preview_size * 1024 * 1024))

        # 4. PDF Documents
        if self.type == 'pdf':
            max_preview_size = get_dynamic_setting('MAX_PREVIEW_FILE_SIZE_MB')
            return bool(self.file_size and self.file_size > (max_preview_size * 1024 * 1024))

        # Fallback to the persisted DB column (e.g., images, manually overridden status)
        return self.download_only
```

### B. Serializers (`backend/documents/serializers.py`)
Modify the `DocumentSerializer` to source the `download_only` field dynamically from the `is_download_only` property. This maintains API backward compatibility with the frontend.

```python
    # backend/documents/serializers.py
    download_only = serializers.BooleanField(source='is_download_only', read_only=True)
```

### C. Services & Codebase Audits (`backend/documents/services.py` & `backend/sharelinks/`)
Locate and update all read access references to `document.download_only` to use `document.is_download_only`.

Specifically:
1. **[services.py](file:///Users/xiez/coneshare/backend/documents/services.py)**:
   - In `is_server_renderable_version`: Change `if document.download_only:` to `if document.is_download_only:`
   - In `preview_mode_for_version`: Change `if document.download_only:` to `if document.is_download_only:`
2. **[sharelinks/serializers.py](file:///Users/xiez/coneshare/backend/sharelinks/serializers.py)**:
   - In `validate`: Change `if document.download_only:` to `if document.is_download_only:`
3. **[sharelinks/views.py](file:///Users/xiez/coneshare/backend/sharelinks/views.py)**:
   - In `ShareLinkViewerPageDetailView`: Change `allow_download = True` checks to reference `document.is_download_only`.
   - Update serialized payload: `"download_only": document.is_download_only,`

---

## 3. Benefits & Trade-offs

### Pros
* **Immediate Effect**: Upgrading size settings immediately enables previews for existing uploaded videos and documents.
* **No Database Migrations Required**: Since we keep the existing `download_only` column as a fallback and reuse it in properties/serializers, no schema alterations or database migrations are needed.
* **No Cache Busting / Scripts Required**: Administrators do not need to re-upload files or execute shell reprocessing scripts.

### Cons
* **Negligible Performance Cost**: Reading `get_dynamic_setting` requires a Redis lookup. Because Redis access is highly optimized, the latency added is sub-millisecond and won't affect serialization speeds.

---

## 4. Test Verification
Add unit tests verifying that changing `MAX_VIDEO_PREVIEW_SIZE_MB` dynamically alters the output of `document.is_download_only` and the serialized `download_only` API response.
