# Coneshare Share Link Q&A

## Strategy refs
- [Coneshare Technology Stack](../strategy/coneshare-techstack.md)
- [Coneshare Data Model](../coneshare-data-model.md)
- [Coneshare Share Link View Logic](./share-link-view-logic.md)
- [Coneshare Dataroom Feature Implementation Plan](./dataroom-implementation.md)
- [Coneshare Automations](./automations.md)

## Out of scope
- Real-time websocket delivery.
- Full rich-text editing, file attachments, and mentions.
- Cross-share-link Q&A aggregation beyond owner/admin listing views.
- Replacing the existing automation pipeline with a dedicated notification system.

## Design decisions
- Decision: Treat Q&A as a share-link feature, not a dataroom-only feature.
  Rationale: Single-document share links also need contextual owner/viewer discussion.
  Tradeoff: The data model must support both direct document links and dataroom item contexts.
- Decision: Scope all external viewer access through `ShareLink` and `ViewSession`.
  Rationale: Q&A permissions must match the same public access gates used by viewing.
  Tradeoff: Public Q&A APIs need explicit session validation and cannot be generic dataroom APIs.
- Decision: Gate Q&A with a two-level switch (`Dataroom.enable_qna`, `ShareLink.enable_qna`).
  Rationale: Owners need one master switch per room plus per-audience control, so one
  group can use Q&A while another cannot.
  Tradeoff: The effective value is the AND of both flags; a link can never re-enable
  Q&A that its dataroom turned off.
- Decision: Use dataroom item context for dataroom Q&A.
  Rationale: Dataroom permissions are link-specific and stored on `ShareLinkDataroomSetting`.
  Tradeoff: Dataroom Q&A should target `DataroomDocument` or `DataroomFolder`, not raw `Document`.

This document defines the planned Q&A workflow for owners and external viewers on shared links.
The feature should keep discussion in the viewing experience instead of spilling into email/chat.

---

## Scope

Implement end-to-end `QnAThread` / `QnAMessage` workflows for:

- Single-document share links: document-level Q&A for the shared document.
- Dataroom share links: contextual Q&A on a visible dataroom document or folder.

Required behavior:

- thread creation in document or folder context
- owner/viewer message exchange
- `open` and `closed` thread states
- timestamped thread history
- notifications through the existing automation/event pipeline

---

## Context Model

### Single-document share link

For a `ShareLink` with `document_id` set:

- Q&A thread belongs to the `ShareLink`.
- Context is the linked `Document`.
- Viewer permission is the same as document view permission for that share link/session.
- No folder or dataroom item context is needed.

### Dataroom share link

For a `ShareLink` with `dataroom_id` set:

- Q&A thread belongs to the `ShareLink` and `Dataroom`.
- Context is exactly one of:
  - `DataroomDocument`
  - `DataroomFolder`
- The target must belong to the dataroom.
- The target must be visible through that specific share link.
- Folder-path visibility must be enforced: if any ancestor folder is invisible, the thread target is not accessible.

---

## Proposed Data Model

The existing commented Q&A stub in `backend/datarooms/models.py` should be replaced rather than used as-is.
It currently models Q&A as dataroom-only and targets raw `Document`; that does not match share-link scoped permissions.

### `QnAThread`

- `organization`: Foreign Key to `Organization`
- `share_link`: Foreign Key to `ShareLink`
- `dataroom`: Foreign Key to `Dataroom`, nullable
- `document`: Foreign Key to `Document`, nullable
- `dataroom_document`: Foreign Key to `DataroomDocument`, nullable
- `dataroom_folder`: Foreign Key to `DataroomFolder`, nullable
- `subject`: Text
- `status`: String enum (`open`, `closed`)
- `created_by_user`: Foreign Key to `User`, nullable
- `created_by_viewer`: Foreign Key to `Viewer`, nullable
- `created_by_view_session`: Foreign Key to `ViewSession`, nullable
- timestamps

Integrity rules:

- `share_link` is always required.
- For document links, `document` must match `share_link.document`.
- For dataroom links, exactly one of `dataroom_document` or `dataroom_folder` must be set.
- Exactly one creator identity path should be set: owner/admin user or external viewer/session.

### `QnAMessage`

- `thread`: Foreign Key to `QnAThread`
- `body`: Text
- `sent_by_user`: Foreign Key to `User`, nullable
- `sent_by_viewer`: Foreign Key to `Viewer`, nullable
- `sent_by_view_session`: Foreign Key to `ViewSession`, nullable
- timestamps

Integrity rules:

- Exactly one sender identity path should be set: owner/admin user or external viewer/session.
- Messages can only be created on `open` threads, unless an owner/admin is posting a final moderation message.

Migration note:
- Do not create migration files unless explicitly requested by the maintainer.

---

## API Shape

### Public viewer APIs

Public endpoints should be share-link scoped and should validate the viewer session before reading or writing Q&A.

- `GET /api/v1/links/{slug}/qna-threads/`
- `POST /api/v1/links/{slug}/qna-threads/`
- `GET /api/v1/links/{slug}/qna-threads/{thread_id}/messages/`
- `POST /api/v1/links/{slug}/qna-threads/{thread_id}/messages/`

Expected public request context:

- `view_session_id` is required for viewer writes.
- If the link requires email, `ViewSession.viewer_email` or `Viewer` should identify the sender.
- For dataroom links, request payload includes one of `dataroom_document_id` or `dataroom_folder_id`.
- For document links, backend infers the context from `ShareLink.document`.

### Owner/admin APIs

Authenticated endpoints should support moderation and resolution:

