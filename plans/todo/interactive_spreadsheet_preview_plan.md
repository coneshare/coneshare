# Interactive Multi-Sheet Spreadsheet Preview Plan (.xlsx, .csv, .xls)

## 1. Overview and Problem Statement

Currently, Coneshare treats `.xlsx` and `.xls` spreadsheets like printable office documents when rendered through the legacy office pipeline. In `convert_office_to_pdf_task`, headless LibreOffice Calc paginates spreadsheets into a fixed-width portrait PDF. When a spreadsheet has more columns than fit horizontally on a standard page (e.g. 8 columns), Calc splits the sheet across horizontal page bands. Under Calc's default "Down, then Over" print order, rows 1–N for columns 1–6 are rendered across Pages 1–3, followed by rows 1–N for columns 7–8 on Pages 4–6.

When `PreviewViewer.jsx` displays these rasterized PDF pages:
- Content is fragmented: columns of the same row are split across distant pages.
- Multi-sheet workbooks lose their native tab hierarchy.
- Cells cannot be comfortably scrolled or searched as a continuous 2D table.

**Goal**: Provide a native, interactive multi-sheet spreadsheet preview (`SpreadsheetViewer.jsx`) for `.xlsx`, `.csv`, and `.xls` files that preserves grid layout, sheet tabs, and formatting while enforcing Coneshare's strict security, watermarking, and download protections.

---

## 2. Core Architectural Decisions

### A. Client-Side Interactive Cell Grid (`SpreadsheetViewer.jsx`)
- **2D Virtual Windowing (Pure React)**: Virtualizes both rows and columns via container scroll math and cumulative offset binary search so only visible cells in the current viewport are mounted, ensuring smooth 60fps scrolling even with 2,000 rows × 100 columns without adding heavy external dependencies.
- **Tabbed Navigation**: Bottom tab bar to switch between multiple sheets in the workbook.
- **Header Indices**: Column letters (`A`, `B`, `C`...) and row numbers (`1`, `2`, `3`...).
- **Cell Formatting**: Renders pre-formatted display values, text alignment, bold, font colors, background fills, and merged cells.
- **Active Cell & Toolbar Integration**: Clicking a cell highlights its border and shows the cell coordinate (e.g. `B4`). Zoom controls (90%, 100%, 110%, 125%) scale font sizes and cell dimensions.
- **In-Sheet Search**: Quick search input in the toolbar to find keywords and highlight matching cells.

