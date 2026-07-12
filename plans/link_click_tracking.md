# Feature Plan: Link Click Tracking in Document Previews

## Overview
Track which links users click within document previews (PDFs/documents) and record these events in the "Activity Log" of the View Sessions.

## 1. Database (Django Models)
We will create a new model to persist link click events.
*   **Model**: Add a `LinkClick` model in `backend/sharelinks/models.py`.
*   **Fields**: 
    *   `id` (ULIDField)
    *   `view_session` (ForeignKey to `ViewSession`, related_name='link_clicks')
    *   `dataroom_visit` (ForeignKey to `DataroomVisit`, nullable, related_name='link_clicks') - Set if the click happens while viewing a document inside a Dataroom.
    *   `url` (TextField) - The target destination link (outbound external URLs only).
    *   `page_number` (IntegerField) - The page number where the click occurred.
    *   `clicked_at` (DateTimeField, auto_now_add=True)

## 2. Telemetry and API Ingestion
*   **Filtering**: Telemetry will only track outbound external URLs (starting with `http://` or `https://`). Internal navigation page jumps (e.g. Table of Contents jumps) will not be logged as clicks, since they are already reflected in the page-view duration metrics.
*   **Owner View Flagging**: Clicks by the ShareLink owner are logged in the database, but since their `ViewSession` will be dynamically annotated with `is_owner_view=True` by the serializer, they can be easily filtered out in the owner analytics UI.
*   **Ingestion Endpoint**: Create `POST /api/v1/analytics/link-click/` in `backend/analytics/views.py` (or sharelinks app).
    *   Expects payload: `session_token`, `url`, `page_number`, and optional `dataroom_visit_id`.
*   **Serializer Update**: Update `ViewSessionSerializer` (and `DataroomVisitSerializer`) to prefetch and include `link_clicks` in the payload.

## 3. Frontend Telemetry (The Viewers)
*   **Components**: `PdfJsViewer.jsx` and `PreviewViewer.jsx`
*   **Implementation**: Attach an `onClick` listener to any generated `<a>` annotations that point to external URLs.
*   **Reliability**: When clicked, fire a `navigator.sendBeacon` or a `fetch` request with `keepalive: true` to prevent the request from getting aborted as the new tab or page is opening.

## 4. Frontend UI (`ViewSessionsTable.jsx`)
*   **Dataroom Views**: Link click events will be rendered **nested inside the specific document visit row** (under the document name) where the click occurred.
*   **Single Document Views**: In the expanded view session row, show a list of "Clicked Links" directly below the `PageViewsChart`.
*   **Filtering**: Ensure clicks belonging to owner-test sessions (`is_owner_view` is true) can be toggled/filtered out in the dashboard.
