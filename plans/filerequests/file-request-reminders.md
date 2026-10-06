# File Request Reminders Plan

## 1. Problem

File requests currently wait passively for external uploaders to submit files. When no upload arrives, the owner must manually follow up outside Coneshare.

Collection workflows often stall without reminders, especially for case intake, procurement, diligence, customer onboarding, and compliance workflows.

## 2. Goal

Add optional per-request reminder settings and emit automation events when a file request is due for follow-up.

The reminder system should use the existing automation destination model for Slack, webhook, WeChat, FeiShu, and Discord delivery instead of introducing a separate notification channel.

## 3. Scope

In scope:
- Add reminder settings on `FileRequest`.
- Add scheduler logic to find due reminders.
- Emit `file_request_reminder_due` automation events.
- Stop reminders based on configured end condition and baseline safety conditions.
- Expose reminder config/status in file-request management API and UI.
- Add tests for cadence, due selection, event emission, and stop conditions.

Out of scope for V1:
- Email reminders sent directly to external uploaders.
- Per-recipient reminder templates.
- Escalation chains.
- Reminder history UI beyond basic last/next reminder fields.
- Complex business-day calendars.
- Custom automation conditions based on reminder count.

## 4. Data Model

Recommended explicit fields on `FileRequest`:

- `reminder_enabled`
  - Boolean, default `False`.

- `reminder_cadence`
  - String enum, nullable/blank.
  - Suggested values: `daily`, `weekly`.

- `reminder_end_condition`
  - String enum.
  - Suggested values: `first_upload`, `expires_at`.

- `next_reminder_at`
  - Nullable datetime.
  - Used by scheduler queries.

- `last_reminder_sent_at`
  - Nullable datetime.

- `reminder_count`
  - Integer, default `0`.

Alternative:
- Store config in `reminder_settings` JSON.

Recommendation:
- Use explicit fields for V1 because due-reminder queries need to be simple, indexable, and reliable.

Migration note:
- Do not auto-generate migration files in agent changes. Migration files should be created manually by the maintainer.

## 5. Reminder Semantics

Baseline stop conditions should always apply:
- `is_active = false` stops reminders.
- `expires_at` passed stops reminders.
- Deleted file request stops reminders.

Configured end conditions:
- `first_upload`: stop after the first `UploadedFile` exists for the request.
- `expires_at`: continue until expiration, unless stopped by inactive/deleted state.

Cadence:
- `daily`: next reminder is due 24 hours after the previous reminder.
- `weekly`: next reminder is due 7 days after the previous reminder.

Initial scheduling:
- When reminders are enabled, set `next_reminder_at` to `now + cadence`.
- If reminders are disabled, clear `next_reminder_at`.
- If cadence changes, recalculate `next_reminder_at` conservatively from `now`.

## 6. Scheduler Architecture

Current repository note:
- The project has a Celery worker service.
- There is no Celery Beat service in `docker-compose.yml` today.

V1 implementation options:

1. Add Celery Beat
   - Add `celery_beat` service to Docker Compose.
   - Configure periodic task, for example every 5 or 15 minutes.
   - Best long-term fit if more scheduled jobs are expected.

2. Management command + external cron
   - Add `python manage.py dispatch_file_request_reminders`.
   - Operators schedule it externally.
   - Simpler operational model for some self-hosted deployments, but less integrated.

Recommendation:
- Add a management command first and optionally wire it to Celery Beat later.
- The core reminder selection/emission logic should live in a service function reusable by both.

Suggested service:

```python
dispatch_due_file_request_reminders(now=None) -> int
```

Responsibilities:
- Select active file requests with `reminder_enabled=True`.
- Filter `next_reminder_at <= now`.
- Apply stop conditions.
- Emit automation event.
- Update `last_reminder_sent_at`, `next_reminder_at`, and `reminder_count`.
- Avoid duplicate emissions under concurrent schedulers.

