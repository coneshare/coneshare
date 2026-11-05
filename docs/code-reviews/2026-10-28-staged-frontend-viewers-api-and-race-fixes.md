# Code Review: Staged Frontend Viewer, API Interceptor, FileRequest & Folder Race Condition Fixes

**Date:** 2026-10-28  
**Status:** All 4 Review Findings Resolved & Verified (`126/126` unit tests passing)  
**Scope:** Staged frontend files:
- `frontend/src/components/documents/MarkdownViewer.jsx`
- `frontend/src/components/documents/PdfJsViewer.jsx`
- `frontend/src/components/documents/PreviewViewer.jsx`
- `frontend/src/components/documents/SpreadsheetViewer.jsx`
- `frontend/src/components/filerequests/FileRequestSheet.jsx`
- `frontend/src/components/viewer/DataroomViewer.jsx`
- `frontend/src/pages/DocumentsPage.jsx`
- `frontend/src/pages/ShareLinkViewerPage.jsx`
- `frontend/src/services/api.js`
- `frontend/src/tests/components/documents/MarkdownViewer.test.jsx`
- `frontend/src/tests/components/documents/PdfJsViewer.test.jsx`
- `frontend/src/tests/components/documents/PreviewViewer.test.jsx`
- `frontend/src/tests/components/documents/SpreadsheetViewer.test.jsx`
- `frontend/src/tests/components/filerequests/FileRequestSheet.test.jsx`
- `frontend/src/tests/pages/DocumentsPage.test.jsx`
- `frontend/src/tests/services/api.test.js`
- `frontend/vitest.whitelist.json`

---

## Resolution Summary

| # | Original Severity | Component / File | Status | Verification Notes |
| :- | :---: | :--- | :---: | :--- |
| **1** | **HIGH** | `SpreadsheetViewer.jsx`, `ShareLinkViewerPage.jsx`, `DataroomViewer.jsx` | **FIXED** | `SpreadsheetViewer` now accepts `onPageChange` and `onDocumentLoad`, calls `onDocumentLoad({ numPages: res.data.sheets.length })` on load and `onPageChange(newIndex + 1)` in `handleSheetChange`, and both `ShareLinkViewerPage` and `DataroomViewer` pass `onPageChange={setCurrentPage}` and `onDocumentLoad={handleDocumentLoad}`. Covered by `SpreadsheetViewer.test.jsx`. |
| **2** | **MEDIUM** | `frontend/src/services/api.js:112-168` | **FIXED** | `isPublicViewer` is hoisted above `if (!refreshToken)`, includes `/upload/` and `/view-sessions/`, and prevents `/login` redirects in both the missing-refresh-token branch and the failed-token-refresh `.catch()` branch. Covered by `api.test.js`. |
| **3** | **LOW** | `frontend/src/services/api.js:125-166` | **FIXED** | Both public-viewer 401 branches now invoke `getLocalizedErrorMessage(error)` and display `toast.error(errorMessage)` when `!isViewDataProtectionPrompt`. Covered by `api.test.js`. |
| **4** | **LOW** | `PreviewViewer.jsx:87-105`, `MarkdownViewer.jsx:222-240` | **FIXED** | Both `PreviewViewer` and `MarkdownViewer` now register `{ capture: true, passive: true }` `scroll` listeners along with `wheel`, `touchstart`, and `touchmove` activity listeners. Covered by `PreviewViewer.test.jsx` and `MarkdownViewer.test.jsx`. |
| **5** | **VERIFIED** | `DocumentsPage.jsx`, `FileRequestSheet.jsx`, `vitest.whitelist.json` | **PASSED** | Folder navigation race condition guard (`fetchSeqRef`, `activeFolderIdRef`), local `datetime-local` formatting, and `vitest.whitelist.json` registration are all clean and verified. |

---

## Test Execution Evidence

Executed all 7 modified frontend test suites in Docker:
```bash
COMPOSE_PROJECT_NAME=coneshare docker-compose exec frontend npx vitest run \
  src/tests/components/documents/MarkdownViewer.test.jsx \
  src/tests/components/documents/PdfJsViewer.test.jsx \
  src/tests/components/documents/PreviewViewer.test.jsx \
  src/tests/components/documents/SpreadsheetViewer.test.jsx \
  src/tests/components/filerequests/FileRequestSheet.test.jsx \
  src/tests/pages/DocumentsPage.test.jsx \
  src/tests/services/api.test.js
```
- **Result:** `7 passed (7 test files)`, `126 passed (126 tests)`.
