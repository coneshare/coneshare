# Coneshare File Request Virus Scan: Current Implementation

## Strategy refs
- [Coneshare File Requests Design](./file-requests.md)
- [Coneshare Automations: Current Implementation Reference](./automations.md)
- [Coneshare Technology Stack](./strategy/coneshare-techstack.md)

## Out of scope
- Internal authenticated document upload malware scanning.
- Deep antivirus policy tuning (signature allow/deny lists, YARA pipelines).
- SIEM export pipeline and dedicated security dashboard UI.

## Design decisions
- Decision: Scan only public file-request uploads (external uploader path).
  Rationale: External upload risk is higher; internal uploads are treated as trusted for V1.
  Tradeoff: Internal uploads are not malware-scanned in this phase.
- Decision: Keep scanning feature-flagged and default off.
  Rationale: Safe rollout and operational control per deployment.
  Tradeoff: Security posture depends on operator enablement.
- Decision: Reuse Automations for security alert delivery events.
  Rationale: Existing async/retry/dead-letter delivery pipeline already exists.
  Tradeoff: Alert routing depends on automation rule configuration.

This document records the current, implemented virus scan behavior for file requests.

---

## 1. Scope Implemented Today

Implemented:
- Malware scan gate in file-request finalize endpoint only:
  - `POST /api/v1/public/file-requests/{slug}/finalize-upload/`
- Friendly frontend error messages for:
  - malware detected
  - scanner unavailable
- Security alert events dispatched to automations:
  - `file_request_malware_detected`
  - `file_request_scan_failed`

Not implemented in current scope:
- Scan enforcement in internal upload finalize endpoints.

---

## 2. Backend Flow

### 2.1 Endpoint integration

File: `backend/filerequests/views.py`

Flow in finalize:
1. Validate file request and payload.
2. Run `scan_storage_key_or_raise(storage_key)` before document creation.
3. If clean: continue normal document creation + uploaded file linkage.
4. If malware detected:
   - return `400` with user-facing block message
   - create `SecurityThreatEvent`
   - dispatch automation event `file_request_malware_detected`
5. If scanner unavailable (fail-closed):
   - return `503` with user-facing retry-later message
   - create `SecurityThreatEvent`
   - dispatch automation event `file_request_scan_failed`

### 2.2 Scanner module

File: `backend/documents/malware_scan.py`

Implemented behavior:
- Feature flag: no-op when disabled.
- Retrieves uploaded object via file server signed download URL.
- Streams file bytes to ClamAV using TCP `INSTREAM`.
- Raises:
  - `MalwareDetectedError` when ClamAV reports `FOUND`
  - `MalwareScannerUnavailableError` when scan cannot complete and fail mode is closed

---

## 3. Configuration

Environment variables:
- `MALWARE_SCAN_ENABLED` (default `false`)
- `CLAMAV_HOST` (default `clamav`)
- `CLAMAV_PORT` (default `3310`)
- `MALWARE_SCAN_TIMEOUT_MS` (default `10000`)
- `MALWARE_SCAN_FAIL_MODE` (`closed|open`, default `closed`)

Compose profile support:
- `clamav` service is profile-gated (`malware`)
- start with:
  - `docker compose --profile malware up -d`

---

## 4. Threat Event Persistence

Model:
- `filerequests.SecurityThreatEvent` (in `backend/filerequests/models.py`)

Purpose:
- Persistent audit trail for file-request security incidents.

Current fields include:
- ownership/context: `organization`, `owner_user`, `file_request`
- classification: `event_type` (`malware_detected|scan_failed`), `severity`, `status`
- file/uploader: `storage_key`, `file_name`, `file_size`, `content_type`, `uploader_name`, `uploader_email`
- scanner metadata: `scanner_engine`, `scanner_message`

Admin registration:
- `SecurityThreatEventAdmin` in `backend/filerequests/admin.py`

---

## 5. Automations Integration

Allowed automation events now include:
- `file_request_uploaded`
- `file_request_malware_detected`
- `file_request_scan_failed`

Scope validation:
- all file-request events above are restricted to `global` scope rules.

Dispatch:
- malware detected path dispatches `file_request_malware_detected`
- scanner unavailable path dispatches `file_request_scan_failed`
- payload includes `organization_id`, `owner_user_id`, file-request metadata, uploader metadata, and `threat_event_id`

Delivery formatting:
- Chat-style destinations (Slack/WeChat/FeiShu/Discord) produce text/content messages including uploader, filename, and request slug.

---

## 6. Frontend Behavior

Public uploader page:
- `frontend/src/pages/PublicUploadPage.jsx`

Friendly error mapping:
- Malware detect (`400` + security-scan detail):
  - “This file was blocked by our security scan. Please remove it and upload a different file.”
- Scanner unavailable (`503` + scanner detail):
  - “Uploads are temporarily unavailable because the security scanner is offline. Please try again later.”

---

## 7. Testing Status

Backend tests cover:
- malware detected rejection + automation security event dispatch
- scanner unavailable rejection + automation security event dispatch
- automation event validation and delivery text generation for new events

Frontend tests cover:
- friendly malware/scanner unavailable messages on public upload page
