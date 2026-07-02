# Video Processing & Streaming Implementation Plan

## 1. Overview
To support video sharing while preventing raw file leakage and maintaining a responsive UI, we will implement a **Lazy HLS (HTTP Live Streaming)** pipeline. 
Like documents, videos will upload instantly. Upon the first view request, a Celery background worker will transcode the raw video into an HLS format (`.m3u8` playlist and `.ts` transport stream chunks). The frontend will play these chunks dynamically.

## 2. Backend & Processing (Django & Celery)

### Settings & Limits (`backend/core/settings_registry.py` & `backend/backend/settings.py`)
1. **Feature Flag**: Add `ENABLE_VIDEO_PREVIEW` to `.env.template` and settings.py, defaulting to `false` since it consumes high CPU/Memory.
2. **Dynamic Setting**: Register `MAX_VIDEO_PREVIEW_SIZE_MB` (default: `500` MB).
   - *Rationale*: Videos are significantly larger than PDFs/Office files (which default to `100` MB). A separate setting allows admins to prevent massive video transcoding from locking Celery workers while still supporting average-sized videos.
3. **Define MIME Types**: Add `VIDEO_MIMETYPES` (e.g., `video/mp4`, `video/quicktime`, `video/x-msvideo`, `video/webm`) to `backend/documents/services.py`.
4. **Lazy Initialization**: In `_route_document_for_processing`, if `ENABLE_VIDEO_PREVIEW` is false or files exceed `MAX_VIDEO_PREVIEW_SIZE_MB`, they are marked `download_only = True`. Otherwise, set `version.render_status = 'not_generated'`.


### Background Transcoding (`backend/documents/tasks.py`)
1. **Task**: Create `generate_video_stream_task`.
2. **Smart FFmpeg Transcoding**: 
   - Download the raw video.
   - Run a probe (using `ffprobe` or a python library) to inspect codecs.
   - **Transcoding Command**:
     - If the video is already encoded in standard web-safe format (H.264 / AAC), use `-codec: copy` to avoid CPU usage.
     - Otherwise, transcode to ensure browser compatibility: `nice -n 19 ffmpeg -i input -vcodec libx264 -acodec aac -hls_time 10 -hls_list_size 0 playlist.m3u8` (using `nice -n 19` to prevent CPU starvation on self-hosted machines).
3. **Storage**: Save the resulting `.m3u8` playlist file and all `.ts` chunk files to the local file system storage abstraction inside a unique folder for the version (e.g., `org_id/file_id/hls/`).
4. **Database**: Update `version.render_status = 'ready'`, `version.length` (store duration in seconds), and `version.playlist_storage_key`.

### Task Routing & Queue Isolation (`backend/backend/settings.py`)
1. **Queues**: Establish separate Celery queues:
   - `celery` (default): Fast, lightweight tasks (e.g. document conversion, page rendering, file operations).
   - `video_processing`: Slow, resource-intensive video transcoding.
2. **Routing Config**: Map video tasks to the dedicated queue:
   ```python
   CELERY_TASK_ROUTES = {
       'documents.tasks.generate_video_stream_task': {'queue': 'video_processing'},
   }
   ```
3. **Worker Scaling (`docker-compose.yml`)**:
   - The default `celery_worker` only listens to the `celery` queue: `celery -A backend worker -l INFO -Q celery`.
   - A dedicated `video_worker` container listens to the `video_processing` queue with limited concurrency to protect host CPU: `celery -A backend worker -l INFO -Q video_processing --concurrency=1`.


## 3. Secure Streaming Delivery & Download Restrictions

To prevent users from downloading raw video files when watermarking is enabled, we must implement validation rules across the API.

1. **Conflict Resolution (Watermark vs Size Limit)**:
   - If a video exceeds `MAX_VIDEO_PREVIEW_SIZE_MB`, it is marked as `download_only = True`.
   - **Rule**: If `document.type == 'video'` and watermarking is active (`enable_watermark = True`), the download endpoint will strictly return `403 Forbidden` regardless of the `download_only` flag.
   - The user interface will display: *"This video exceeds the size limit to preview, and download is restricted due to watermark requirements."*
2. **Auth & Proxy Endpoint (`core/main.go`)**: Create an endpoint `/api/v1/stream/{document_id}/playlist.m3u8` (and `/chunk/{chunk_name}.ts`). The Go service validates credentials before serving `.ts` files, rewriting playlist chunk paths to route through the authenticated Go proxy.

## 4. Frontend Integration (`frontend`)

1. **Link Watermark Option (`LinkSheet.jsx`)**:
   - Update `isWatermarkable` validation to include videos:
     `const isWatermarkable = ['pdf', 'document', 'image', 'video'].includes(document?.type) || !!dataroom;`
2. **Video Player (`VideoViewer.jsx`)**:
   - Integrate `hls.js` or `video.js`.
   - Position a dynamic CSS/SVG watermark overlay (reusing the logic from `PdfJsViewer.jsx`) over the player.
   - Disable context menus (`onContextMenu={(e) => e.preventDefault()}`) and player download selectors.
3. **Viewer Interface (`DataroomViewer.jsx` & `ShareLinkViewerPage.jsx`)**:
   - Render the `VideoViewer` if `preview_mode` is `'video'`.
   - Implement polling for video preparation status.
   - If `download_only` is true and watermark is enabled, render a descriptive access-restriction error.

## 5. Engagement Tracking

1. **Frontend Event Listeners**:
   - Attach listeners to the HTML5 video element: `play`, `pause`, `seeked`, `timeupdate`, `ended`.
   - **Heartbeat / Batching**: Accumulate watch segments locally and send a heartbeat batch payload to the server every 10 seconds or on `beforeunload`.
2. **Backend Analytics Endpoint (`backend/analytics/`)**:
   - Create a `POST /api/v1/analytics/video-engagement/` endpoint.
   - Record the user/session ID, document ID, and total seconds watched.
   - Store these metrics in a new `VideoEngagement` database model.

## 6. Migration & Dependencies
- **System**: Ensure `ffmpeg` is available on the Celery worker runtime.
- **Frontend**: `npm install hls.js`.
- **Database**: Add `MAX_VIDEO_PREVIEW_SIZE_MB` to the settings registry and write a Django migration for new setting defaults.
