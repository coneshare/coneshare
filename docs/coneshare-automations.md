# Coneshare Automations: Current Implementation Reference

This document maps the **current** implementation state of Automations and is intended as a maintenance and enhancement reference.

Primary planning doc moved to:
- `plans/automation-feature-impl.md`

---

## 1. Scope Implemented Today

Automations currently supports:
- Rule CRUD
- Destination CRUD
- Delivery logs (list + replay)
- Event dispatch from sharelinks and file requests
- Webhook delivery with retries and dead-letter
- Multiple destination payload formats (webhook/slack/wechat/feishu/discord)
- Owner-level isolation (not organization-wide sharing)

Out of scope / partially implemented:
- Assign action execution is not implemented (model exists, executor logic missing)
- Advanced event filtering / high-intent signals not implemented

---

## 2. Backend Domain Model

Implemented models (`backend/automations/models.py`):
- `AutomationDestination`
  - destination types: `webhook`, `slack`, `wechat`, `feishu`, `discord`
  - encrypted `signing_secret`
  - `is_active`
- `AutomationRule`
  - scope: `global | share_link | dataroom`
  - `subscribed_events` (JSON list)
  - `actions` (JSON list)
  - M2M to destinations
- `AutomationDelivery`
  - lifecycle: `pending | success | failed | dead_letter`
  - retry metadata and response snapshots
- `AutomationAssignment`
  - model exists, currently not produced by dispatch logic

---

## 3. API Surface

Routes are registered in `backend/automations/urls.py`:
- `/api/v1/automations/`
- `/api/v1/automation-destinations/`
- `/api/v1/automation-deliveries/`
- `/api/v1/automation-assignments/`

Replay endpoint:
- `POST /api/v1/automation-deliveries/{id}/replay/`

Read/write scoping (`backend/automations/views.py`):
- Destinations: visible only to `created_by=request.user`
- Rules: visible only to `created_by=request.user`
- Deliveries: visible only when `delivery.rule.created_by=request.user`
- Assignments: visible only when `assigned_by_rule.created_by=request.user`

---

## 4. Event Contract and Validation

Allowed events are centralized in:
- `ALLOWED_AUTOMATION_EVENTS` in `backend/automations/serializers.py`

Current allowed events:
- `document_viewed`
- `dataroom_opened`
- `document_downloaded`
- `email_identified`
- `file_request_uploaded`

Validation rules:
- At least one destination is required on a rule
- Destinations must belong to user org
- Destinations must be owned by current user
- `file_request_uploaded` is allowed only for `global` scope rules

---

## 5. Dispatch Pipeline

Core dispatch service:
- `dispatch_automation_event(event_type, payload)` in `backend/automations/services.py`

Mandatory payload fields:
- `organization_id`
- `owner_user_id`

Strict behavior:
- Missing `organization_id`: drop + warning log
- Missing `owner_user_id`: drop + warning log
- Invalid org: drop + warning log

Matching behavior:
- active rules only
- `created_by_id == owner_user_id`
- event subscription match
- scope match (`global/share_link/dataroom`)

Delivery creation:
- one `AutomationDelivery` per (matched rule x active destination)
- queue `deliver_automation_delivery_task`

Performance note:
- destinations are prefetched and filtered in memory (`[d for d in rule.destinations.all() if d.is_active]`) to avoid N+1 queries

---

## 6. Delivery Execution Behavior

Worker:
- `deliver_automation_delivery_task` in `backend/automations/tasks.py`

Payload formatting:
- Slack: `{ "text": ... }`
- WeChat: `{ "msgtype": "text", "text": {"content": ...} }`
- FeiShu: `{ "msg_type": "text", "content": ... }`
- Discord: `{ "content": ... }`
- Generic webhook: raw event payload
- URL-based auto-detection exists for WeChat/FeiShu/Discord webhook endpoints

Retry behavior:
- HTTP/network failures: exponential retry, max attempts, then `dead_letter`
- Inactive rule or destination: **non-retryable**, immediately terminal (`dead_letter`)

Security note:
- review concern is valid: avoid logging full webhook URLs and full payload bodies in production logs

---

## 7. Event Sources Implemented

### 7.1 Share Links (`backend/sharelinks/views.py`)