### B. Backend Strategy Pattern (`SpreadsheetRenderer`)
- Dedicated `SpreadsheetRenderer` extending [`BasePreviewRenderer`](https://github.com/coneshare/coneshare/blob/main/backend/documents/renderers/base.py) under [`backend/documents/renderers/`](https://github.com/coneshare/coneshare/tree/main/backend/documents/renderers/).
- Background Celery task (`generate_spreadsheet_preview_task`) parses `.xlsx` (using `openpyxl` with `data_only=True`), `.csv`, and `.xls` (converted to `.xlsx` via headless LibreOffice) into a compact, sanitized JSON payload (`<base_path>_spreadsheet.json`).
- Pre-formats numbers, currencies, and dates into human-readable display strings (`v`) using `openpyxl` formatters, avoiding the need for heavy client-side Excel format engines.
- **Sheet Count Metadata**: Sets `version.num_pages = len(sheets)` and `document.num_pages = len(sheets)` so UI cards and tables display "N sheets".
- **Security Benefit**: When `allow_download = False`, the viewer receives only the sanitized JSON preview payload. The raw binary file is never transmitted to the browser, protecting underlying data models and hidden formulas.

### C. Scale Guardrails & Truncation
- Cap preview rendering at **2,000 rows × 100 columns per sheet**.
- If a sheet exceeds these limits, it is marked as `is_truncated: true` in the JSON.
- The viewer displays a clear notice banner: *"Showing the first 2,000 rows. Download the full file for complete analysis."*
- Files larger than `MAX_PREVIEW_FILE_SIZE_MB` continue to be routed immediately as `download_only`.

### D. Sheet Visibility & CSV Robustness
- **Excel Sheet Visibility**: Respects workbook settings by exporting only visible sheets; sheets marked as `'hidden'` or `'veryHidden'` are skipped. Empty visible sheets are included with an "Empty sheet" placeholder.
- **CSV Parsing Robustness**: Detects encoding (`utf-8`, `utf-8-sig`/BOM, with `latin-1` fallback) and uses `csv.Sniffer` to auto-detect delimiters (comma, tab, semicolon, pipe) with comma fallback.

### E. Backward Compatibility (Zero Migration Policy)
- **Zero Historical Migration**: Existing `.xlsx`, `.csv`, and `.xls` files previously processed with `has_pages = True` remain untouched on their legacy `server_pages` image views.
- **Selective Claiming**: `SpreadsheetRenderer.can_handle_version` claims versions where `type == 'spreadsheet'`, or ungenerated versions (`has_pages = False`) matching spreadsheet extensions (`.xlsx`, `.csv`, `.xls`). If a version already has `has_pages = True`, it falls through to `OfficeRenderer`.

### F. Security, Watermarking & Fallbacks
- **Watermark Overlay**: When `enable_watermark = True`, an SVG repeating pattern watermark (displaying viewer email, IP, and timestamp) is overlaid directly across the spreadsheet viewport, matching `PdfJsViewer.jsx`.
- **Copy Protection**: When watermarking is active or downloads are restricted, the viewer disables browser text selection (`select-none`) and intercepts `copy` events to prevent data leaks.
- **Legacy Formats (.xls)**: `.xls` files are converted to modern `.xlsx` via headless LibreOffice inside `generate_spreadsheet_preview_task` and then parsed into interactive JSON by `openpyxl`. This avoids Calc's "Down, then Over" horizontal split-page banding on multi-column spreadsheets. Historical versions with `has_pages = True` continue to be served by `OfficeRenderer`.
- **On-Demand Watermarked PDF**: If an external recipient explicitly requests a watermarked PDF export of an `.xlsx` file, LibreOffice is invoked on-demand with `SinglePageSheets: true` to generate the download asset.

---

## 3. Data Schema & Processing Pipeline

### Pipeline Sequence
```mermaid
flowchart TD
    A[".xlsx / .csv / .xls File Uploaded"] -->|renderers.get_renderer_for_file| B["SpreadsheetRenderer.initialize_metadata"]
    B -->|Check MAX_PREVIEW_FILE_SIZE_MB| C["status: 'ready', render_status: 'not_generated'"]
    C -->|GET /preview-data/| D["renderer.enqueue_render_task (Two-Phase Commit)"]
    D -->|Phase 1: Atomic update to QUEUED| E["SpreadsheetRenderer._dispatch_task"]
    E -->|Phase 2: Celery broker dispatch| F["generate_spreadsheet_preview_task"]
    F -->|openpyxl data_only=True / csv.Sniffer| G["Extract Visible Sheets, Format Values & Styles"]
    G -->|Cap at 2,000 rows x 100 cols| H["Build sanitized preview.json"]
    H -->|Upload to Storage| I["<base_path>_spreadsheet.json"]
    I -->|Set render_status: 'ready', num_pages = len(sheets)| J["DocumentVersion (has_pages=False)"]
    J -->|GET /preview-data/| K["preview_mode: 'spreadsheet' + spreadsheet_preview_url"]
    K -->|Client Fetch| L["SpreadsheetViewer.jsx: Tabs + Virtual Grid + Watermark Overlay"]
```

### JSON Schema for `spreadsheet_preview.json`
```json
{
  "version": 1,
  "filename": "Q3_Financials.xlsx",
  "active_sheet_index": 0,
  "sheets": [
    {
      "id": "sheet-0",
      "name": "Summary",
      "row_count": 45,
      "col_count": 8,
      "is_truncated": false,
      "columns": [
        { "index": 0, "name": "A", "width": 80 },
        { "index": 1, "name": "B", "width": 140 }
      ],
      "merges": [
        { "start_row": 0, "start_col": 0, "end_row": 0, "end_col": 3 }
      ],
      "cells": {
        "0:0": { "v": "Quarterly Revenue Summary", "t": "s", "s": { "b": true, "sz": 14, "al": "center", "bg": "#f3f4f6" } },
        "1:0": { "v": "seq", "t": "s", "s": { "b": true, "al": "center" } },
        "1:1": { "v": "first name", "t": "s", "s": { "b": true } },
        "2:6": { "v": "$1,250,000.00", "t": "n", "s": { "al": "right" } }
      }
    },
    {
      "id": "sheet-1",
      "name": "Transactions",
      "row_count": 2000,
      "col_count": 12,
      "is_truncated": true,
      "columns": [],
      "merges": [],
      "cells": {}
    }
  ]
}
```

---

## 4. Backend Implementation Details

### A. Dependencies (`backend/requirements.txt`)
Add `openpyxl`:
```
openpyxl==3.1.5
```

### B. Constants (`backend/documents/renderers/constants.py`)
1. Define spreadsheet MIME types and extensions:
   ```python
   SPREADSHEET_MIMETYPES = [
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  # .xlsx
       'text/csv',  # .csv
   ]
   SPREADSHEET_EXTENSIONS = {'.xlsx', '.csv'}
   ```
2. Remove `.xlsx` from `OFFICE_EXTENSIONS` and `OFFICE_MIMETYPES`:
   - Keep `.xls` in `OFFICE_EXTENSIONS` so legacy Excel files cleanly fall back to `OfficeRenderer`.

### C. Strategy Class: `SpreadsheetRenderer` (`backend/documents/renderers/spreadsheet.py`)
Subclass `BasePreviewRenderer`:
```python
class SpreadsheetRenderer(BasePreviewRenderer):
    can_reuse_page_url_for_download: bool = False

    @classmethod
    def can_handle_file(cls, content_type: str, filename: str) -> bool:
        norm_type = normalize_content_type(content_type, filename)
        if norm_type in SPREADSHEET_MIMETYPES:
            return True
        if filename:
            ext = os.path.splitext(filename)[1].lower()
            return ext in SPREADSHEET_EXTENSIONS
        return False

    @classmethod
    def can_handle_version(cls, version: DocumentVersion) -> bool:
        # Zero-migration guard: If version already has rendered page images, let OfficeRenderer keep serving it
        if version.has_pages:
            return False

        if version.type == 'spreadsheet' or (version.document and version.document.type == 'spreadsheet'):
            return True

        filename = version.document.name if version.document else ''
        storage_key = version.original_storage_key or version.storage_key or ''
        norm_type = normalize_content_type(version.content_type, filename)
        if norm_type in SPREADSHEET_MIMETYPES:
            return True
        if filename and os.path.splitext(filename)[1].lower() in SPREADSHEET_EXTENSIONS:
            return True
        if storage_key and os.path.splitext(storage_key)[1].lower() in SPREADSHEET_EXTENSIONS:
            return True
        return False

    def initialize_metadata(self, document: Document, version: DocumentVersion, file_size: int, content_type: str):
        norm_type = normalize_content_type(content_type, document.name)
        max_preview_size_mb = core_services.get_dynamic_setting('MAX_PREVIEW_FILE_SIZE_MB')
        is_too_large = file_size > (max_preview_size_mb * 1024 * 1024)

        document.download_only = is_too_large
        document.type = 'spreadsheet'
        document.content_type = norm_type
        document.file_size = file_size
        document.status_message = ''
        document.status = 'ready'

        version.type = 'spreadsheet'
        version.has_pages = False
        version.render_error = ''
        if is_too_large:
            version.render_status = DocumentVersion.RENDER_NOT_APPLICABLE
        else:
            version.render_status = DocumentVersion.RENDER_NOT_GENERATED
        version.save()
        document.save()

    def is_dynamically_previewable(self, version: DocumentVersion) -> bool:
        doc = version.document
        if not doc or doc.is_download_only:
            return False
        max_preview_size = core_services.get_dynamic_setting('MAX_PREVIEW_FILE_SIZE_MB')
        file_size = version.file_size or (doc.file_size if doc else 0)
        return not (file_size and file_size > (max_preview_size * 1024 * 1024))

    def get_preview_mode(self, version: DocumentVersion) -> str:
        doc = version.document
        if doc and doc.is_download_only:
            return 'download_only'
        max_preview_size = core_services.get_dynamic_setting('MAX_PREVIEW_FILE_SIZE_MB')
        file_size = version.file_size or (doc.file_size if doc else 0)
        if file_size and file_size > (max_preview_size * 1024 * 1024):
            return 'download_only'
        return 'spreadsheet'

    def should_serve_pages(self, version: DocumentVersion, render_status: str) -> bool:
        return False

    def get_page_storage_key(self, version: DocumentVersion, page_number: int) -> Optional[str]:
        return None

    def _dispatch_task(self, version: DocumentVersion):
        from documents.tasks import generate_spreadsheet_preview_task
        generate_spreadsheet_preview_task.delay(version.id)

    def get_spreadsheet_preview_url(self, version: DocumentVersion) -> Optional[str]:
        if not version.storage_key:
            return None
        from documents.fileserver import fileserver_client
        return fileserver_client.generate_download_url(version.storage_key, is_internal=False)
```

### D. Registry Registration (`backend/documents/renderers/__init__.py`)
Register `SpreadsheetRenderer` in `RENDERER_CLASSES` with priority over `OfficeRenderer`:
```python
RENDERER_CLASSES: List[Type[BasePreviewRenderer]] = [
    TranscodedImageRenderer,
    DirectImageRenderer,
    PDFRenderer,
    SpreadsheetRenderer,   # <-- Evaluated before OfficeRenderer
    OfficeRenderer,
    VideoRenderer,
    GenericFileRenderer,
]
```

### E. Celery Task (`backend/documents/tasks.py`)
Implement `generate_spreadsheet_preview_task(version_id)`:
1. Download original file from storage.
2. If `.xlsx`:
   - Open workbook using `openpyxl.load_workbook(file_path, data_only=True)`.
   - Filter `workbook.worksheets` to visible sheets (`sheet.sheet_state == 'visible'`).
   - Iterate through sheets and rows up to 2,000 rows × 100 columns.
   - Extract stringified/formatted cell values and compact styles (bold, color, fill, alignment).
3. If `.csv`:
   - Decode using `utf-8-sig` (fallback to `latin-1`).
   - Use `csv.Sniffer` to auto-detect delimiter.
   - Read rows up to 2,000 rows × 100 columns into `"Sheet1"`.
4. Serialize to JSON and upload to `fileserver` as `<base_path>_spreadsheet.json`.
5. Update `version.storage_key = json_storage_key`, `version.num_pages = len(sheets)`, `document.num_pages = len(sheets)`, `version.render_status = DocumentVersion.RENDER_READY`.

### F. API Views Integration (`documents/views.py` & `sharelinks/views.py`)
In `DocumentPreviewDataView` and `ShareLinkViewDataView`:
- Read `preview_mode = renderer.get_preview_mode(primary_version)`.
- If `preview_mode == 'spreadsheet'`:
  - `spreadsheet_preview_url = renderer.get_spreadsheet_preview_url(primary_version)`
  - Serialize `spreadsheet_preview_url` in the API response.

---

## 5. Frontend Implementation Details

### A. Virtual Windowing Architecture
Rather than introducing third-party packages (`@tanstack/react-virtual`) which risk container node_modules conflicts and peer dependency friction with React 19, `SpreadsheetViewer.jsx` implements a lightweight, pure React 2D windowing algorithm using container scroll offsets (`scrollTop`, `scrollLeft`, `rowHeight`, and cumulative `colOffsets`).

### B. Component: `SpreadsheetViewer.jsx`
Location: `frontend/src/components/documents/SpreadsheetViewer.jsx`
Key responsibilities:
1. **Fetch & State**: Fetches `spreadsheet_preview_url` and holds parsed workbook JSON.
2. **Active Sheet State**: Tracks `activeSheetIndex` and active cell selection (e.g. `selectedCell: "B4"`).
3. **Sheet Tab Bar**: Bottom bar with tabs for each sheet, badge indicating total rows, and warning indicator if truncated.
4. **2D Virtualized Grid Table**:
   - Pure React 2D windowing algorithm computing row and column slice boundaries based on viewport scroll position.
   - Fixed sticky header row for column letters (`A`, `B`, `C`...).
   - Fixed sticky left column for row numbers (`1`, `2`, `3`...).
   - Applies cell styles (`font-bold`, background colors, text alignment).
   - Renders cell coordinate indicator in the top-left status bar.
5. **Zoom & Toolbar Integration**:
   - Responds to `zoomLevel` prop, scaling font sizes and cell dimensions proportionally.
6. **Search & Filter Bar**:
   - Quick search input in the toolbar.
   - Highlights matching cells and counts matches.
7. **Watermark Overlay**:
   - Repeating SVG watermark pattern (`buildWatermarkSvg(watermarkText)`), positioned as an absolute non-interactive overlay over the grid container.
8. **Copy Gating**:
   - When `watermarkText` is present, `allowDownload === false`, or `canCopy === false`, attach `onCopy={(e) => e.preventDefault()}` and CSS `user-select: none`.

### C. Viewer Integration
Update viewing host pages:
1. `frontend/src/pages/ShareLinkViewerPage.jsx`: Mount `<SpreadsheetViewer />` when `viewData.preview_mode === 'spreadsheet'`.
2. `frontend/src/components/viewer/DataroomViewer.jsx`: Mount `<SpreadsheetViewer />` when `documentViewData.preview_mode === 'spreadsheet'`.
3. `frontend/src/components/documents/DocumentPreviewModal.jsx`: Render `<SpreadsheetViewer />` when previewing internal document files (invoked by `DocumentPage.jsx`).

---

## 6. Phased Implementation Steps

### Phase 1: Backend Strategy & Pipeline
- [x] Add `openpyxl==3.1.5` to `backend/requirements.txt`.
- [x] Add `SPREADSHEET_MIMETYPES` and `SPREADSHEET_EXTENSIONS` to `backend/documents/renderers/constants.py` and remove `.xlsx` from `OFFICE_EXTENSIONS`.
- [x] Implement `SpreadsheetRenderer` in `backend/documents/renderers/spreadsheet.py` with zero-migration guard (`has_pages` check).
- [x] Register `SpreadsheetRenderer` in `backend/documents/renderers/__init__.py`.
- [x] Implement `generate_spreadsheet_preview_task` in `backend/documents/tasks.py` (openpyxl + csv.Sniffer + 2,000 row cap + formatting strings).
- [x] Expose `spreadsheet_preview_url` in `DocumentPreviewDataView` and `ShareLinkViewDataView`.
- [x] Add test cases to `backend/tests/documents/test_renderers.py` and write `test_spreadsheet_tasks.py`.

### Phase 2: Frontend Virtual Grid Viewer
- [x] Implement pure React 2D virtualized windowing algorithm in `SpreadsheetViewer.jsx`.
- [x] Create `frontend/src/components/documents/SpreadsheetViewer.jsx` with sheet tabs, 2D virtualized scrolling, cell coordinates, and zoom scaling.
- [x] Integrate SVG watermark overlay and copy protection.
- [x] Mount `SpreadsheetViewer` in `ShareLinkViewerPage.jsx`, `DataroomViewer.jsx`, and `DocumentPreviewModal.jsx`.
- [x] Add unit tests in `frontend/src/tests/components/documents/SpreadsheetViewer.test.jsx`.
- [x] Add test path to `frontend/vitest.whitelist.json`.

### Phase 3: Integration & Edge Cases
- [ ] Test multi-sheet workbooks with varying column widths and empty cells.
- [ ] Test large `.xlsx` files (> 2,000 rows) to ensure truncation banner displays properly.
- [ ] Test `.csv` uploads with different delimiters (comma, semicolon, tab, pipe).
- [ ] Verify watermarked link access and download permission restrictions.
- [ ] Confirm existing legacy `.xlsx` files with `has_pages=True` continue serving page images without disruption.
