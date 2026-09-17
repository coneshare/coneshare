# Text selection overlay for server-rendered documents (.docx, .pptx, .pdf)

## 1. Overview and problem statement

Coneshare's server-side document pipeline (the `server_pages` engine) converts Office files (`.docx`, `.pptx`, `.xlsx`) and native PDFs into page images (`PNG` or `JPEG`) displayed in `PreviewViewer.jsx`. This setup keeps watermarking tamper proof, allows progressive page streaming, and avoids client-side PDF parsing overhead, but viewers cannot select, highlight, or copy text. Hyperlinks are currently the only interactive elements on the page, placed as transparent HTML `<a>` boxes.

Goal: support standard browser text selection and clipboard copying (`Cmd+C` or `Ctrl+C`) across server-rendered documents without weakening watermark security or adding visible latency.

---

## 2. Core architectural decisions

### A. Transparent text layer overlay (preserving server_pages)
Instead of switching to client-side rendering engines like PDF.js canvas mode or client WebAssembly viewers:
- Keep the server image pipeline.
- Extract word and line layout coordinates from the intermediate PDF during page generation.
- Send text bounding boxes alongside the existing `page_links` metadata.
- Render a transparent HTML text overlay layer (`TextOverlayLayer`) directly over the page image in `PreviewViewer.jsx`.

### B. Watermark security policy (preventing copy leaks)
- When watermarking is enabled (`enable_watermark = True`):
  The API omits the text layer entirely. The browser receives only flattened JPEG images with the watermark baked into the pixels. This prevents viewers from copying clean text from the clipboard to bypass the visual watermark.
- When watermarking is disabled:
  The API includes the text layout data in the `/preview-data/` response, allowing viewers to select and copy text.

### C. Universal scope
- Applies to all documents processed through the `server_pages` engine: Word (`.docx`, `.doc`), PowerPoint (`.pptx`, `.ppt`), Excel (`.xlsx`, `.xls`), and native PDF (`.pdf`).
- Extracted automatically on new uploads and first-access preview conversions.
- Includes an optional management command to backfill text layers for existing documents without re-rasterizing images.

---

## 3. Performance impact and benchmarks

| Layer | Performance penalty | Details |
|---|---|---|
| Celery worker pipeline | < 2% to 3% overhead (+15ms to 35ms for 10 pages) | Runs `pdftotext -bbox-layout` from `poppler-utils` (already installed in the container). It streams character coordinates directly from the PDF vector stream without rendering pixels or loading fonts. |
| Database storage | ~3 KB to 5 KB per page (~70 KB for a 20-page presentation) | Stored as compact JSON (line-level bounding boxes) in a new `text_content` field on `DocumentPage`. |
| Network transfer | ~12 KB to 18 KB gzipped over the wire | Delivered through `GET /preview-data/`. Compressed text adds less than 10ms of transfer time on typical connections. |
| Browser DOM and scrolling | Negligible | Text is grouped by line instead of word, reducing DOM nodes from ~400 to ~35 per page. The text layer mounts only for pages in or near the viewport. |

---

## 4. Data schema and processing pipeline

### Pipeline sequence
```mermaid
flowchart TD
    A[".docx / .pptx File"] -->|convert_office_to_pdf_task| B["Intermediate PDF"]
    B -->|generate_pdf_pages_task| C["pdf2image: Extract Page PNGs"]
    B -->|generate_pdf_pages_task| D["pypdf: Extract Link Annotations"]
    B -->|pdftotext extraction| E["pdftotext: Extract Lines and Bboxes"]
    C --> F["DocumentPage: Image Asset in Storage"]
    D --> G["DocumentPage.page_links"]
    E --> H["DocumentPage.text_content"]
    F --> I["PreviewViewer.jsx: Image + Text Layer + Link Overlays"]
    G --> I
    H --> I
```

### Database model updates (`backend/documents/models.py`)
Add `text_content` to `DocumentPage`:
```python
class DocumentPage(BaseModel):
    ...
    page_links = models.JSONField(default=dict, blank=True)
    text_content = models.JSONField(default=dict, blank=True)  # Line and word layout bboxes
```

### JSON schema for `text_content`
Coordinates are percentages relative to page dimensions (`page_w`, `page_h`), matching the link bounding box format:
```json
{
  "lines": [
    {
      "text": "Quarterly Revenue Summary",
      "bbox": { "left": 10.5, "top": 5.2, "width": 52.0, "height": 3.1 },
      "font_size_pt": 18
    },
    {
      "text": "Total revenue increased by 24% year-over-year.",
      "bbox": { "left": 10.5, "top": 9.0, "width": 78.4, "height": 2.2 },
      "font_size_pt": 11
    }
  ]
}
```

---

## 5. Frontend implementation (`PreviewViewer.jsx`)

### DOM structure per page
```html
<div class="relative mx-auto w-fit" data-page-number="1">
  <!-- 1. Underlying Page Image -->
  <LazyImage src="/page/1/" alt="Page 1" />

  <!-- 2. Transparent Selectable Text Layer (omitted if watermarked) -->
  <div class="absolute inset-0 pointer-events-auto overflow-hidden select-text text-layer">
    <span 
      class="absolute leading-none whitespace-pre text-transparent cursor-text select-text"
      style="left: 10.5%; top: 5.2%; width: 52%; height: 3.1%; font-size: calc(18pt * var(--zoom));"
    >
      Quarterly Revenue Summary
    </span>
    ...
  </div>

  <!-- 3. Clickable Link Overlays (Z-Index 5, above text layer) -->
  <a href="https://..." class="absolute z-5 cursor-pointer hover:bg-blue-500/10" style="..."></a>
</div>
```

### CSS styling rules
```css
.text-layer span {
  color: transparent;
  transform-origin: 0% 0%;
}

.text-layer span::selection {
  background: rgba(59, 130, 246, 0.35); /* Coneshare primary blue with 35% opacity */
  color: transparent;
}
```

---

## 6. Implementation steps

### Phase 1: Database and extraction pipeline
1. Migration: add `text_content = models.JSONField(default=dict, blank=True)` to `DocumentPage`.
2. Task integration:
   - In `backend/documents/tasks.py` (`generate_pdf_pages_task`):
     - Run `subprocess.run(["pdftotext", "-bbox-layout", str(pdf_path), "-"], ...)`.
     - Parse the Poppler XML output (`<line xMin="..." yMin="..." xMax="..." yMax="...">`).
     - Convert coordinates to percentages normalized by page dimensions.
     - Save the result into `DocumentPage.text_content`.
3. API and serialization:
   - In `backend/documents/serializers.py` and `views.py` (`/preview-data/` endpoint):
     - Include `page.text_content` when `enable_watermark` is `False`.
     - Return empty `text_content: {}` when `enable_watermark` is `True`.

### Phase 2: Frontend viewer integration
4. Component: build `TextOverlayLayer.jsx` inside `PreviewViewer.jsx`.
5. Selection styling: add CSS rules for transparent text and selection highlights.
6. Viewport optimization: mount the text overlay layer only on visible pages.

### Phase 3: Utilities and testing
7. Backfill command: add `python manage.py extract_page_text [--document-id ID]` to generate `text_content` for existing `ready` documents without regenerating image assets.
8. Tests:
   - Unit tests for `pdftotext` parsing and coordinate normalization in `tests/documents/test_tasks.py`.
   - Security tests verifying that `text_content` is stripped when `enable_watermark=True`.
   - Frontend Vitest tests for text selection and link overlay positioning in `PreviewViewer.test.jsx`.
