### [Initial Configuration] Active Workspace Constraints
- **Category:** Architecture Choice / Workflow Policy
- **Context/Implication:** Avoid cluttered database schema states during iterative code generation.
- **Resolution/Action:** Do not create Django migration files unless explicitly requested or supplied by the maintainer. When schema changes need migrations, call that out in the final session summary instead of generating files.

### [Target Execution Reference] Containerized Test Inventory
- **Category:** Custom Multi-Step Command Triggers
- **Context/Implication:** Running isolated backend or frontend test suites within the localized Docker environment.
- **Resolution/Action:** Use these exact target strings when executing sub-suite tests for the user:

#### Targeted Backend Test (pytest inside container)
```bash
COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend pytest -q tests/filerequests/test_views.py
```

#### Targeted Frontend Test (Vitest inside container)
```bash
COMPOSE_PROJECT_NAME=coneshare docker-compose exec frontend npm test -- --run src/tests/pages/PublicUploadPage.test.jsx
```

### 2026-06-28 Session Entry
- **Category:** Architecture Choice
- **Context/Implication:** Clicking folders in the document viewer's sibling sidebar navigated the user away to the folder list, disrupting the viewing context.
- **Resolution/Action:** Converted the sibling sidebar to a recursive, expandable folder tree using lazy-loaded folder content endpoints. Implemented test coverage in `DataroomViewer.test.jsx`.

### 2026-06-30 Session Entry
- **Category:** Gotcha
- **Context/Implication:** Frontend container tests are run against a specific whitelist. If newly created or updated frontend test files are not added to `vitest.whitelist.json`, they will be skipped during `make test.front` and CI/CD validation.
- **Resolution/Action:** Always append any newly added or modified Vitest test paths to the `whitelist` array inside `frontend/vitest.whitelist.json`.

### 2026-06-30 Session Entry
- **Category:** Gotcha
- **Context/Implication:** In Radix UI (`DropdownMenu.Item`), calling `e.preventDefault()` inside the `onSelect` callback prevents the default dropdown dismissal behavior, leaving the menu stuck open on the screen after the action is clicked.
- **Resolution/Action:** Avoid `e.preventDefault()` in `onSelect` when the dropdown should dismiss. Use only `e.stopPropagation()` if you need to prevent the click from bubbling to parent row event handlers, and add test assertions to check that the dropdown menu is dismissed upon clicking.

### 2026-07-01 Session Entry
- **Category:** Architecture Choice
- **Context/Implication:** Retaining clickable links and secure watermarking for server-side document previews.
- **Resolution/Action:** Created the hybrid plan at `plans/hybrid-preview-download-plan.md` using server-rendered image overlays for viewer links, and a configurable flattened rasterizer for high-security PDF downloads.

### 2026-07-01 Session Entry
- **Category:** Workflow Policy
- **Context/Implication:** Coding Style guidelines regarding Python imports.
- **Resolution/Action:** Imports should always be placed at the head of files, unless an import loop (circular import) issue requires inline/deferred imports.

### 2026-07-02 Session Entry
- **Category:** Command Trigger
- **Context/Implication:** Commands to run full and targeted test suites inside Docker containers.
- **Resolution/Action:**
  - **Full Backend Suite:** `COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend pytest`
  - **Targeted Backend Test File:** `COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend pytest <path_to_test_file>.py`
  - **Targeted Backend Test Case:** `COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend pytest <path_to_test_file>.py -k <test_case_name>`
  - **Full Frontend Suite (Whitelist):** `COMPOSE_PROJECT_NAME=coneshare docker-compose exec frontend npm run test:whitelist`
  - **Targeted Frontend Test File:** `COMPOSE_PROJECT_NAME=coneshare docker-compose exec frontend npx vitest run <path_to_test_file>.test.jsx`

### 2026-07-02 Session Entry
- **Category:** Gotcha
- **Context/Implication:** Rendering raw URLs extracted from PDF annotations or other untrusted metadata directly into HTML `href` overlays allows DOM-based XSS attacks via `javascript:`, `data:`, or `vbscript:` protocols.
- **Resolution/Action:** 
  1. Always filter/sanitize link URLs using the `isSafeUrl` utility to permit only safe protocols (`http:`, `https:`, `mailto:`, `tel:`) or safe relative paths (`/`).
  2. **[Policy]** During coding and planning phases for any overlay or dynamic rendering feature, explicitly audit and document DOM-based Cross-Site Scripting (XSS) considerations for HTML attributes (such as `href`, `src`, `action`).

