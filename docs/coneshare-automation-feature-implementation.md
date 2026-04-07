# Coneshare Automation Feature Implementation (V1)

## 1. Purpose

This document defines a practical implementation plan for the Automation feature.

Decision for scope:
- Implement Feature 1 (Webhook Endpoint Support) and Feature 3 (Action Layer) in V1.
- Leave **Feature 2: Event Filtering & High-Intent Signals** for a future version.

---

## 2. Current Implementation Audit

### 2.1 What already exists and can be reused

Event capture and analytics foundation are implemented:
- Share link and dataroom public view flows are implemented in `backend/sharelinks/views.py`.
- Viewer activity is persisted via:
  - `ViewSession`
  - `PageView`
  - `DataroomVisit`
  - `Viewer`
  in `backend/sharelinks/models.py`.
- Public/frontend tracking is already wired:
  - `ShareLinkViewerPage.jsx` creates a view session.
  - `recordPageView` sends granular page events.
  in `frontend/src/pages/ShareLinkViewerPage.jsx` and `frontend/src/services/api.js`.
- Background task infrastructure exists via Celery (per tech stack and `backend/sharelinks/tasks.py`).

Existing notification capability:
- Link-level email notification toggle (`receive_email_notification`) exists on `ShareLink`.
- Notification task exists (`send_view_notification_email_task`) and is triggered on `ViewSession` create.

### 2.2 What is missing for `automation.md`

Not implemented yet:
- No Automation model/rule engine (`WHEN IF THEN`).
- No destination models for webhook or Slack.
- No event bus/normalized automation event log.
- No webhook signing, retry policy, replay, or delivery log UI/API.
- No assignment action model/UI.
- No automation builder UI in frontend.

### 2.3 Key conclusion

Coneshare already has a solid event source layer (view sessions/page views). V1 should add an automation orchestration and delivery layer on top of existing events instead of rebuilding tracking.

---

## 3. V1 Scope (Adjusted)

### In scope for this implementation
- Automation CRUD (enabled/disabled, scoped to link/dataroom/global).
- Destinations:
  - Custom webhook
  - Slack preset (implemented as webhook-backed preset)
- Event subscriptions (basic, no advanced filtering logic):
  - Link viewed
  - Dataroom opened
  - Document viewed
  - Document downloaded
  - Email identified
- Actions:
  - Notify destination (webhook/slack)
  - Notify owner (email)
  - Assign owner/specific user (record only in V1)
- Delivery logs with retry and manual replay.

### Explicitly deferred
- **Feature 2: Event Filtering & High-Intent Signals** (section 6 in `automation.md`).
- Advanced condition builder and signal scoring.

---

## 4. Proposed Architecture

### 4.1 Event source (reuse)

Use existing operational events from `sharelinks`:
- View session created
- Page view recorded
- Download recorded
- Dataroom visit recorded
- Email verified/identified in access flow

Implementation note:
- Emit internal automation events at existing write points in `backend/sharelinks/views.py`.

### 4.2 New automation domain (backend app: `automation`)

Add a new Django app `backend/automation/`.

Core models:
- `AutomationRule`
  - org, name, is_active
  - scope_type: `global | share_link | dataroom`
  - scope id fields
  - subscribed_events (JSON/list)
  - actions (JSON or related rows)
- `AutomationDestination`
  - org, type: `webhook | slack`
  - endpoint_url, method, headers (encrypted/JSON)
  - signing_secret
  - is_active
- `AutomationDelivery`
  - rule, destination, event_type, payload
  - status: `pending | success | failed | dead_letter`
  - response_code, response_body_excerpt
  - attempt_count, next_retry_at, delivered_at
  - idempotency_key
- `AutomationAssignment` (for action type Assign)
  - delivery/event reference
  - assigned_user
  - assigned_by_rule
  - status/timestamps

Rationale:
- Keeps automation concerns independent from `sharelinks` while remaining event-driven.
- Matches roadmap principle of modular, scalable backend domains.

### 4.3 Task and delivery pipeline

Flow:
1. Sharelinks layer emits normalized event payload.
2. `dispatch_automation_event(event_type, payload)` Celery task selects matching active rules.
3. For each destination/action, create `AutomationDelivery` row (`pending`).
4. Execute HTTP delivery task with:
   - HMAC signature header (e.g. `X-Coneshare-Signature`)
   - timeout and retry with backoff