- `GET /api/v1/share-links/{id}/qna-threads/`
- `GET /api/v1/datarooms/{id}/qna-threads/`
- `POST /api/v1/qna-threads/{id}/messages/`
- `PATCH /api/v1/qna-threads/{id}/`

Owner/admin actions:

- reply to a thread
- close a thread
- reopen a thread
- list thread history by share link, dataroom, document, folder, status, and recency

---

## Availability Switch

Q&A can be switched off at two levels:

- `Dataroom.enable_qna` (default `True`): master switch for the room. Turning it off
  disables Q&A on every share link into that dataroom.
- `ShareLink.enable_qna` (default `True`): per-link switch. Lets one audience use Q&A
  while another does not.

The effective value is exposed as `ShareLink.qna_enabled`:

```python
qna_enabled = share_link.enable_qna and (dataroom.enable_qna if dataroom else True)
```

Enforcement:

- `_get_authorized_qna_view_session` rejects every public Q&A request with `403` when
  `qna_enabled` is `False`. This covers thread list/create, message list/create, and
  the summary endpoint.
- Owners cannot create new threads on a disabled link, but keep read, reply, close,
  and reopen access so existing conversations can be wound down.
- The effective flag ships to viewers as `link_settings.enable_qna` in both the
  document and the dataroom public payloads, so the frontend hides all Q&A entry
  points instead of rendering controls that would fail.

Existing threads are never deleted by the switch; they simply become unreachable for
viewers.

---

## Permission Rules

### Viewer permissions

A viewer can access a Q&A thread only when all conditions are true:

- the thread belongs to the requested `ShareLink`
- the viewer has passed the same share-link gates required for viewing
- the provided `ViewSession` belongs to that share link
- for dataroom context, the target is visible under `ShareLinkDataroomSetting`
- for dataroom folder context, every ancestor folder is visible for that share link

Viewers must not be able to:

- access threads from another share link
- create Q&A on invisible dataroom items
- use a forged `view_session_id`
- reply to closed threads

### Owner/admin permissions

Owners/admins can access Q&A when:

- they belong to the same organization as the share link
- they have permission to manage the target document or dataroom

Admins can moderate/resolve Q&A for organization-owned resources.
Owners can moderate/resolve Q&A for resources they own or manage according to existing document/dataroom permissions.

---

## Thread Lifecycle

1. Viewer or owner creates an `open` thread.
2. Either side can add timestamped messages while the thread is open.
3. Owner/admin can close the thread when resolved.
4. Viewer cannot reply after closure.
5. Owner/admin can reopen a thread if follow-up is needed.

Closed thread behavior should be explicit in the API response so the frontend can disable reply controls.

---

## Automation Events

Add Q&A events to the automation event allowlist:

- `qna_thread_created`
- `qna_message_created`
- `qna_thread_closed`
- `qna_thread_reopened`

Recommended payload fields:

- `organization_id`
- `owner_user_id`
- `share_link_id`
- `dataroom_id`
- `document_id`
- `dataroom_document_id`
- `dataroom_folder_id`
- `thread_id`
- `message_id`
- `thread_subject`
- `thread_status`
- `sender_type` (`viewer` or `user`)
- `viewer_email`
- `event_datetime`

Notifications should use the existing automation delivery flow, not direct bespoke notification code.

---

## Frontend Requirements

### Single-document viewer

- Show a document-level Q&A panel in the share-link viewer.
- Allow identified viewers to create threads and reply.
- Show open/closed state and message timestamps.
- Disable replies when a thread is closed.

### Dataroom viewer

- Show Q&A entry points for visible folders and documents.
- When opening a document from a dataroom, preserve the dataroom context in the Q&A panel.
- Hide Q&A entry points for items the viewer cannot access.

### Owner/admin views

- Add thread list and detail views from document/share-link/dataroom management surfaces.
- Include filters for status, context type, viewer, and recency.
- Provide close/reopen moderation controls.

---

## Acceptance Criteria

- Owners and viewers can exchange contextual Q&A in a single-document share link.
- Owners and viewers can exchange contextual Q&A on visible dataroom documents and folders.
- Access control is enforced by share-link scope and viewer session.
- Dataroom item access respects `ShareLinkDataroomSetting` and invisible ancestor folders.
- Thread history is visible, ordered, and timestamped.
- Thread states support `open`, `closed`, and owner/admin reopen.
- Notifications are emitted through the automation/event pipeline.
- Backend tests cover permissions, lifecycle, and automation events.
- Frontend tests cover thread creation, reply, closed-state UI, and dataroom context handling.

---

## Testing Scope

Backend:

- document-link viewer can create/read/reply to own share-link Q&A
- dataroom-link viewer can create/read/reply only for visible item context
- invisible dataroom document/folder returns 403
- visible child under invisible parent returns 403
- viewer cannot access another share link's thread
- forged or cross-link `view_session_id` is rejected
- owner/admin can close and reopen threads
- viewer cannot reply to closed thread
- automation events are dispatched with expected payload fields
- dataroom-level switch disables Q&A on every link into that room
- link-level switch disables Q&A for that link only
- a link cannot re-enable Q&A that its dataroom turned off
- viewers cannot reply to existing threads once Q&A is disabled
- owners cannot create threads on a disabled link but can still moderate

Frontend:

- Q&A panel appears for single-document share links
- dataroom Q&A actions appear only for visible/current items
- message history renders sender, timestamp, and state
- closed threads disable viewer reply controls
- owner/admin moderation controls call the expected APIs
- all Q&A entry points are hidden when `link_settings.enable_qna` is `false`
- the link-level Q&A switch is disabled when the dataroom has Q&A off