Concurrency:
- Use transaction + row locking where supported.
- Ensure a due request cannot emit multiple reminder events at the same scheduled time.

## 7. Automation Integration

Add allowed event:

```text
file_request_reminder_due
```

The event should work with existing automation destinations.

Suggested payload:

```json
{
  "organization_id": "...",
  "owner_user_id": "...",
  "file_request_id": "...",
  "file_request_slug": "...",
  "file_request_name": "Investor documents",
  "folder_id": "...",
  "folder_name": "Investor Intake",
  "reminder_cadence": "daily",
  "reminder_count": 2,
  "reminder_due_at": "2026-05-28T14:30:00+00:00",
  "expires_at": "2026-06-01T00:00:00+00:00",
  "uploaded_files_count": 0
}
```

Automation rule validation:
- Current file-request automation events are global-only.
- Add `file_request_reminder_due` to the same global-only set unless a native `file_request` automation scope is introduced later.

Chat text:
- Extend automation message builder with a friendly sentence, for example:

```text
File request "Investor documents" is still waiting for uploads.
Reminder count: 2
```

## 8. API Changes

Management API:
- Include reminder fields in `FileRequestSerializer`.
- Validate combinations:
  - If `reminder_enabled=True`, `reminder_cadence` is required.
  - If `reminder_enabled=True`, `reminder_end_condition` is required.
  - If `reminder_end_condition=expires_at`, `expires_at` should be set.

Detail API:
- Include reminder status:
  - `reminder_enabled`
  - `reminder_cadence`
  - `reminder_end_condition`
  - `next_reminder_at`
  - `last_reminder_sent_at`
  - `reminder_count`

Public API:
- No public reminder fields should be exposed to uploaders in V1.

## 9. Frontend Changes

Update `frontend/src/components/filerequests/FileRequestSheet.jsx`:
- Add reminder section.
- Toggle reminders on/off.
- Choose cadence.
- Choose end condition.
- Show validation when required reminder options are missing.

Update `frontend/src/pages/FileRequestDetailPage.jsx`:
- Show reminder status.
- Show next reminder time and last reminder time.
- Show reminder count.

Suggested UI section:

```text
Reminders
[x] Enable reminders
Cadence: Daily / Weekly
Stop when: First upload received / Request expires
```

## 10. Testing

Backend:
- Enabling reminders sets `next_reminder_at`.
- Disabling reminders clears `next_reminder_at`.
- Invalid reminder config is rejected.
- Scheduler emits `file_request_reminder_due` for due active requests.
- Scheduler does not emit for inactive requests.
- Scheduler does not emit for expired requests.
- Scheduler stops when first upload exists and end condition is `first_upload`.
- Scheduler continues until expiry when end condition is `expires_at`.
- Scheduler updates `last_reminder_sent_at`, `next_reminder_at`, and `reminder_count`.
- Scheduler avoids duplicate emissions under repeated runs.
- Automation rule validation accepts `file_request_reminder_due`.

Frontend:
- File request sheet saves reminder settings.
- Reminder validation errors are visible.
- Detail page displays reminder status.

## 11. Interaction With Custom Intake Fields

This plan is independent of `plans/file-request-custom-fields.md`.

Overlap:
- Both features touch `FileRequestSerializer`.
- Both features add controls to `FileRequestSheet`.
- Both features add information to `FileRequestDetailPage`.

Recommended implementation order:
1. Custom intake fields.
2. Reminder settings.
3. Scheduler and automation event emission.

Rationale:
- Custom fields improve uploaded-file context and have lower operational complexity.
- Reminders introduce scheduler infrastructure and idempotency concerns.

## 12. Acceptance Criteria

- Reminders can be enabled/disabled per file request.
- Reminder cadence can be configured.
- Reminder end condition can be configured.
- Reminder event fires at configured cadence.
- Reminder event stops under configured and baseline stop conditions.
- Reminder event works with existing automation destinations.
- Tests cover scheduling, event emission, and stop conditions.
