# PDF.js Canvas Viewer Implementation Plan

## Problem

The current `PdfJsViewer` component embeds PDFs using the browser's native PDF plugin via an `<object>` tag. This has two fundamental limitations:

1. **No page-level analytics.** The native plugin runs in an isolated sandbox. JavaScript cannot detect which page the user is viewing, so all engagement time is reported as page 1.
2. **Limited UI control.** We had to hide the native toolbar with `#toolbar=0` to avoid overlapping with the Coneshare toolbar, and to prevent the native download button from bypassing `allow_download=false` settings.

## Solution

Replace the `<object>` tag with Mozilla's official `pdfjs-dist` library used directly (no wrapper). Each PDF page is rendered onto a standard HTML `<canvas>` element inside our DOM. This gives us full JavaScript access to track which page is on screen using `IntersectionObserver`, exactly as `PreviewViewer` already does for server-rendered page images.

### Why `pdfjs-dist` Directly

- Actively maintained by Mozilla (powers Firefox's built-in PDF viewer).
- No dependency on unmaintained React wrappers like `react-pdf` (400+ open issues, stale PRs).
- Full control over DOM, rendering, and event handling.
- Standard `<canvas>` elements integrate seamlessly with `IntersectionObserver`.

## Scope

This plan covers frontend changes only. No backend changes are required — the existing `pdf_preview_url` endpoint and `preview_mode=client_pdf` API contract remain unchanged.

## Architecture

### Current Flow

```
Backend API → pdf_preview_url → <object data={url}> → Browser native plugin
                                                      (no DOM access, no analytics)
```

### New Flow

```
Backend API → pdf_preview_url → pdfjs-dist → <canvas> per page → IntersectionObserver
                                              (full DOM access, page-level analytics)
```

### Component Design

```
PdfJsViewer (refactored)
├── usePdfDocument(pdfUrl)          — custom hook: loads PDF, returns document + pageCount
├── PdfPage({ doc, pageNumber })    — renders a single <canvas> for one page
├── IntersectionObserver            — tracks which page canvas is most visible
├── Analytics (reuse PreviewViewer pattern)
│   ├── active time tracking per page
│   ├── inactivity detection (60s timeout)
│   ├── sendBeacon on unmount/unload
│   └── per-page duration via recordPageView API
└── Watermark overlay               — existing CSS SVG overlay (unchanged)
```

## Implementation Steps

### Step 1: Install `pdfjs-dist`

Install the library and configure the PDF.js worker.

```bash
cd frontend && npm install pdfjs-dist
```

Worker setup: `pdfjs-dist` requires a Web Worker for parsing. In our Vite build pipeline, we can import the worker script directly as a static URL using Vite's `?url` query. This bundles the worker natively with the build, ensuring reliable offline support and version synchronization:

```javascript
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
```

### Step 2: Create `usePdfDocument` Hook

A custom React hook that loads a PDF document and returns the `pdfjs` document proxy and total page count.

```
File: frontend/src/hooks/usePdfDocument.js
```

Responsibilities:
- Accept a `pdfUrl` string.
- Call `pdfjsLib.getDocument(pdfUrl).promise` to load the PDF.
- Return `{ pdfDoc, numPages, loading, error }`.
- Clean up (destroy the document proxy) on unmount or when `pdfUrl` changes.
- Handle load errors gracefully (network failures, corrupt PDFs, expired preview URLs).

### Step 3: Create `PdfPage` Component

A component that renders a single PDF page onto a `<canvas>`.

```
File: frontend/src/components/documents/PdfPage.jsx
```

Responsibilities:
- Accept `pdfDoc` (the document proxy), `pageNumber`, and `scale`.
- Call `pdfDoc.getPage(pageNumber)` to get the page proxy.
- Create a `<canvas>` element and render the page onto it via `page.render()`.
- Support dynamic scaling/zoom (re-render when `scale` changes).
- Use `devicePixelRatio` for crisp rendering on high-DPI screens.
- Clean up render tasks on unmount to avoid memory leaks.
- Track and cancel the active render task (`renderTask.cancel()`) when `scale` changes or the component unmounts to prevent canvas drawing overlaps and rendering exceptions.

### Step 4: Refactor `PdfJsViewer` Component

Rewrite the existing `PdfJsViewer` to use the new hook and page component instead of `<object>`.

```
File: frontend/src/components/documents/PdfJsViewer.jsx (modify in place)
```

#### Layout Structure

```jsx
<div className="relative h-full w-full">
  {/* Scrollable page container */}
  <div ref={scrollContainerRef} className="h-full overflow-y-auto bg-gray-100">
    <div className="mx-auto flex w-fit flex-col items-center space-y-4 p-4"
         style={{ transform: `scale(${zoomLevel})` }}>
      {Array.from({ length: numPages }, (_, i) => (
        <div key={i + 1} ref={setPageRef(i + 1)} data-page-number={i + 1}>
          <PdfPage pdfDoc={pdfDoc} pageNumber={i + 1} scale={baseScale} />
        </div>
      ))}
    </div>
  </div>

  {/* Watermark overlay (unchanged) */}
  {watermarkText && <WatermarkOverlay text={watermarkText} />}
</div>
```

#### Analytics Integration

Port the analytics pattern from `PreviewViewer.jsx`:

| Feature | `PreviewViewer` (reference) | New `PdfJsViewer` |
|---|---|---|
| Active time tracking | 1-second interval timer | Same |
| Inactivity detection | 60s mouse/key/scroll timeout | Same |
| Page change detection | `IntersectionObserver` on page `<div>` elements | `IntersectionObserver` on page `<div>` wrappers around `<canvas>` |
| Flush on page change | `sendTrackingData(prevPage, duration)` | Same |
| Flush on unmount | `sendTrackingData` in cleanup | Same |
| Flush on unload | `sendBeacon` via `beforeunload` | Same |
| API call | `recordPageView(payload)` | Same |

The `IntersectionObserver` setup will be nearly identical to `PreviewViewer` lines 105–153. The observer watches the `<div>` wrapper around each `<canvas>`, using `intersectionRatio` to determine the most visible page.

#### Props (unchanged from current API)

```typescript
interface PdfJsViewerProps {
  pdfUrl: string;
  title?: string;
  viewId?: string;
  dataroomVisitId?: string;
  watermarkText?: string;
}
```

No changes required in `DocumentPreviewModal.jsx` or `ShareLinkViewerPage.jsx` — they already pass these props.

### Step 5: Re-enable Toolbar Controls for `client_pdf`

Currently `ViewerToolbar` hides zoom and page counter when `previewMode === 'client_pdf'` (line 41) because the native plugin handled its own zoom/navigation. With canvas rendering, we control zoom ourselves.

Changes to `ViewerToolbar.jsx`:
- Remove the `previewMode !== 'client_pdf'` guard on the zoom/page controls.

Changes to `ShareLinkViewerPage.jsx`:
- Pass `onPageChange` callback from `PdfJsViewer` up to `ViewerToolbar` to display `currentPage / totalPages`.
- Pass `zoomLevel` to `PdfJsViewer` and connect `onZoomIn` / `onZoomOut`.

Changes to `PdfJsViewer` props:
- Add `zoomLevel` prop.
- Add `onPageChange` callback prop.

### Step 6: Lazy Page Rendering (Performance)

For large PDFs (50+ pages), rendering all pages at once would consume excessive memory. Implement lazy rendering:

- Only render pages that are within a viewport buffer (e.g., current page ± 3 pages).
- Use a second `IntersectionObserver` with a larger `rootMargin` (e.g., `2000px`) to detect pages approaching the viewport.
- For pages outside the buffer, render a placeholder `<div>` with the correct dimensions to maintain scroll position stability.
- Since page dimensions are not available beforehand from the backend (unlike in `PreviewViewer`), pre-fetch page dimensions/aspect ratios asynchronously from `pdfDoc.getPage()` when the document first loads, storing them in state. Use these dimensions to set exact heights on placeholder `<div>` containers.
- Destroy canvas rendering for pages that scroll far out of view.

This mirrors the `LazyImage` pattern already used by `PreviewViewer`.

## Testing Plan

### Unit Tests

```
File: frontend/src/tests/components/PdfJsViewer.test.jsx
```

- Mock `pdfjs-dist` to return a fake document with N pages.
- Verify that N canvas wrappers are rendered.
- Verify `onPageChange` is called when `IntersectionObserver` fires.
- Verify `recordPageView` is called with correct `page_number` on page change.
- Verify `recordPageView` is called on unmount with accumulated duration.
- Verify watermark overlay renders when `watermarkText` is provided.
- Verify watermark overlay does not render when `watermarkText` is empty.

### Manual Testing Checklist

- [ ] Open a PDF in internal preview modal — pages render correctly.
- [ ] Open a PDF via share link — pages render correctly.
- [ ] Scroll through pages — toolbar page counter updates in real time.
- [ ] Check analytics dashboard — per-page engagement times are recorded (not all page 1).
- [ ] Zoom in/out via toolbar — pages re-render at new scale.
- [ ] Watermark overlay displays correctly over canvas pages.
- [ ] Large PDF (100+ pages) — lazy rendering keeps memory usage reasonable.
- [ ] Expired preview URL — graceful error message, not a blank screen.
- [ ] `allow_download=false` — no download affordances visible.
- [ ] Tab hidden/visible — active time tracking pauses/resumes correctly.
- [ ] Close modal or navigate away — final page view event is sent via `sendBeacon`.

## File Change Summary

| File | Action | Description |
|---|---|---|
| `frontend/package.json` | Modify | Add `pdfjs-dist` dependency |
| `frontend/src/hooks/usePdfDocument.js` | Create | Hook to load PDF document via pdfjs-dist |
| `frontend/src/components/documents/PdfPage.jsx` | Create | Single page canvas renderer |
| `frontend/src/components/documents/PdfJsViewer.jsx` | Rewrite | Replace `<object>` with canvas-based renderer + IntersectionObserver analytics |
| `frontend/src/components/viewer/ViewerToolbar.jsx` | Modify | Remove `client_pdf` guard on zoom/page controls |
| `frontend/src/pages/ShareLinkViewerPage.jsx` | Modify | Pass `zoomLevel` and `onPageChange` to `PdfJsViewer` |
| `frontend/src/tests/components/PdfJsViewer.test.jsx` | Create | Unit tests for new viewer |

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `pdfjs-dist` increases bundle size (~400KB gzipped for worker + core) | Worker is loaded asynchronously and does not block initial page load. Core library is only imported in `PdfJsViewer` (code-split). |
| High memory usage on large PDFs | Lazy rendering limits concurrent canvas elements to viewport ± buffer. |
| Self-hosted deployments without internet access cannot load CDN worker | Copy worker file to `public/` as fallback. |
| PDF.js rendering fidelity differs from native viewer for edge-case PDFs | Acceptable trade-off. PDF.js powers Firefox and handles the vast majority of PDFs correctly. |
| Preview URL expires while user is viewing (5-minute token) | Show a user-friendly "Preview expired" message with a "Reload" button. The parent component can re-fetch `pdf_preview_url` from the API. |

## Out of Scope

- Backend changes (none needed).
- Server-rendered preview path (unaffected).
- Text selection / text layer support (can be added later by enabling PDF.js `TextLayer`).
- Thumbnail sidebar navigation (future enhancement).
- Print support (existing "not implemented" state is unchanged).

## Open Questions

None.
