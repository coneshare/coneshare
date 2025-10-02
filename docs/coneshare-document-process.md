# Coneshare Document Processing Architecture

This document outlines the document processing architecture for Coneshare V1.0. The system is designed for a self-hosted environment and uses an asynchronous pipeline to handle file processing, ensuring the user interface remains responsive.

The V1.0 pipeline is designed to handle common enterprise file types, including office documents (e.g., DOCX, PPTX), PDFs, and images, by routing them through a modular, asynchronous processing pipeline.

---

## Component Map

Based on the `coneshare-techstack.md`, the key components involved in this process are:

| Component            | Technology/Location         | Key Functions                                        |
| -------------------- | --------------------------- | ---------------------------------------------------- |
| **API Endpoint**     | Django REST Framework       | `POST /api/documents/` view, handles file uploads    |
| **Document Processor** | Django Service (`services.py`) | `process_document()` - Creates DB records, triggers task |
| **Office Converter**   | Celery Task (`tasks.py`)    | `convert_office_to_pdf_task()` - Converts DOCX etc. to PDF |
| **PDF Page Processor** | Celery Task (`tasks.py`)    | `generate_pdf_pages_task()` - Extracts pages as images |
| **Queue Manager**    | Redis / RabbitMQ            | Message broker for Celery                            |
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

    Client->>API: POST /api/documents/ (+ file)
    API->>Storage: Store original file
    API->>DB: Create Document & Version
    
    alt Office Doc (previewable size)
        API->>DB: Set status: 'processing'
        API->>Queue: Push convert_office_to_pdf_task
        API-->>Client: 202 Accepted
    else PDF Doc (previewable size)
        API->>DB: Set status: 'processing'
        API->>Queue: Push generate_pdf_pages_task
        API-->>Client: 202 Accepted
    else Image File (previewable size)
        API->>DB: Set status: 'ready'
        API-->>Client: 201 Created
    else Unsupported Type or Too Large
        API->>DB: Set status: 'ready', download_only: true
        API-->>Client: 201 Created
    end

    Note right of Queue: Async processing begins
    
    subgraph Office to PDF Conversion
        Worker->>Queue: Dequeue convert_office_to_pdf_task
        Worker->>Worker: Convert DOCX to PDF (e.g., LibreOffice)
        Worker->>Storage: Store new PDF file
        Worker->>DB: Update DocumentVersion (path & type)
        Worker->>Queue: Push generate_pdf_pages_task for new PDF
    end

    subgraph PDF Page Generation
        Worker->>Queue: Dequeue generate_pdf_pages_task
        loop For each page in PDF
            Worker->>Worker: Convert page to image
            Worker->>Storage: Store page image
            Worker->>DB: Create DocumentPage record
        end
        Worker->>DB: Update Document status to 'ready'
    end
```

---

## Future Versions: Expanding File Support

This modular architecture is designed for extension. To support new file types like CAD or video files in the future, the process is simple:

1.  Create a new, specialized Celery task (e.g., `convert_cad_to_pdf_task`).
2.  Add logic to the `process_document` service to detect the new file type and trigger this new task.
3.  Ensure the new task's final output is a PDF, which can then be handed off to the existing `generate_pdf_pages_task`.

This creates a chained, plug-and-play pipeline that can be expanded without altering the core logic.