### 2026-07-02 Session Entry
- **Category:** Gotcha
- **Context/Implication:** Synchronously rasterizing entire large PDFs in-memory (specifically during download of watermarked PDFs) triggers Out-of-Memory (OOM) process crashes or gateway timeouts. Additionally, unclosed Pillow `Image` objects leak memory in the request thread.
- **Resolution/Action:** 
  1. Enforce a page limit check in `_generate_flattened_watermarked_pdf` using `MAX_PREVIEW_PAGES` and fallback to vector-watermarked PDFs for download if the limit is exceeded.
  2. Always explicitly close source and converted PIL `Image` objects (`img.close()`) in a `finally` block to release bitmap memory immediately.

### 2026-07-02 Session Entry
- **Category:** Gotcha
- **Context/Implication:** PDFs can write bounding box rectangle coordinates (`/Rect`) in arbitrary order (e.g. `x1 > x2` or `y1 > y2`), which translates to negative widths/heights and broken positioning in CSS overlays.
- **Resolution/Action:** Extract coordinates using `min` and `max` (e.g. `x1 = min(v1, v3)`) to guarantee positive dimensions before computing layout percentages.

### 2026-07-02 Session Entry
- **Category:** Architecture Choice
- **Context/Implication:** `generate_pdf_pages_task` is triggered on first preview for all PDFs regardless of the active `PDF_PREVIEW_ENGINE`. While this ensures `page_links` metadata is harvested for overlays, it also forces page-image PNG rasterization and MinIO upload even when client-side `pdfjs` is rendering the raw file.
- **Resolution/Action:** **[Question/Later]** Revisit if we should optimize `generate_pdf_pages_task` to skip Poppler image generation and storage writes when `PDF_PREVIEW_ENGINE = 'pdfjs'` and watermarking is disabled, while continuing to parse and store link annotations.

### 2026-07-02 Session Entry
- **Category:** Gotcha
- **Context/Implication:** Browsers normalize URLs in anchor `href` attributes by stripping leading/trailing whitespace and control characters (such as tabs, newlines, or invisible bytes). This allows scripting payloads like `"   javascript:alert(1)"` or `"java\nscript:alert(1)"` to bypass simple prefix or regex checks but still execute on click.
- **Resolution/Action:** Always trim URL strings and strip ASCII/Unicode control characters (`/[\u0000-\u001F\u007F-\u009F]/g`) before running protocol validation checks.

### 2026-07-02 Session Entry
- **Category:** Architecture Choice
- **Context/Implication:** Calling `.find()` inside the page rendering loop on every document page creates $O(N^2)$ complexity, which can cause severe performance lag and browser hangs on large documents.
- **Resolution/Action:** Optimize page metadata lookups inside rendering loops (like `PdfJsViewer.jsx`) to attempt direct index lookups first (checking `pages[pageNumber - 1]`), resorting to linear searches only as a fallback.

### 2026-07-02 Session Entry
- **Category:** Architecture Choice
- **Context/Implication:** Supporting watermarked video previews and avoiding Celery queue bottlenecks.
- **Resolution/Action:** 
  1. Add a separate `MAX_VIDEO_PREVIEW_SIZE_MB` dynamic setting to regulate video preview processing.
  2. Implement HLS proxy streaming via the Go service for authenticated playback.
  3. If watermarking is enabled, forcefully disable raw downloads for all videos (returning `403 Forbidden`). If a video exceeds the preview size limit and watermarking is active, access is restricted entirely.
  4. Isolate video transcoding by routing `generate_video_stream_task` to a dedicated `video_processing` Celery queue, keeping the default `celery` queue unblocked. Limit the `video_processing` worker to a concurrency of 1 to protect CPU.
  5. Introduce an `ENABLE_VIDEO_PREVIEW` feature flag (default: `false` in `.env.template`) to completely toggle video streaming previews off on low-spec host machines.

### 2026-07-02 Session Entry
- **Category:** Gotcha
- **Context/Implication:** In backend unit tests, passing MagicMock objects (such as patched iterdir results) to built-in path or file operations like `open()` causes Python to coerce the mock to an integer, raising a silent `OSError: [Errno 9] Bad file descriptor`.
- **Resolution/Action:** Avoid mocking iterdir/Path with MagicMocks for built-in file operations. Instead, mock `tempfile.TemporaryDirectory` to return a controlled path, and write real dummy files in the test setup.

### 2026-07-02 Session Entry
- **Category:** Architecture Choice
- **Context/Implication:** Replaced page-based video heartbeats with contiguous video playback segment tracking. Video events now record Event Time, Video Timespan (start/end positions), Audio (muted/unmuted), Screen (fullscreen/standard), and Speed (1x, 1.25x, etc.).
- **Resolution/Action:** Added `media_type` and video engagement columns to the `PageView` Django model, ran migrations, updated serializers to auto-resolve `media_type` from view session scopes, configured `VideoViewer.jsx` to flush tracking data on state transitions, and updated `PageViewsChart.jsx` to render a custom video watch logs table.

