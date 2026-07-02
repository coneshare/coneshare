# Coneshare Internal Document Preview Logic

## Strategy refs
- [Coneshare Roadmap](./strategy/coneshare-roadmap.md)
- [Coneshare Technology Stack](./strategy/coneshare-techstack.md)
- [Coneshare Data Model](./coneshare-data-model.md)
- [Coneshare Document Processing Architecture](./coneshare-document-process.md)

## Out of scope
- Public share-link preview behavior and external viewer access flows.
- Watermarked public download logic and dataroom-specific preview permissions.
- OCR/post-processing enrichment in preview payloads.
- Redesign of viewer rendering engine beyond data contract adjustments.

## Design decisions
- Decision: Serve internal preview data from a dedicated owner-scoped API endpoint.
  Rationale: Keeps preview modal data loading isolated and simple for frontend consumption.
  Tradeoff: Adds a specialized endpoint/serializer to maintain.
- Decision: Return pre-signed page URLs for rendered document pages.
  Rationale: Maintains storage isolation while allowing time-bounded frontend access.
  Tradeoff: Requires URL-expiry handling and refetch behavior in long-lived sessions.
- Decision: Use snake_case payload fields for API consistency.
  Rationale: Aligns with backend JSON naming conventions used across Coneshare.
  Tradeoff: Frontend mapping is required if internal component props use camelCase.

This document details the end-to-end logic for Coneshare's internal document preview feature, where authenticated users preview organization-owned documents directly inside the app.

---

## System Diagram

```mermaid
sequenceDiagram
    participant User
    participant Frontend as React Frontend
    participant DataHook as Data Fetching Hook
    participant API as Django REST API
    participant DB as PostgreSQL
    participant Storage as MinIO

    User->>Frontend: Clicks "Preview" button
    Frontend->>Frontend: Opens DocumentPreviewModal
    Frontend->>DataHook: useDocumentPreview(doc_id)
    DataHook->>API: GET /api/v1/documents/{id}/preview-data/
    API->>DB: Verify auth + organization scope
    API->>DB: Fetch document + primary version + pages
    DB-->>API: Returns model data
    API->>Storage: Generate pre-signed page URLs
    Storage-->>API: Pre-signed URLs
    API-->>DataHook: JSON payload
    DataHook->>Frontend: Updates state (loading -> success/error)
    Frontend->>User: Renders page images in preview modal
```

---

## Frontend Flow (React)

The user initiates preview from document management screens.

### 1. Initiation (`DocumentPreviewButton.jsx`)

- File: `frontend/src/components/documents/DocumentPreviewButton.jsx`
- User clicks preview button.
- Component opens `DocumentPreviewModal`.

```jsx
export function DocumentPreviewButton({ documentId }) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsPreviewOpen(true)}>Preview</Button>
      <DocumentPreviewModal
        documentId={documentId}
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
      />
    </>
  );
}
```

### 2. Data Fetch + Render (`DocumentPreviewModal.jsx`)

- File: `frontend/src/components/documents/DocumentPreviewModal.jsx`
- On open, fetch from `GET /api/v1/documents/{document_id}/preview-data/`.
- Render loading/error/data states.

```jsx
export function DocumentPreviewModal({ documentId, isOpen }) {
  const { data, isLoading, error } = useDocumentPreview(documentId, isOpen);

  return (
    <Dialog open={isOpen}>
      <DialogContent>
        {isLoading && <LoadingSpinner />}
        {error && <p>Failed to load document preview</p>}
        {data && <PreviewViewer documentData={data} />}
      </DialogContent>
    </Dialog>
  );
}
```

---

## Backend Flow (Django/DRF)

### Endpoint and location

- Endpoint: `GET /api/v1/documents/{document_id}/preview-data/`
- File: `backend/documents/views.py`

### Step 1: Authentication and authorization

1. Require authenticated user (`IsAuthenticated`).
2. Fetch document constrained by `id` + `request.user.organization`.
3. Return `404` when not found/out-of-scope to avoid tenant enumeration.

### Step 2: Document readiness checks

1. Resolve primary document version.
2. If missing primary version, return `404`.
3. If status is not preview-ready (`processing`, `uploading`, `error`), return a `400 Bad Request` with `{"detail": "Document is not ready for preview."}`.

### Step 3: Page payload preparation

1. Fetch `DocumentPage` rows in `page_number` order.
2. Generate pre-signed URL per page storage key.
3. Build `pages` list with snake_case fields, including the harvested `page_links` metadata:
   ```json
   {
     "page_number": 1,
     "url": "https://minio.../page-1.png?...",
     "metadata": { "width": 595, "height": 842 },
     "page_links": {
       "links": [
         {
           "url": "https://example.com/overlay-link",
           "bbox": { "left": 10.0, "top": 20.0, "width": 30.0, "height": 40.0 }
         }
       ]
     }
   }
   ```

### Step 4: Final response

Return `200` for preview-ready content.

---

## Frontend Link Overlays & XSS Security

When rendering document previews, both **`PreviewViewer`** (raster JPEG mode) and **`PdfJsViewer`** (client-side PDF canvas rendering) dynamically render the extracted page links as absolute-positioned `<a>` tag overlays using the percentage coordinates in `bbox`.

### Security & Parity Measures:
* **DOM-based XSS Prevention**: URLs inside overlays are passed through the `isSafeUrl` validator, which trims whitespace and strips ASCII/Unicode control characters (range `0–31` and `127–159`) to prevent browser-bypass XSS payloads (e.g. `javascript:`, `data:`, `vbscript:`).
* **Bbox Safe Guards**: The rendering engine guards against missing or malformed `bbox` elements (`bbox = null`) in legacy database records to prevent rendering crashes.
* **Synchronized Parity**: Both owner previews (`DocumentPreviewModal`) and public/dataroom viewer previews share this unified, sanitized overlay layer.

---

## Testing Scope

Backend:

- org-scope authorization tests for preview endpoint
- preview-ready vs non-ready status handling tests
- page ordering and response schema tests

Frontend:

- modal open/close behavior
- loading/error/ready rendering paths
- handling of non-ready API response contract
