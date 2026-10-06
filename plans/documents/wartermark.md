Here is the updated implementation plan incorporating your new requirements for dynamic text and forced PDF downloads.

Plan Overview

The implementation will be divided into three parts:

 1 Backend: Update the data model and API to store and process watermark settings.
 2 Frontend: Add UI controls to the LinkSheet for enabling watermarks and entering watermark text.
 3 Dynamic Watermark Generation: Create new backend endpoints to dynamically generate watermarked page images for previews and watermarked PDF files for downloads.

────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
1. Backend Implementation

 • Data Model (documents/models.py):
    • A new field will be added to the ShareLink model to store the custom watermark template:
       • watermark_text = models.CharField(max_length=255, blank=True)
 • API Serializer (documents/serializers.py):
    • The ShareLinkSerializer will be updated to include the enable_watermark and watermark_text fields.
 • API View (documents/views.py):
    • The public ShareLinkViewDataView will be modified. When a link has watermarking enabled, the API response will contain the watermark_text template.
    • Crucially, the pages and download_url fields in the API response will point to new, dynamic rendering endpoints instead of direct file URLs.

2. Frontend Implementation

 • Link Creation/Editing Form (frontend/src/components/links/LinkSheet.jsx):
    • An "Enable watermark" Switch will be added to the form. This switch will only be enabled for document types that can be converted to PDF (i.e., pdf and document).
    • When the switch is on, an Input field for the watermark text will appear. The user can enter static text or dynamic variables like {{ip-address}}.
    • The component's state and submission logic will be updated to handle these new fields.

3. Dynamic Watermark Generation (Backend)

This part of the plan addresses your specific requirements for dynamic text, tiled positioning, and PDF-only downloads.

-   **Template Rendering Logic**:
    -   A new helper function will be created on the backend to parse the `watermark_text`.
    -   This function will identify and replace dynamic variables (e.g., `{{ip-address}}`) with real-time data from the viewer's request.
-   **For Page Previews (Dynamic Images)**:
    -   A new endpoint (e.g., `/api/v1/pages/<page_id>/render/`) will serve watermarked page images.
    -   When a request is received, this endpoint will:
        1.  Fetch the viewer's IP address from the request.
        2.  Render the watermark template string (e.g., "Confidential - 127.0.0.1").
        3.  **Create a tiled and rotated watermark layer**: A transparent image layer will be created. The logic will loop through a grid of coordinates, drawing the rendered text at a **45-degree counter-clockwise rotation** at each point to create a repeating pattern.
        4.  Composite this transparent text layer onto the original page image.
        5.  Serve the resulting watermarked image.
-   **For File Downloads (Dynamic PDFs)**:
    -   A new endpoint (e.g., `/api/v1/links/<slug>/download/`) will handle all watermarked downloads. This endpoint will always serve a PDF file.
    -   The logic will be as follows:
        1.  Fetch the viewer's IP address.
        2.  Render the watermark template string.
        3.  Determine the source PDF (original PDF or converted Office doc).
        4.  **Create a tiled and rotated watermark page**: A watermark page will be generated in memory using a library like `reportlab`. The logic will loop through a grid of coordinates, drawing the text string at a **45-degree counter-clockwise rotation** to create a tiled effect.
        5.  Merge this single watermark page onto every page of the source PDF using a library like `pypdf`.
        6.  Serve the newly generated, watermarked PDF to the user for download. The original files will remain unmodified.
