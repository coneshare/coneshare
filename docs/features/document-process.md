# Coneshare Document Processing Architecture

## Strategy refs
- [Coneshare Roadmap](./strategy/coneshare-roadmap.md)
- [Coneshare Technology Stack](./strategy/coneshare-techstack.md)
- [Coneshare Data Model](./coneshare-data-model.md)

## Out of scope
- OCR accuracy tuning and language-model extraction pipelines.
- Media transcoding pipeline design for video/audio beyond the supported HLS transcoding flow.
- Cloud-provider-specific storage optimization strategy.
- Full observability/metrics stack design for workers and queues.

## Design decisions
- Decision: Use asynchronous lazy execution for preview/transcoding generation.
  Rationale: Keeps the upload/API response path fast and responsive, and only utilizes server resource costs when a document or video is actually previewed.
  Tradeoff: Adds eventual-consistency UI states on first preview view.
- Decision: Normalize document preview generation around PDF page extraction.
  Rationale: Provides one rendering path for office and PDF-origin files.
  Tradeoff: Adds conversion dependency for office formats before page generation.
- Decision: Mark unsupported/oversized files as `download_only` with immediate ready status.
  Rationale: Preserves upload usability while avoiding failed or expensive preview pipelines.
  Tradeoff: No in-app preview for these files.
- Decision: Transcode and segment supported video formats into HLS.
  Rationale: Ensures videos (including non-web-safe formats like AVI) play smoothly across all devices/browsers.

This document outlines the document processing architecture for Coneshare. The system is designed for a self-hosted environment and uses an asynchronous, lazy-rendered pipeline to handle file previews, ensuring the user interface remains responsive.

---

## Component Map

Based on the `strategy/coneshare-techstack.md`, the key components involved in this process are:

| Component            | Technology/Location         | Key Functions                                        |
| -------------------- | --------------------------- | ---------------------------------------------------- |
| **API Endpoint**     | Django REST Framework       | `POST /api/v1/documents/` view, handles uploads      |
| **Document Processor** | Django Service (`backend/documents/services.py`) | `_route_document_for_processing()` - sets metadata, defers heavy rendering |
| **Office Converter**   | Celery Task (`backend/documents/tasks.py`) | `convert_office_to_pdf_task()` - converts DOCX etc. to PDF |
| **PDF Page Processor** | Celery Task (`backend/documents/tasks.py`) | `generate_pdf_pages_task()` - extracts pages as images |
| **Video Transcoder**   | Celery Task (`backend/documents/tasks.py`) | `generate_video_stream_task()` - transcodes videos (AVI/MP4) to HLS |
| **Queue Manager**    | Redis                       | Message broker for Celery in current deployment      |
| **Task Runner**      | Celery Worker               | Background process that executes tasks               |
| **Storage**          | MinIO / Filesystem          | Stores original files and generated preview assets  |

---

## File Processing & Lazy Rendering Logic

The `_route_document_for_processing` service function is the entry point for all uploaded files. It inspects the file's type and size to determine if it can be previewed.

### 1. Upload & Initialization Path (Eager / Fast)
1. **Initiation**: The file is stored in original storage.
2. **Setup**: The parent `Document` status is immediately set to `'ready'` (available to download/share), and the `DocumentVersion`'s `render_status` is initialized to `RENDER_NOT_GENERATED`. No Celery tasks are triggered.
3. **Response**: The API returns `202 Accepted` immediately.

### 2. Preview / Transcoding Path (Lazy / Async Trigger)
When the item is first accessed via `GET /api/v1/documents/{id}/preview-data/`:
1. **Office Documents**: The `convert_office_to_pdf_task` is triggered. This task converts the file to PDF and then triggers `generate_pdf_pages_task`.
2. **PDFs**: The `generate_pdf_pages_task` is triggered directly to convert pages to PNG.
3. **Videos**: The `generate_video_stream_task` is triggered to segment/transcode the video to HLS.
4. **Images**: No tasks are run; the status is set to `'ready'`.
5. **Download-Only Files (Unsupported/Large)**: The file is marked as download-only (`download_only=True`), no task is triggered, and the preview engine falls back to direct download options.

---

## System Diagram

```mermaid
sequenceDiagram
    participant Client
    participant API as API (Django)
    participant Queue as Message Queue (Redis)
    participant Worker as Celery Worker
    participant DB as Database (PostgreSQL)
    participant Storage as Storage (MinIO)

    Note over Client, Storage: Phase 1: Upload & Initial Save (No Tasks Run)
    Client->>API: POST /api/v1/documents/ (+ file)
    API->>Storage: Store original file
    API->>DB: Create Document & Version
    API->>DB: Set status: 'ready', render_status: 'not_generated'
    API-->>Client: 202 Accepted

    Note over Client, Storage: Phase 2: First Access & Lazy Task Trigger
    Client->>API: GET /api/v1/documents/{id}/preview-data/
    API->>DB: Check render_status
    alt render_status is 'not_generated'
        API->>DB: Set render_status: 'queued'
        API->>Queue: Push appropriate task (Office/PDF/Video)
    end
    API-->>Client: 200 OK (preview_status: 'processing')

    Note over Client, Storage: Phase 3: Async Background Processing
    subgraph Background Work
        Worker->>Queue: Dequeue task
        Worker->>DB: Set render_status: 'processing'
        Worker->>Storage: Download original file
        alt If Office Doc
            Worker->>Worker: Convert DOCX to PDF (LibreOffice)
            Worker->>Storage: Store PDF
            Worker->>Queue: Push generate_pdf_pages_task
        else If PDF Doc
            loop For each page
                Worker->>Worker: Render page to PNG
                Worker->>Storage: Store PNG
                Worker->>DB: Create DocumentPage record
            end
            Worker->>DB: Set render_status: 'ready'
        else If Video
            Worker->>Worker: Transcode/segment to HLS (ffmpeg)
            Worker->>Storage: Store playlist.m3u8 and .ts segments
            Worker->>DB: Set render_status: 'ready'
        end
    end

    Note over Client, Storage: Phase 4: Resolution & Rendering
    Client->>API: Poll GET /api/v1/documents/{id}/preview-data/
    API->>DB: Fetch DocumentPages/HLS playlist details
    API-->>Client: 200 OK (preview_status: 'ready')
```

### PDF Link Annotation Harvesting
In addition to page image rendering, `generate_pdf_pages_task` parses PDF hyperlinks:
* **pypdf Annotation Extraction**: Extracts `/Link` annotations containing `/URI` actions.
* **Coordinate Normalization**: Normalizes bounding box array ordering using `min` and `max` (to prevent negative widths/heights from non-standard PDF writers).
* **Parity & Triggers**: Runs automatically on first preview for all PDFs. This ensures link metadata is cached in the database and made available to both `PreviewViewer` and `PdfJsViewer`.

---

## Future Versions: Expanding File Support

This modular architecture is designed for extension. To support new file types (e.g. CAD drawings) in the future, the process is simple:

1. Create a specialized Celery task (e.g., `convert_cad_to_pdf_task`).
2. Add routing logic to the preview trigger path (`get_effective_render_status`/`enqueue_server_preview_render`) to detect the new file type and trigger this task.
3. Ensure the task outputs a standard format (like PDF for documents), which can then be handed off to the existing processing systems.

This creates a chained, plug-and-play pipeline that can be expanded without altering the core upload logic.

