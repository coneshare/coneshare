# 🚀 Dataroom Collaboration Notifications - Phase 2 Design Plan

## 1. 📌 Overview & Context

Phase 1 established backend recipient routing and automation cross-matching:
- Link creators receive link activity alerts by default.
- If a collaborator is deactivated or removed from a Dataroom, notifications automatically fall back to the Dataroom owner.
- Dataroom owners can subscribe to room-wide events via `DATAROOM`-scoped `AutomationRule` records.

**Phase 2** builds user-facing notification controls, room-level subscription settings, deal-lead digests, and link-level co-notifications to provide complete collaboration visibility without inbox fatigue.

---

## 2. 🎯 Key Feature Areas

### A. Dataroom In-Room Notification Settings (UI)
* **Problem:** Users currently have to navigate to `/automations` to configure room-level alerts. Most business users expect notification toggles directly within the Dataroom.
* **Target UI:** Add a **Notifications** tab or section in `DataroomSettingsModal`:
  * **My Notification Level:**
    * 🔘 **All Activity:** Instant alerts for views, downloads, and Q&A on any link in this room.
    * 🔘 **Actionable Only (Default for Collaborators):** Only inbound Q&A questions and access requests.
    * 🔘 **Daily Digest (Recommended for Deal Leads):** A single daily rollup of room activity.
    * 🔘 **Mute:** No automated emails for this room.
* **Backend Architecture:**
  * Endpoint: `GET / PATCH /api/v1/datarooms/{id}/notification-preference/`
  * Backed by `DataroomCollaborator.notification_level` for collaborators and a new `DataroomOwnerPreference` or automated `AutomationRule` generation.

---

### B. Link Creation Sheet: "Also Notify Room Owner"
* **Problem:** Collaborator A sending a high-priority link to an anchor investor wants room owner B to get the instant ping as well, without needing owner B to pre-configure an automation rule.
* **Target UI (`LinkSheet.jsx`):**
  * Below `[x] Receive email notifications`, conditionally display when `dataroom` is present and creator is not the owner:
    * `[x] Also notify dataroom owner (<owner_email>)`
* **Backend Schema:**
  * Add `notify_dataroom_owner = models.BooleanField(default=False)` to `ShareLink`.
  * `resolve_notification_recipients(share_link)` returns a list `[creator, owner]` when true.

---

### C. Dataroom Daily / Weekly Activity Digest
* **Problem:** Active deal rooms generate dozens of visitor sessions per day. Real-time emails cause notification fatigue, leading owners to disable alerts entirely.
* **Architecture:**
  * Celery Beat scheduled task: `send_dataroom_activity_digest_task` (runs daily at midnight or 08:00 user timezone).
  * Queries `DataroomVisit` and `ViewSession` from the past 24 hours grouped by dataroom.
  * Rollup metrics:
    * Total new visitors and companies identified.
    * Top viewed documents and high-interest folders.
    * Unanswered Q&A threads requiring attention.
  * Template: `sharelinks/dataroom_daily_digest_email.html`.

---

### D. Inbound Q&A Assignment & Teammate Mentioning
* **Problem:** When an external investor asks a technical or financial question in a dataroom, the link creator may not be the subject-matter expert.
* **Capabilities:**
  * Assign thread to a specific collaborator: `QnAThread.assigned_to = ForeignKey(User)`.
  * Instant email alert to the assigned teammate with direct jump link to the thread.
  * Email notification when a teammate is `@mentioned` in an internal note or reply.

---

## 3. 🛠️ Implementation Steps

1. **Database Migrations:**
   * Add `notify_dataroom_owner` boolean to `ShareLink`.
   * Add `notification_level` choices (`all`, `actionable`, `digest`, `off`) to `DataroomCollaborator`.
   * Add `assigned_to` to `QnAThread`.

2. **Backend API & Tasks:**
   * Extend `resolve_notification_recipient` to return all applicable recipients (`resolve_notification_recipients`).
   * Implement Celery beat task `send_dataroom_activity_digest_task`.
   * Add preference endpoint in `datarooms/views.py`.

3. **Frontend Changes:**
   * Update `LinkSheet.jsx` to render the "Also notify room owner" checkbox for room links.
   * Add Notifications section in `DataroomSettingsModal.jsx`.
   * Add Q&A assignment dropdown in `QnAPanel.jsx`.

4. **Testing:**
   * Unit tests for digest aggregation and time window bounding.
   * Tests for multi-recipient dispatch on `notify_dataroom_owner=True`.
   * End-to-end BDD tests for room notification preference updates.