### 2026-07-02 Session Entry
- **Category:** Gotcha
- **Context/Implication:** AI coding assistants should not run database migrations (`makemigrations`, `migrate`) autonomously to prevent untracked schema states or sync issues.
- **Resolution/Action:** Let the user run all database migrations manually. Do not invoke `makemigrations` or `migrate` shell commands.

### 2026-07-02 Session Entry
- **Category:** Gotcha
- **Context/Implication:** Running the entire frontend whitelist test suite on every minor change is slow and unnecessary.
- **Resolution/Action:** Run only the specific test files or test cases related to the modified components/files. Do not run the full whitelist test command.

### 2026-07-02 Session Entry
- **Category:** Architecture Choice
- **Context/Implication:** Large video files transcoding could cause OOM issues if the whole file is buffered in RAM during transcoding tasks.
- **Resolution/Action:** The background transcoding Celery task `generate_video_stream_task` uses end-to-end stream processing. Downloads are chunked in 8KB buffers, FFmpeg decodes/encodes frame-by-frame on disk with constant low memory usage (~50-100MB), and generated `.ts` chunks are uploaded individually using stream generators.

### 2026-07-02 Session Entry [SUPERSEDES 2026-07-02]
- **Category:** Gotcha
- **Context/Implication:** Docker Compose variables configured via `${VAR:-default}` override Celery default auto-concurrency (core count) with the hardcoded fallback value. Additionally, workers for custom queues remain active even if the features using them are disabled.
- **Resolution/Action:** **[OVERRIDE]** Documented default fallbacks (`4` and `1`) clearly in `.env.template` to avoid confusion. If video previewing is disabled via `ENABLE_VIDEO_PREVIEW=false`, the `video_worker` container remains idle and consumes negligible resources.

### 2026-07-02 Session Entry
- **Category:** Gotcha
- **Context/Implication:** In chi wildcard routes `/*` serving files via Go proxy, validating paths against the main storage root allows unauthorized users to traverse directories using `../` to access other files or organizations.
- **Resolution/Action:** Restrict `strings.HasPrefix` validation against the absolute path of the specific token's authorized directory (`filepath.Join(StoragePath, filepath.Dir(StorageKey))`) plus the separator suffix, rather than the general storage root.

### 2026-07-02 Session Entry
- **Category:** Gotcha
- **Context/Implication:** Video files do not support overlay watermarks (trivially bypassed in DevTools). If a parent dataroom link enforces watermarks, letting users download the raw video allows unwatermarked leaks.
- **Resolution/Action:** Skip watermarks during the video preview player, but forcefully set `allow_download = False` (returning `403 Forbidden`) on video downloads if `enable_watermark = True` at the link/dataroom level.

### 2026-07-02 Session Entry
- **Category:** Gotcha
- **Context/Implication:** On native HLS playback (like Safari/iOS), simply unmounting the React player without cleaning the native source can cause background network buffering to continue and leak media decoder instances.
- **Resolution/Action:** In the cleanup of `VideoViewer.jsx`, if the native HLS player was used, explicitly call `video.removeAttribute('src')` followed by `video.load()` to force the browser to release the media decoder and stop buffering.

### 2026-07-04 Session Entry
- **Category:** Gotcha
- **Context/Implication:** The `<Button />` UI component's default variant is hardcoded to `bg-gray-900` and `text-gray-50` instead of utilizing the semantic Tailwind variables `bg-primary` and `text-primary-foreground`. As a result, buttons do not dynamically update when changing HSL variables in `index.css`.
- **Resolution/Action:** In a future session, refactor `frontend/src/components/ui/Button.jsx` default variant to `"bg-primary text-primary-foreground hover:bg-primary/90"`.

### 2026-07-04 Session Entry
- **Category:** Tooling Update
- **Context/Implication:** User requested a strict TDD (Test-Driven Development) cycle whenever fixing an error or bug.
- **Resolution/Action:** When addressing a bug or error, first revert the code fix to replicate the issue, write a test case confirming the failure, and then re-apply the fix to confirm the test succeeds.

### 2026-07-04 Session Entry
- **Category:** Architecture Choice
- **Context/Implication:** Decided to store cloud file import tracking metadata (`cloud_import` containing connection details and `etag_or_rev` version checksums) on the `DocumentVersion` model rather than the `Document` model. This keeps the data history intact for version restoring and periodic auto-sync tracking.
- **Resolution/Action:** Added `metadata = JSONField(default=dict, blank=True)` to `DocumentVersion` model, created API endpoints to refresh document and import version, and exposed the metadata dynamically via a serializer method field in `DocumentSerializer`.

