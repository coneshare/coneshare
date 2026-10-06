# Hybrid Document Preview & Download Architecture Plan

This document outlines a hybrid strategy for document preview and file downloads in Coneshare. It balances user experience (preserving clickable hyperlinks and searchable text) with enterprise-grade security (preventing watermark stripping and raw file exfiltration).

---

## 1. Online Viewer Strategy: Server-Rendered Images + HTML Link Overlays

### How it works:
1. **Upload**: PDF/Office files are registered in the database and marked as `render_status = 'not_generated'`. No page JPEGs are generated at upload time.
2. **Lazy Extraction on View**: When a viewer first opens the document, `enqueue_server_preview_render` triggers the Celery tasks (`convert_office_to_pdf_task` and/or `generate_pdf_pages_task`) to generate page JPEGs.
3. **Link Extraction (Celery)**: During this lazy background task (`generate_pdf_pages_task`), Poppler/pypdf parses the page `/Annots` metadata to extract hyperlink URIs and their bounding boxes (`/Rect`).
4. **Database**: Bounding boxes are normalized to percentage coordinates (originating at top-left) and stored in a `JSONField` on `DocumentPage`.
5. **API**: The `/preview-data/` endpoint returns the links metadata alongside page image URLs once the lazy task has successfully completed.
6. **Frontend**: The React viewer absolute-positions transparent `<a>` tags over the page images using the percentages.

```
┌──────────────────────────────────────────────┐
│  [ React relative wrapper ]                  │
│                                              │
│  ┌──────────────────┐ (Page Image: JPEG)     │
│  │                  │                        │
│  │   [ <a> tag absolute overlay ]            │
│  │   style="top: 20%; left: 45%; ..."        │
│  │                  │                        │
│  └──────────────────┘                        │
└──────────────────────────────────────────────┘
```

### Security & UX Review:
* **Attribution (Watermarks)**: Since watermarks are burned into the JPEGs, they cannot be deleted or hidden by DevTools.
* **Exfiltration Protection**: The raw PDF is never sent to the browser, preventing download exfiltration.
* **UX**: Clicking on links in the document works natively and feels seamless.

---

## 2. Download Strategy: Multi-Tiered Security

We introduce three download tiers, governed by whether watermarking is enabled and a configuration flag (`FLATTEN_WATERMARKED_DOWNLOADS`):

```
                     Watermark Enabled?
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
            No                          Yes
             │                           │
   ┌─────────┴─────────┐     ┌───────────┴───────────┐
   ▼                   ▼     ▼                       ▼
Serve Original      Standard Security           High Security
(Links preserved)   (Layered PDF)               (Flattened PDF)
                    [Links preserved,           [Watermark un-strippable,
                     watermark editable]         links lost]
```

### Tier details:
1. **No Watermark (Original File)**:
   * **Behavior**: Serves the clean original PDF.
   * **UX**: Hyperlinks, vector paths, and searchable text are fully preserved.
2. **Watermark Enabled (Standard Security - Layered PDF)**:
   * **Behavior**: Overlays the watermark on the PDF via `pypdf` metadata merging (our current implementation).
   * **UX**: Clickable links and searchable text are preserved.
   * **Risk**: High-capability users can strip the watermark in vector editors.
3. **Watermark Enabled (High Security - Flattened PDF)**:
   * **Behavior**: Converts pages to high-resolution JPEGs (with watermark pixels burned in) and compiles them back into a PDF.
   * **Security**: Watermark is un-strippable, and text cannot be copy-pasted.
   * **UX Trade-off**: Interactive links and selectable text are lost.

---

## 3. Database & Code Changes Required

### A. Database Migration
Add `links` metadata to `DocumentPage` in `backend/documents/models.py`:
```python
class DocumentPage(models.Model):
    # ...
    links = models.JSONField(default=list, blank=True)
```

### B. Celery Task Update (`generate_pdf_pages_task` in `tasks.py`)
Extract links using `pypdf` while pages are converted, normalizing coordinates:
```python
from pypdf import PdfReader

# Inside page processing loop:
reader = PdfReader(BytesIO(pdf_bytes))
page = reader.pages[i]
media_box = page.mediabox
page_w, page_h = float(media_box.width), float(media_box.height)

links = []
if "/Annots" in page:
    for annot in page["/Annots"]:
        obj = annot.get_object()
        if obj.get("/Subtype") == "/Link" and "/A" in obj:
            action = obj["/A"].get_object()
            if action.get("/S") == "/URI" and obj.get("/Rect"):
                x1, y1, x2, y2 = [float(v) for v in obj["/Rect"]]
                links.append({
                    "url": action.get("/URI"),
                    "bbox": {
                        "left": (x1 / page_w) * 100,
                        "top": ((page_h - y2) / page_h) * 100,
                        "width": ((x2 - x1) / page_w) * 100,
                        "height": ((y2 - y1) / page_h) * 100
                    }
                })

DocumentPage.objects.create(
    document_version=version,
    page_number=page_num,
    storage_key=page_storage_key,
    links=links  # Persist link coordinates
)
```

### C. Download View Update (`ShareLinkFileDownloadView` in `views.py`)
Check the security policy to decide whether to flatten:
```python
flatten_active = get_dynamic_setting('FLATTEN_WATERMARKED_DOWNLOADS')

if watermark_enabled:
    if flatten_active:
        # Step 1: Render pages with watermark to JPEGs
        # Step 2: Compile JPEGs back to PDF (img2pdf)
        pdf_stream = _generate_flattened_watermarked_pdf(...)
    else:
        # Serve vector layered PDF (current pypdf + reportlab logic)
        pdf_stream = _generate_watermarked_pdf(...)
else:
    # Serve original PDF
    pdf_stream = _get_original_file(...)
```
