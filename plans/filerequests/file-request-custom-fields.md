# File Request Custom Intake Fields Implementation Record

## 1. Problem

Public file-request uploads originally captured only uploader name, uploader email, and files. Enterprise teams often need structured project, case, order, or document metadata at upload time so received files can be routed, reviewed, and processed without manual follow-up.

## 2. Implementation Status

Status: implemented as V1.

Implemented:
- Optional custom field schema/config on `FileRequest`.
- Public rendering of configured fields on `PublicUploadPage`.
- Server-side validation during upload finalize.
- Per-upload persistence of submitted field snapshots.
- Detail API/UI exposure of captured field values.
- Automation payload support via flat `custom_field_values`.
- Chat notification summary for file-request custom fields.
- Backend and frontend tests for schema config, submission, retrieval, detail rendering, and automation formatting.

Migration:
- `backend/filerequests/migrations/0003_filerequest_custom_fields_and_more.py` adds:
  - `FileRequest.custom_fields`
  - `UploadedFile.submitted_fields`

## 3. Data Model

`FileRequest.custom_fields`
- `JSONField(default=list, blank=True)`
- Stores the field schema shown to public uploaders.

`UploadedFile.submitted_fields`
- `JSONField(default=dict, blank=True)`
- Stores a submission-time snapshot of each submitted field.

`Document.metadata.file_request_fields`
- Stores the same submission-time snapshot so document context remains visible outside the file-request detail page.

Snapshot shape:

```json
{
  "case_number": {
    "label": "Case Number",
    "type": "text",
    "value": "CASE-2026-001"
  },
  "document_type": {
    "label": "Document Type",
    "type": "select",
    "value": "Contract"
  }
}
```

Why snapshot values:
- Historical uploads remain understandable if an admin later renames or deletes fields from the file request schema.
- Detail UI can render submitted labels/values without relying on the current schema.

## 4. Field Schema

Example schema:

```json
[
  {
    "id": "case_number",
    "label": "Case Number",
    "type": "text",
    "required": true,
    "placeholder": "e.g. CASE-2026-001"
  },
  {
    "id": "document_type",
    "label": "Document Type",
    "type": "select",
    "required": true,
    "options": ["Invoice", "Contract", "ID Document"]
  },
  {
    "id": "due_date",
    "label": "Due Date",
    "type": "date",
    "required": false
  }
]
```

Supported V1 field types:
- `text`
- `textarea`
- `select`
- `date`
- `number`
- `checkbox`

Schema validation:
- Field IDs must be unique and machine-friendly.
- Labels and placeholders have bounded lengths.
- Select fields require at least one option.
- Custom field count is capped at 20.
- Unknown submitted field IDs are rejected.

Frontend ID generation:
- New fields initially use temporary generated IDs.
- During normalization, generated IDs are replaced with label-based slugs.
- Duplicate labels receive suffixes, for example `case_number` and `case_number_2`.
- Existing non-generated IDs are preserved on edit.

## 5. API Behavior

Management API:
- `FileRequestSerializer` includes `custom_fields`.
- Schema is validated on create/update.
- Existing file requests with no custom fields continue to work.

Public metadata API:
- `PublicFileRequestSerializer` includes `custom_fields`.

Finalize upload API:
- `FileRequestUploadFinalizeSerializer` accepts `custom_field_values`.

Example finalize payload:

```json
{
  "storage_key": "...",
  "unique_name": "contract.pdf",
  "file_size": 12345,
  "content_type": "application/pdf",
  "uploader_name": "Alice",
  "uploader_email": "alice@example.com",
  "custom_field_values": {
    "case_number": "CASE-2026-001",
    "document_type": "Contract"
  }
}
```

File request detail API:
- Each uploaded file includes `submitted_fields` using snapshot shape.

Automation payload:
- `file_request_uploaded` includes flat `custom_field_values`.
- Flat values are intentionally kept for webhook/external integration convenience.

Example automation payload fragment:

```json
{
  "custom_field_values": {
    "case_number": "CASE-2026-001",
    "document_type": "Contract"
  }
}
```

## 6. Validation Behavior

Finalize validation:
- Required text/select/date/number fields must be present.
- Required checkbox fields must be checked (`true`).
- Select values must match configured options.
- Date values must be ISO dates.
- Number values must be numeric and booleans are rejected.
- Optional checkboxes may be omitted or submitted as `false`.
- String values are trimmed.
- Field-specific validation errors are returned under `custom_field_values`.

## 7. Frontend Behavior

Internal management UI:
- `frontend/src/components/filerequests/FileRequestSheet.jsx`
- Admin can add/remove fields and edit:
  - label
  - type
  - required
  - placeholder
  - select options

Public upload UI:
- `frontend/src/pages/PublicUploadPage.jsx`
- Renders fields from public `custom_fields`.
- Collects values once per upload session.
- Sends the same `custom_field_values` with each file finalize call.
- Displays backend validation errors near fields where possible.

Detail UI:
- `frontend/src/pages/FileRequestDetailPage.jsx`
- Shows captured values per uploaded file using submitted snapshots.

## 8. Tests

Backend coverage added:
- File request create accepts valid custom field schema.
- Invalid schema is rejected.
- Public metadata includes custom fields.
- Finalize rejects missing required values.
- Finalize rejects required checkboxes submitted as `false`.
- Finalize rejects booleans for number fields.
- Finalize persists submitted snapshots to `UploadedFile.submitted_fields`.
- Finalize persists submitted snapshots to `Document.metadata.file_request_fields`.
- Detail API returns captured values.
- Automation payload includes flat `custom_field_values`.
- Automation chat text includes readable custom field lines.

Frontend coverage added:
- File request sheet sends custom field schema.
- File request sheet slugifies field IDs from labels.
- File request sheet deduplicates generated IDs.
- Public upload page renders configured fields.
- Public upload page sends `custom_field_values`.
- File request detail page renders submitted snapshot labels and values.

## 9. Current Limitations

- Custom fields are collected once per upload session and attached to every uploaded file.
- No per-file metadata collection UI yet.
- No conditional field logic.
- No field reordering.
- No dedicated field-key editor.
- No custom-field search/filter/export.
- No automation rule conditions based on custom field values.

## 10. Future Improvements

Recommended next iterations:
- Add per-file metadata collection for workflows where each file has distinct context.
- Add a visible field-key editor for admins who need stable integration keys.
- Add search/filter/export support for custom field values.
- Add automation conditions and routing based on custom field values.
- Add field reordering.
- Add help text/descriptions per field.
- Add reusable templates for common workflows:
  - case intake
  - invoice collection
  - customer onboarding
  - procurement/order fulfillment

## 11. Acceptance Criteria Status

- Admin can define supported custom fields when creating/editing a file request: done.
- Public uploader sees configured fields and submits values: done.
- Submitted values are validated server-side: done.
- Submitted values are persisted with each uploaded file: done.
- Captured values are visible in file-request detail API and UI: done.
- Validation errors are user-friendly: partially done; backend returns field-specific errors, frontend maps public upload errors near fields.
- Tests cover schema config, public submission, persistence, retrieval, and detail rendering: done for V1 scope.