### 2026-07-05 Session Entry
- **Category:** Gotcha
- **Context/Implication:** The connection ID primary keys (like `CloudConnection.id`) are represented as string Hashids at the API layer. Defining serializing payload fields for connections (e.g., `connection_id` in `ImportVersionSerializer`) as `IntegerField` causes validation failures with code `invalid` ("A valid integer is required").
- **Resolution/Action:** Always declare connection ID serializer fields as `CharField` rather than `IntegerField` to support Hashid string parameters.

### 2026-07-05 Session Entry
- **Category:** Gotcha
- **Context/Implication:** Under the lazy preview mode, the function name `_route_document_for_processing` was misleading as it no longer queues Celery processing tasks eagerly.
- **Resolution/Action:** Updated the function's docstring to clarify its role (initializing DB records and deferring heavy processing) and added a `TODO` to rename it to something like `_initialize_document_metadata_and_states`.

### 2026-07-05 Session Entry
- **Category:** Architecture Choice
- **Context/Implication:** Queries for version creation (`latest_version` and setting `primary_version.is_primary = False`) were done outside a database lock, exposing the endpoints to race conditions if concurrent refresh/import requests were made.
- **Resolution/Action:** Wrapped version creation inside `transaction.atomic()` and used `Document.objects.select_for_update().get(id=document_id)` to lock the document row during version increments inside `CloudRefreshView` and `CloudImportVersionView`.

### 2026-07-05 Session Entry
- **Category:** Gotcha
- **Context/Implication:** Google Workspace editor files (Docs/Sheets/Slides) cannot be downloaded directly via `get_media` and throw a `403 fileNotDownloadable` error. Also, when updating an existing document version fails, the document became broken because the failed version was left as `is_primary=True`.
- **Resolution/Action:**
  1. Updated `GoogleDriveProvider.download_file` to use `export_media` for Google apps files (Docs to PDF, Sheets to Excel, Slides to PowerPoint) and calculate size from the downloaded buffer.
  2. Implemented `_handle_import_failure` inside `tasks.py` to revert the document status to `ready`, restore the previous version as `is_primary=True`, and delete the failed version.

### 2026-07-05 Session Entry
- **Category:** Tooling Update
- **Context/Implication:** Running the full backend test suite on every change is slow and resource-heavy.
- **Resolution/Action:** Do not run the full backend test suite (`make test`); instead, target only the related test files (e.g. `pytest tests/cloudfiles/test_tasks.py`).

### 2026-07-05 Session Entry [SUPERSEDES 2026-07-05]
- **Category:** Gotcha
- **Context/Implication:** The original import failure rollback was queried outside the transaction block (leading to potential stale read race conditions) and unconditionally set document status to `'ready'` even if the previous version was missing.
- **Resolution/Action:** **[OVERRIDE]** Queried `prev_version` inside the `transaction.atomic()` block after acquiring the `select_for_update()` lock. Revert the document status to `'ready'` only if a valid previous version exists; otherwise, fall back to `'error'`.

### 2026-07-06 Session Entry
- **Category:** Architecture Choice
- **Context/Implication:** Displaying Version History inline on the document details page cluttered the layout. Additionally, listing version histories via the full document details endpoint was inefficient, and promoting larger document versions without validating storage quotas could bypass user storage limits.
- **Resolution/Action:** 
  1. Placed Version History on a dedicated page `/documents/:documentId/versions` ([DocumentVersionsPage](file:///Users/xiez/coneshare/frontend/src/pages/DocumentVersionsPage.jsx)), retrieving paginated versions via a new backend endpoint `GET /api/v1/documents/{id}/versions/` ([views.py](file:///Users/xiez/coneshare/backend/documents/views.py)) that instantiates `StandardResultsSetPagination()` manually to support server-side pagination.
  2. Updated [VersionHistoryTable](file:///Users/xiez/coneshare/frontend/src/components/documents/VersionHistoryTable.jsx) to support server-side pagination, render the primary `Active` status badge next to the version name, render fallback labels for unknown statuses (like `not_generated`), and wrap the `Error` badge in a `Tooltip` showing the `render_error` message on hover.
  3. Integrated `check_user_quota_on_upload` check entirely before the `transaction.atomic()` block in `promote_document_version` ([services.py](file:///Users/xiez/coneshare/backend/documents/services.py)) to prevent storage quota bypass during version promotion without keeping database locks open unnecessarily.




