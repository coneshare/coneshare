# Folder-to-Dataroom Sync Phase 2: UX Safeguards & Diff Preview Plan

**Date:** 2026-11-27  
**Status:** Feature 1 Implemented (Case A only); Feature 2 Paused / Deferred  
**Follow-up to:** [folder_dataroom_sync_plan.md](./folder_dataroom_sync_plan.md) (`#424` / PR `#513` / PR `#515`)  
**Scope:** `frontend/src/pages/DocumentsPage.jsx`, `frontend/src/locales/*/translation.json` (Feature 1); `backend/datarooms/`, `backend/documents/`, `SyncFolderToDataroomsDialog.jsx` (Feature 2 deferred)

---

## Motivation & Simplification Principles

In Phase 1 (Push MVP), syncing a personal folder to Datarooms is strictly manual (`POST /api/v1/folders/{id}/sync-datarooms/`), so saving an internal file inside `/documents` does not automatically expose it to external Datarooms.

Two potential UX enhancements were evaluated in Phase 2:
1. **Synced Workspace Awareness Banner (`2.1`):** Remind users inside a synced folder that the folder is linked to external Datarooms and new/updated files stay local until pushed.
2. **Push Sync Diff Preview (`1`):** Preview exact file additions/removals inside `SyncFolderToDataroomsDialog.jsx` before confirming a Push Sync.

Explicit scope decisions:
- **Feature 1 implemented with Case A only (zero backend changes):** Show the contextual banner whenever the open `currentFolder` itself has `synced_datarooms` (which already covers both sync-root folders and already-pushed subfolders). Newly created, unpushed child subfolders (`synced_datarooms: []`) are intentionally not queried separately (`Case B` deferred) because they cannot expose anything externally until the parent is synced.
- **Feature 2 paused / deferred:** Not needed for now; remains documented below for future pickup if requested.

---

## Feature 1: Synced Workspace Awareness Banner (`2.1`) — Implemented

### Design
- **Backend:** Zero changes required (`FolderViewSet.retrieve` already exposes `current_folder.synced_datarooms`).
- **Frontend ([`frontend/src/pages/DocumentsPage.jsx`](../../frontend/src/pages/DocumentsPage.jsx)):**
  - Compute `directSyncedDataroomCount` from distinct `dataroom_id` entries in `currentFolder?.synced_datarooms`.
  - When `currentFolder` is open and `directSyncedDataroomCount > 0`, render a compact informational banner above `DocumentsList` stating this folder is synced with **N Dataroom(s)** and changes stay local until clicking Sync, with a **Sync Now** button (`setSyncTarget(currentFolder)`).
  - Update `folderToSync` lookup in `DocumentsPage.jsx` to check both `folders` and `currentFolder` so opening the dialog from `currentFolder`'s banner refreshes `last_synced_at` cleanly on partial sync.
  - Added `documents.syncedBannerDirect_*` across all 6 locale catalogs (`de`, `en`, `fr`, `nl`, `ru`, `zh-hans`) with no inline `defaultValue`.

---

## Feature 2: Push Sync Diff Preview (`1`) — Paused / Deferred

### Problem
Users may want to verify exact file additions and removals (and whether target Datarooms have live external share links) *before* clicking **Sync**, without complicated state synchronization or blocking manual sync on preview issues.

### Planned Design (When Resumed)
- **Backend (`backend/datarooms/services.py` & `backend/documents/views.py`):**
  - Read-only, batch-loaded dry-run service `preview_source_folder_sync_to_datarooms(source_folder, user)` without quota simulation or DB mutations:
    - `dataroom_folder_id`, `dataroom_id`, `dataroom_name`
    - `active_share_links_count` (`is_active=True` and `(expires_at__isnull=True | expires_at__gt=now)`)
    - `added_documents` / `removed_documents` relative paths (capped at 50 entries per target + exact totals + `truncated: bool`)
    - `added_folders_count` / `removed_folders_count`
  - Endpoint `GET /api/v1/folders/{id}/sync-datarooms-preview/` mirroring `sync_datarooms` folder validation (`FOLDER_TYPE_PERSONAL`, `name != '__root__'`), documented with `@extend_schema`.
- **Frontend (`frontend/src/services/api.js` & `SyncFolderToDataroomsDialog.jsx`):**
  - Add `getFolderSyncPreview(folderId)` and fetch once on open (`isOpen && folderId`), guarded by `activeSessionIdRef` + `AbortController` and refreshed on partial failure.
  - Keep **Sync** clickable whenever `selectedIds.length > 0 && !isSyncing` (never block on preview failures or `0`-change targets).
  - Render per-target pills (`+N`, `-M`, `K active links`, `Up to date`) and collapsible `+ / -` relative path lists with `"and N more"` overflow note.

---

## Testing & Verification Checklist

1. **Feature 1 (`vitest` + `eslint`):**
   - `DocumentsPage.test.jsx`: Case A banner renders for synced `currentFolder`, opens `SyncFolderToDataroomsDialog` and refreshes `currentFolder` on partial sync; hidden at root and normal folders.
   - `i18n.test.jsx`: `documents.syncedBannerDirect` verified across all 6 locales.
2. **Feature 2 (Deferred until resumed):**
   - Backend `pytest` coverage for `sync-datarooms-preview`, frontend `SyncFolderToDataroomsDialog.test.jsx` coverage, and [`docs/features/folder-dataroom-sync.md`](../../docs/features/folder-dataroom-sync.md) updates.

---

## Future Follow-ups (Separate Scope)

- **Case B Banner (`source-sync-status`):** Async lookup on unpushed child folders if deep-navigation reminders are later desired.
- **Dry-run Quota Pre-Check:** Can be layered on later alongside Feature 2, computing projected post-prune byte deltas across same-room deduplicated `DataroomDocument`s.
- **Staged Visibility (`is_visible=False` on Sync + Bulk Publish):** Optionally initialize newly synced items with `ShareLinkDataroomSetting.is_visible=False` across active links until explicitly published inside the Dataroom.
- **Dataroom Internal Move Permission Tightening:** Tracked separately to apply fail-closed `ShareLinkDataroomSetting` intersection (`allow_download`, `enable_watermark`, `is_visible`) on `move-content` and `PATCH /dataroom-folders/{id}/`.
