# Feature Plan: ShareLink Click-Through NDA

## Overview
Enable a "click-through" Non-Disclosure Agreement (NDA) gate for ShareLinks. If enabled, external users must accept the NDA before accessing the underlying document or dataroom contents.

## 1. Database Architecture
**Enhancements to `ShareLink` model:**
*   `require_nda` (BooleanField, default=False)
*   `nda_text` (TextField, blank=True) - Markdown supported.
*   `nda_version` (IntegerField, default=1) - Increments when the owner edits the `nda_text`, forcing users to re-accept the new terms.

**New Model: `NDAAcceptance`**
To track legally relevant acceptance records, accommodating both anonymous and verified viewers.
*   `id` (ULIDField)
*   `share_link` (ForeignKey to ShareLink)
*   `nda_version` (IntegerField)
*   `view_session` (ForeignKey to ViewSession, null=True) - Set for anonymous viewers.
*   `viewer` (ForeignKey to Viewer, null=True) - Set for email-verified viewers (allows cross-device persistence).
*   `accepted_at` (DateTimeField, auto_now_add=True)
*   `ip_address` (GenericIPAddressField)
*   `user_agent` (CharField)

*Constraint*: Ensure an acceptance record has *either* a `view_session` or a `viewer`.

## 2. Backend API & Enforcement
*   **ShareLink Metadata Endpoint**:
    *   The `ShareLinkSerializer` will return `require_nda`, `nda_text`, and `nda_version`.
    *   It will also return a computed field `has_accepted_current_nda`. This logic will check the `NDAAcceptance` table for the current session/viewer against the link's `nda_version`.
*   **New Endpoint: `POST /api/v1/sharelinks/<slug>/accept-nda/`**:
    *   Records the acceptance. Creates an `NDAAcceptance` row tied to the active `ViewSession` (and `Viewer` if applicable).
*   **Enforcement Boundary**:
    *   Modify the permissions or view logic for `/preview-data/`, `/download/`, and `/dataroom/` endpoints.
    *   If the link requires an NDA and `has_accepted_current_nda` is False, return `HTTP 403 Forbidden` with a specific error code (e.g., `nda_required`).

## 3. Frontend UI / UX
*   **ShareLink Settings (Owner)**:
    *   Add a toggle for "Require NDA" in the ShareLink creation/edit modal.
    *   When enabled, show a Markdown text area for the NDA content.
    *   When editing an existing link with an NDA, warn the user that changing the text will increment the version and force existing viewers to re-accept.
*   **Viewer Flow**:
    *   If a viewer lands on a link and `require_nda=True` but `has_accepted_current_nda=False`:
        *   The standard document viewer / dataroom tree is hidden.
        *   An NDA screen takes up the main view. It displays the link title and renders the `nda_text` in a scrollable box.
        *   A prominent "I Accept" button is presented.
    *   Upon clicking "I Accept", the frontend calls the `/accept-nda/` endpoint and then smoothly transitions to the document/dataroom view without a full page reload.

## 4. Analytics & Auditing
*   **ViewSessions Table / Export**:
    *   Update the dashboard Analytics tab to display NDA acceptance status. We can expose the acceptance timestamp and IP address in the View Sessions table or a dedicated NDA audit log export.
