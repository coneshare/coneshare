# Feature: Document Version History & Restore/Reversion Control

## Problem Description
Currently, when a user uploads or imports a new version of an existing document, the new version is automatically set as the primary/active version. If the new version fails to generate previews, contains formatting errors, or is corrupted, there is no way for a user to revert to a previous working version. 

Because share links and engagement analytics data (view sessions) are tied directly to the parent `Document` record, we need a way to restore older document versions without deleting the document or breaking existing links and statistics.

## Proposed Solution
We will leverage the existing one-to-many relationship between `Document` and `DocumentVersion` to introduce a "Version History" management tab in the UI.

### 1. Backend Changes
* **`POST /api/v1/documents/{id}/promote_version/`**
  * **Payload:** `{"version_id": <int>}`
  * **Behavior:**
    * Validate the version belongs to the target document.
    * Use a `transaction.atomic()` block.
    * Set `is_primary = False` on the current primary version.
    * Set `is_primary = True` on the selected version.
    * Sync the parent `Document` fields (`file_size`, `content_type`, `type`, `storage_key`, `original_storage_key`, `num_pages`) with the newly promoted version.
    * Map the parent document's `status` and `status_message` accurately based on the promoted version's `render_status` (e.g., if the version's `render_status` is `failed`, set the Document's `status` to `error`; if `ready` or `not_applicable`, set to `ready`).

* **`GET /api/v1/documents/{id}/preview-data/` (Enhancement)**
  * **Query Parameters:** `?version_id=<int>` (optional)
  * **Behavior:**
    * If `version_id` is provided, generate preview data and URLs (e.g. page images, PDF preview URL) for that specific version.
    * If `version_id` is not provided, fallback to the current behavior of using the active (`is_primary=True`) version.

### 2. Frontend Changes
* Add a **"Version History"** section or tab to [frontend/src/pages/DocumentPage.jsx](file:///Users/xiez/coneshare/frontend/src/pages/DocumentPage.jsx).
* Render a table listing all versions for the document (retrieved from `document.versions` array).
* **Table Columns:**
  * **Version Number** (e.g. `v1`, `v2`, `v3`)
  * **Upload Date**
  * **Uploaded By / Source** (Fallback to uploader metadata if available)
  * **File Size**
  * **Status** (Green badge for `Primary / Active`, grey for `Inactive`)
* **Actions:**
  * **Preview:** Opens the `DocumentPreviewModal` for that specific version (passing `versionId` to the preview data request).
  * **Restore (Promote):** Hidden for the active version. Triggers `promote_version` API, shows a success toast, and refreshes the document details.

## Acceptance Criteria
- [ ] Users can see a complete list of past versions for any document.
- [ ] Users can click "Preview" on any past version to privately view its pages and check formatting before making it active.
- [ ] Users can click "Restore" on any past version, which instantly changes the active file served by share links without losing any view session analytics.
- [ ] The current primary version is clearly labeled and cannot be promoted again.
- [ ] All database actions are atomic and secure.
