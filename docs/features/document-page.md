# Coneshare Document Page Implementation Plan

## Strategy refs
- [Coneshare Roadmap](./strategy/coneshare-roadmap.md)
- [Coneshare Technology Stack](./strategy/coneshare-techstack.md)
- [Coneshare Data Model](./coneshare-data-model.md)
- [Data Ownership Model Analysis for Coneshare](../strategy/coneshare-data-ownership.md)

## Out of scope
- Full analytics redesign beyond document-level summary and session listing.
- New share-link permission model semantics outside existing ShareLink fields.
- Dataroom detail-page redesign (this plan targets document detail only).
- Public viewer UX changes outside owner-side document management pages.

## Design decisions
- Decision: Expose document detail data through a dedicated owner-scoped API endpoint.
  Rationale: Keeps document page hydration simple and avoids over-fetching from list endpoints.
  Tradeoff: Adds endpoint/serializer maintenance for aggregated response shape.
- Decision: Use `ViewSession` as the analytics primitive for visitor activity.
  Rationale: Aligns with current Coneshare model terminology and event tracking.
  Tradeoff: Requires serializer shaping when UI expects flattened visitor rows.
- Decision: Reuse existing ShareLink create/update patterns through `LinkSheet`.
  Rationale: Keeps user flows consistent and minimizes duplicate form logic.
  Tradeoff: Document page interactions remain coupled to shared link form contracts.

This document defines a Coneshare-specific implementation plan for the owner-side document detail page.

---

## 1. Backend: Document Detail API (Django/DRF)

Create a dedicated endpoint that returns one document plus related share links and recent view sessions.

1. Implement an owner-scoped view in `backend/documents/views.py`.
2. Register route in `backend/documents/urls.py` using API v1 conventions.
3. Return aggregated response data:
   - document metadata
   - `share_links` list
   - `view_sessions` list
   - summary metrics (for example: total sessions, total downloads, last viewed time)

Suggested endpoint:
- `GET /api/v1/documents/{document_id}/detail/`

### Access-control requirements

- Require authenticated user.
- Enforce organization-scoped ownership checks: requested document must belong to `request.user.organization`.
- Enforce per-resource visibility checks if additional role/group restrictions are configured.
- Return `404` for out-of-scope documents to avoid tenant enumeration.

---

## 2. Backend: ShareLink Mutation Endpoints

Document page requires create/edit link actions.

Use existing ShareLink API patterns where possible; if missing, implement:

- `POST /api/v1/share-links/` for create
- `PATCH /api/v1/share-links/{id}/` for update

Expected behavior:

1. Validate `document_id` belongs to request user organization.
2. Validate mutable fields (`name`, `expires_at`, `allow_download`, `requires_email`, etc.).
3. Return normalized ShareLink payload for immediate UI refresh.

Security requirements:

- Never allow cross-organization link mutation.
- Apply existing password handling/encryption rules for secure fields.

---

## 3. Frontend: Document Detail Page (React)

Create owner-side page in:
- `frontend/src/pages/DocumentPage.jsx`

Route:
- `/documents/:id`

Primary responsibilities:

1. Fetch `GET /api/v1/documents/{id}/detail/`.
2. Handle loading/error/empty states.
3. Render document metadata, share links, and view session activity.

Recommended component split:

- `DocumentHeader.jsx`: title + page actions.
- `LinksTable.jsx`: renders `share_links`.
- `VisitorsTable.jsx`: renders `view_sessions`.
- `StatsComponent.jsx`: renders summary metrics.

---

## 4. LinkSheet Integration

Reuse `LinkSheet` as the create/edit UI for share links.

State owned by `DocumentPage.jsx`:

```jsx
const [isLinkSheetOpen, setIsLinkSheetOpen] = useState(false);
const [editingLink, setEditingLink] = useState(null);
```

Interaction flow:

1. Create action:
   - `setEditingLink(null)`
   - `setIsLinkSheetOpen(true)`
2. Edit action:
   - `setEditingLink(link)`
   - `setIsLinkSheetOpen(true)`
3. On successful submit:
   - close sheet
   - refetch document detail endpoint

Submission methods:

- Create: `POST /api/v1/share-links/`
- Update: `PATCH /api/v1/share-links/{id}/`

---

## 5. Data Contract Notes

Use consistent naming aligned to the data model:

- `view_sessions` (not generic `views`)
- `share_links`
- document-level summary fields computed from `ViewSession` + download events

Example response shape:

```json
{
  "document": { "id": "01...", "name": "Pitch Deck.pdf", "status": "ready" },
  "share_links": [],
  "view_sessions": [],
  "stats": {
    "total_sessions": 0,
    "total_downloads": 0
  }
}
```

---

## 6. Testing Scope

Backend:

- permission tests for cross-org access denial on detail and link mutation endpoints
- serializer tests for detail response shape
- regression tests for link create/update from document context

Frontend:

- page renders loading/error/data states
- create/edit link actions trigger correct API methods
- tables render `share_links` and `view_sessions` correctly

---

## 7. Collaborator View-Only Mode

When a teammate opens a document owned by another user via a shared Dataroom link or navigation:

1. **Backend Scoping:** `DocumentViewSet` and document utility views (`download`, `preview-data`, `stats`, `view-sessions`) permit access if the user is a collaborator on an active Dataroom containing the document. Mutation endpoints (`perform_update`, `destroy`, `promote_version`, version upload) return `403 Forbidden` for non-owners.
2. **Frontend UI State:** `DocumentPage` computes `canManage` (true for document owner or org admin, false for co-managing collaborators).
   - In view-only mode (`canManage === false`), inline rename, "+ Share" link generation, "Upload new version", "Cloud sync", and "Delete" are disabled/omitted.
   - Read actions (Preview, Download, Stats, Analytics) remain available.
   - A contextual role badge (`Owner: <Name>`) is rendered in the header.

