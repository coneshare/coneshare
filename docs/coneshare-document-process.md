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

The `process_document` service function is the entry point for all uploads. It detects the file type and triggers the appropriate background task, ensuring a consistent and modular pipeline.

### Document Files (e.g., DOCX, PPTX)

This follows a two-stage pipeline to convert office documents into a viewable format.

1.  **Initiation**: The `process_document` service detects the file is an office document (e.g., `.docx`). It creates the initial `Document` and `DocumentVersion` records with a status of `'processing'` and triggers the `convert_office_to_pdf_task`.

2.  **Conversion to PDF (Async Task 1)**: The `convert_office_to_pdf_task` runs in the background.
    *   It uses a tool like LibreOffice to convert the original file into a PDF.
    *   It saves the new PDF to storage.
    *   It updates the `DocumentVersion`, changing its `storage_key` to point to the new PDF and its `type` to `'pdf'`.

3.  **PDF Page Processing (Async Task 2)**: After the conversion is complete, the task immediately triggers the `generate_pdf_pages_task` with the ID of the version (which now points to a PDF). This reuses the standard PDF processing logic.

### PDF Files

When a PDF is uploaded directly, it bypasses the initial conversion step.

1.  **Initiation**: The `process_document` service detects the file is a PDF. It creates the `Document` and `DocumentVersion` records with a status of `'processing'`.

2.  **Page Processing Trigger**: It directly triggers the `generate_pdf_pages_task` background task.

3.  **Asynchronous Page Processing**: This task runs in the background to extract each page from the PDF and convert it into an image. This is the final step for all viewable documents.

### Image Files (e.g., PNG, JPG)

Image files are handled differently as they are natively viewable and require no processing.

1.  **Initiation**: The `process_document` service detects the file is an image. It creates the `Document` and `DocumentVersion` records and stores the file.

2.  **No Processing Task**: No Celery task is triggered. The document's status is set directly to `'ready'`.

3.  **Direct Viewing**: The frontend preview logic will generate a secure, direct URL to the stored image file for rendering in the viewer.

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
    
    alt Office Document
        API->>DB: Set status: 'processing'
        API->>Queue: Push convert_office_to_pdf_task
        API-->>Client: 202 Accepted
    else PDF Document
        API->>DB: Set status: 'processing'
        API->>Queue: Push generate_pdf_pages_task
        API-->>Client: 202 Accepted
    else Image File
        API->>DB: Set status: 'ready'
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