5. Update delivery row with result.
6. Manual replay endpoint re-queues a failed row.

---

## 5. Data Model Additions (Draft)

Add to `docs/coneshare-data-model.md` in a follow-up update:
- `AutomationRule`
- `AutomationDestination`
- `AutomationDelivery`
- `AutomationAssignment`

Suggested relations:
- `Organization` has many automation rules/destinations/deliveries.
- `AutomationRule` belongs to `Organization` and optionally references `ShareLink` or `Dataroom` for scope.
- `AutomationDelivery` belongs to `AutomationRule` and `AutomationDestination`.

---

## 6. API Design (V1 Draft)

Authenticated endpoints:
- `GET/POST /api/v1/automations/`
- `GET/PATCH/DELETE /api/v1/automations/{id}/`
- `GET/POST /api/v1/automation-destinations/`
- `GET/PATCH/DELETE /api/v1/automation-destinations/{id}/`
- `GET /api/v1/automations/{id}/deliveries/`
- `POST /api/v1/automation-deliveries/{id}/replay/`

Event trigger interface (internal service, not public API):
- Python service call from sharelinks write paths to queue `dispatch_automation_event`.

---

## 7. Frontend Design (V1)

Add new pages/components in `frontend/src/`:
- `pages/AutomationsPage.jsx`
- `components/automations/AutomationBuilder.jsx`
- `components/automations/DestinationForm.jsx`
- `components/automations/DeliveryLogsTable.jsx`

V1 UX behavior:
- Preset-first creation flow:
  - Slack preset
  - Custom webhook
- Event picker (basic events only)
- Scope selector (global/link/dataroom)
- Action selector:
  - Notify destination
  - Notify owner
  - Assign user
- Delivery logs list with retry/replay button

---

## 8. Security and Reliability Requirements

Security:
- Store destination secrets encrypted at rest.
- Sign outbound webhooks with per-destination secret.
- Validate allowed protocols (`https://` by default; optional controlled `http://` for self-hosted internal networks).

Reliability:
- Retry strategy: exponential backoff with max attempts.
- Persist full attempt metadata in `AutomationDelivery`.
- Idempotency key per delivery attempt for receiver deduping.
- Replay endpoint for failed/dead-letter deliveries.

Observability:
- Delivery metrics: success rate, p95 delivery latency, failure reasons.
- Structured logs for outgoing webhook attempts.

---

## 9. Mapping to PRD (`automation.md`)

Status by section:
- Section 5 (Webhook Endpoint Support): planned in V1.
- Section 6 (Event Filtering & High-Intent Signals): **deferred to future version**.
- Section 7 (Action Layer): partially planned in V1:
  - Notify: yes
  - Assign: basic record/ownership workflow only
  - Webhook: yes
- Section 5.4 (Observability): planned in V1 via `AutomationDelivery` logs + replay.
- Section 5.5 (Security): planned in V1 with HMAC signing and secret management.

---

## 10. Incremental Delivery Plan

Phase A: Backend foundation
- Create `automation` app, models, migrations, admin.
- Add rule/destination CRUD APIs.

Phase B: Event dispatch integration
- Emit events from `sharelinks` flows.
- Add Celery dispatch and delivery workers.

Phase C: Logs and replay
- Add delivery list API and replay endpoint.
- Add retry/backoff + dead-letter status.

Phase D: Frontend
- Automation list/create/edit UI.
- Destination management and delivery logs.

Phase E: Hardening
- Tests (unit/integration), rate limits, timeout tuning, docs updates.

---

## 11. Testing Strategy

Backend tests:
- Rule matching by scope and event type.
- Webhook signing correctness.
- Retry/backoff transitions (`pending -> failed -> success/dead_letter`).
- Replay behavior.
- Permission boundaries (org/user isolation).

Frontend tests:
- Automation builder create/update flows.
- Destination validation UX.
- Delivery logs rendering and replay actions.

E2E tests:
- Create automation -> trigger view event -> verify delivery log success.
- Simulated endpoint failure -> retry and replay path.

---

## 12. Open Decisions

- Whether assignment should remain internal metadata in V1 or also produce user-visible tasks/notifications immediately.
- Whether Slack should support only incoming-webhook mode in V1 or OAuth-based workspace app install.
- Final event schema versioning strategy (`event_version`) for webhook compatibility.