Dispatch helper:
- `_dispatch_automation_event(share_link, event_type, extra_payload)`

Base payload fields include:
- `organization_id`
- `owner_user_id`
- `share_link_id`
- optional `document_id/document_name`
- optional `dataroom_id/dataroom_name`
- `event_datetime` (ISO datetime string)
- `visitor_ip` (nullable)
- `visitor_country` (nullable)
- `visitor_city` (nullable)
- `visitor_latitude` (nullable)
- `visitor_longitude` (nullable)

Emitted events:
- `document_viewed`
  - direct document links on view session create
  - dataroom document open (`view-data?document_id=...`)
- `dataroom_opened`
  - dataroom link session open
- `document_downloaded`
  - view-session record-download endpoint
  - dataroom single file download endpoint when `view_session_id` supplied
  - dataroom folder download endpoint when `view_session_id` supplied
- `email_identified`
  - email access flows

### 7.2 File Requests (`backend/filerequests/views.py`)

On finalize upload success:
- enqueue on commit: `file_request_uploaded`
- payload includes uploader/file/request metadata and `owner_user_id`
- payload includes `event_datetime` and visitor fields set to `null`

---

## 8. Frontend Implementation Status

Main page and components:
- `frontend/src/pages/AutomationsPage.jsx`
- `frontend/src/components/automations/AutomationBuilder.jsx`
- `frontend/src/components/automations/DestinationForm.jsx`
- `frontend/src/components/automations/DeliveryLogsTable.jsx`

Current UX highlights:
- Rules, destinations, delivery logs sections
- View/edit/delete for rules and destinations
- Replay from logs
- Pagination in logs
- Lazy fetch for share links / datarooms by selected scope
- Form guard: at least one destination required
- `file_request_uploaded` option shown and restricted to `global` scope
- long text truncation added for rules/destinations list rows

---

## 9. Known Gaps / Technical Debt

1. Assign action non-functional
- `AutomationAssignment` exists but no action executor creates assignment records

2. Logging hardening
- remove/mask sensitive URL query tokens and payload values in delivery logs

3. Event taxonomy cleanup
- continue to keep event names semantic and source-specific


---

## 10. Recommended Enhancement Roadmap

Short-term:
1. Implement action executor for `assign` and `notify_owner` semantics
2. Add explicit event schema docs (required/optional payload fields per event)

Mid-term:
1. Introduce typed action config schema in backend validation
2. Add per-event payload normalizers and versioning
3. Add metrics dashboard (delivery success rate, retries, dead-letter reasons)

Future (per plan):
1. Feature 2: Event filtering and high-intent signals

---

## 11. Future Destination Payload Strategy

For predefined chat-style destinations (`slack`, `wechat`, `feishu`, `discord`):
- Keep destination-specific formatted payloads as the default behavior.
- Rationale:
  - each platform has strict payload schemas/limits;
  - formatted messages are immediately readable by humans;
  - reduces integration breakage from raw payload schema changes.

For generic system integrations:
- Keep raw JSON payload delivery for `webhook` destinations.

Potential future enhancement:
- add an optional per-destination **raw mode** toggle for predefined destinations.
- when raw mode is enabled, include stable metadata fields such as:
  - `event_type`
  - `event_datetime`
  - `schema_version` (recommended for compatibility management)

---

## 12. Key File Index

Backend core:
- `backend/automations/models.py`
- `backend/automations/serializers.py`
- `backend/automations/views.py`
- `backend/automations/services.py`
- `backend/automations/tasks.py`

Event producers:
- `backend/sharelinks/views.py`
- `backend/filerequests/views.py`

Frontend:
- `frontend/src/pages/AutomationsPage.jsx`
- `frontend/src/components/automations/AutomationBuilder.jsx`
- `frontend/src/components/automations/DestinationForm.jsx`
- `frontend/src/components/automations/DeliveryLogsTable.jsx`

Tests (entry points):
- `backend/tests/automations/test_views.py`
- `backend/tests/automations/test_services.py`
- `backend/tests/automations/test_tasks.py`
- `backend/tests/automations/test_event_dispatch_integration.py`
- `backend/tests/filerequests/test_views.py`
