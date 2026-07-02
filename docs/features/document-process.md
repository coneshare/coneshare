# Coneshare Document Processing Architecture

## Strategy refs
- [Coneshare Roadmap](./strategy/coneshare-roadmap.md)
- [Coneshare Technology Stack](./strategy/coneshare-techstack.md)
- [Coneshare Data Model](./coneshare-data-model.md)

## Out of scope
- OCR accuracy tuning and language-model extraction pipelines.
- Media transcoding pipeline design for video/audio beyond current file processing flow.
- Cloud-provider-specific storage optimization strategy.
- Full observability/metrics stack design for workers and queues.

## Design decisions
- Decision: Use asynchronous task execution for preview generation.
  Rationale: Keeps upload/API response path responsive and offloads expensive conversion work.
  Tradeoff: Requires background worker operations and eventual-consistency UI states.
- Decision: Normalize preview generation around PDF page extraction.
  Rationale: Provides one rendering path for office and PDF-origin files.
  Tradeoff: Adds conversion dependency for office formats before page generation.
- Decision: Mark unsupported/oversized files as `download_only` with immediate ready status.
  Rationale: Preserves upload usability while avoiding failed or expensive preview pipelines.
  Tradeoff: No in-app preview for these files.

This document outlines the document processing architecture for Coneshare V1.0. The system is designed for a self-hosted environment and uses an asynchronous pipeline to handle file processing, ensuring the user interface remains responsive.

The V1.0 pipeline is designed to handle common enterprise file types, including office documents (e.g., DOCX, PPTX), PDFs, and images, by routing them through a modular, asynchronous processing pipeline.

---

## Component Map

Based on the `strategy/coneshare-techstack.md`, the key components involved in this process are:

| Component            | Technology/Location         | Key Functions                                        |
| -------------------- | --------------------------- | ---------------------------------------------------- |
| **API Endpoint**     | Django REST Framework       | `POST /api/v1/documents/` view, handles file uploads |
| **Document Processor** | Django Service (`backend/documents/services.py`) | `process_document()` - creates DB records, triggers tasks |
| **Office Converter**   | Celery Task (`backend/documents/tasks.py`) | `convert_office_to_pdf_task()` - converts DOCX etc. to PDF |
| **PDF Page Processor** | Celery Task (`backend/documents/tasks.py`) | `generate_pdf_pages_task()` - extracts pages as images |
| **Queue Manager**    | Redis                       | Message broker for Celery in current deployment      |
| **Task Runner**      | Celery Worker               | Background process that executes tasks               |
| **Storage**          | MinIO / Filesystem          | Stores original PDFs and generated page images       |

---

## V1.0 File Processing Logic

The `process_document` service function is the entry point for all uploads. It inspects the file's type and size to determine if it can be previewed. Based on this, it either triggers the appropriate background processing task or marks the file as "download-only."

### Previewable Documents (Office, PDF, Images)

Files that are of a supported type (Office, PDF, Image) and under the configured size limit (e.g., 100MB) are sent for processing.

1.  **Initiation**: The `process_document` service checks the file. It creates `Document` records with a status of `'processing'`.

2.  **Routing**:
    *   **Office Documents**: The `convert_office_to_pdf_task` is triggered. This task converts the file to PDF and then triggers the `generate_pdf_pages_task`.
    *   **PDFs**: The `generate_pdf_pages_task` is triggered directly.
    *   **Images**: No task is needed. The status is set to `'ready'`.

### Download-Only Files (Unsupported Types or Large Files)

If a file is of an unsupported type (e.g., a ZIP archive) or exceeds the preview size limit, it is marked for download only.

1.  **Initiation**: The `process_document` service identifies the file as download-only.

2.  **No Processing**: No Celery task is triggered. The `Document` is created with a `download_only` flag set to `True` and its status is immediately set to `'ready'`.

3.  **Share Link Behavior**: When a share link is created for this document, the "Allow Download" option is automatically and permanently enabled.

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

    Client->>API: POST /api/v1/documents/ (+ file)
    API->>Storage: Store original file
    API->>DB: Create Document & Version
    
    alt Office Doc (previewable size)
        API->>DB: Set status: 'processing'
        API->>Queue: Push convert_office_to_pdf_task
        API-->>Client: 202 Accepted (recommended for async path)
    else PDF Doc (previewable size)
        API->>DB: Set status: 'processing'
        API->>Queue: Push generate_pdf_pages_task
        API-->>Client: 202 Accepted (recommended for async path)
    else Image File (previewable size)
        API->>DB: Set status: 'ready'
        API-->>Client: 201 Created (recommended for immediate-ready path)
    else Unsupported Type or Too Large
        API->>DB: Set status: 'ready', download_only: true
        API-->>Client: 201 Created (recommended for immediate-ready path)
    end

    Note right of Queue: Async processing begins
    
    subgraph Office to PDF Conversion
        Worker->>Queue: Dequeue convert_office_to_pdf_task
        Worker->>Worker: Convert DOCX to PDF (e.g., LibreOffice)
        Worker->>Storage: Store new PDF file
        Worker->>DB: Update DocumentVersion (path & type)
        Worker->>Queue: Push generate_pdf_pages_task for new PDF
    end

    subgraph PDF Page Generation & Link Extraction
        Worker->>Queue: Dequeue generate_pdf_pages_task
        Worker->>Worker: Parse PDF annotations (/Annots) via pypdf
        Note over Worker: Normalizes coordinates (min/max) to prevent negative bounds
        loop For each page in PDF
            Worker->>Worker: Convert page to image
            Worker->>Storage: Store page image
            Worker->>DB: Create DocumentPage record with page_links JSON payload
        end
        Worker->>DB: Update Document status to 'ready'
    end
```

### PDF Link Annotation Harvesting
In addition to page image rendering, `generate_pdf_pages_task` parses PDF hyperlinks:
* **pypdf Annotation Extraction**: Extracts `/Link` annotations containing `/URI` actions.
* **Coordinate Normalization**: Normalizes bounding box array ordering using `min` and `max` (to prevent negative widths/heights from non-standard PDF writers).
* **Parity & Triggers**: Runs automatically on first preview for all PDFs. This ensures link metadata is cached in the database and made available to both `PreviewViewer` and `PdfJsViewer`.

---

## Future Versions: Expanding File Support

This modular architecture is designed for extension. To support new file types like CAD or video files in the future, the process is simple:

1.  Create a new, specialized Celery task (e.g., `convert_cad_to_pdf_task`).
2.  Add logic to the `process_document` service to detect the new file type and trigger this new task.
3.  Ensure the new task's final output is a PDF, which can then be handed off to the existing `generate_pdf_pages_task`.

This creates a chained, plug-and-play pipeline that can be expanded without altering the core logic.
