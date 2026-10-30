# Folder–Dataroom Bi-Directional Sync Plan (Phase 1 & Phase 2)

**Date:** 2026-10-30  
**Status:** Proposed (Phase 1 & Phase 2)  
**Scope:** `backend/datarooms/`, `backend/documents/`, `frontend/src/components/documents/`, `frontend/src/components/dialogs/`, `frontend/src/pages/`

---

## Motivation & Use Case

When a user adds a folder from `/documents` to one or more Datarooms (`POST /api/v1/datarooms/{id}/add-content/`), `_replicate_folder_structure` currently performs a one-time snapshot copy into `DataroomFolder` and `DataroomDocument` records without retaining a reference to the source `Folder`. Users maintaining canonical folders shared across multiple Datarooms must manually add new files to each Dataroom individually.

To prevent accidental live exposure while users are still staging files in `/documents` (matching DocSend's safety model) while eliminating repetitive multi-room updates, this plan introduces **explicit Folder–Dataroom linking with manual Push/Pull synchronization** in **Phase 1**, followed by **stateful out-of-sync detection and contextual UX** in **Phase 2**.

---

## Phase 1: Model Changes & Bi-Directional Sync Workflows (Push & Pull)

### 1. Data Model (`DataroomFolder` in `backend/datarooms/models.py`)
- Add `source_folder = models.ForeignKey('documents.Folder', null=True, blank=True, on_delete=models.SET_NULL, related_name='synced_dataroom_folders')`
- Add `is_synced = models.BooleanField(default=False, db_index=True)`

### 2. Shared Sync Engine (`backend/datarooms/services.py`)
A single reconciliation function (`reconcile_dataroom_folder_with_source`) powers both **Push** and **Pull**:
- **Reconcile Tree (Idempotent):**
  - Uses `.active()` (`deleted_at__isnull=True`) queries on `source_folder.documents` and `source_folder.children` so trashed items are never synced.
  - Matches existing child `DataroomFolder`s by `(dataroom, parent, source_folder)` and creates missing subfolders (`source_folder=subfolder, is_synced=True`).
  - Matches existing `DataroomDocument`s by `(dataroom, folder, document)` and creates missing entries (`is_direct_upload=False`), appending `DataroomItemOrder` rows when custom scope ordering exists.
  - Removes `DataroomDocument` entries where `is_direct_upload=False` if the document was deleted or moved out of `source_folder`.
- **Preserve Room Files:** Never touches files uploaded directly into the Dataroom (`is_direct_upload=True`).
- **Guardrails:**
  - Acquires `select_for_update()` on target `Dataroom`(s) in deterministic ID order (`order_by('id')`) and enforces `dataroom.storage_quota_mb`.
  - In `backend/datarooms/signals.py`, inherits `ShareLinkDataroomSetting` visibility (`is_visible`, `allow_download`, `enable_watermark`) from the parent `DataroomFolder` on each ShareLink so hidden folders stay hidden.

### 3. Two Sync Workflows (Backend + Frontend)

#### Workflow 1: Folder Side — Push Changes to Datarooms (`/documents`)
- **Backend:**
  - Expose `synced_datarooms` (`[{ dataroom_id, dataroom_name, dataroom_folder_id }]`) on `FolderSerializer` (prefetched via `Prefetch('synced_dataroom_folders', queryset=DataroomFolder.objects.filter(is_synced=True).select_related('dataroom'))` to avoid N+1 queries).
  - Add `POST /api/v1/folders/{id}/sync-datarooms/` (accepts optional `dataroom_folder_ids` to push to selected or all linked Datarooms).
- **Frontend (`DraggableItem.jsx`, `ActionsDropdown.jsx`):**
  - **Compact Badge:** Show a badge (`🔄 N`) next to the folder name when `item.synced_datarooms?.length > 0`.
  - **Hover Tooltip:** Lists the linked Dataroom names (*"Synced with Datarooms: • Series A Due Diligence ..."*).
  - **Action Menu (`⋮`):** Add **"Sync to Datarooms"** (`RefreshCw` icon) to push changes to some or all linked Datarooms.

#### Workflow 2: DataroomFolder Side — Link / Unlink & Pull Changes (`/datarooms/:id`)
- **Backend:**
  - On `POST /api/v1/datarooms/{id}/add-content/`, accept `sync_folders` (boolean) and populate `source_folder` and `is_synced=True` when enabled.
  - Support linking/unlinking via `PATCH /api/v1/dataroom-folders/{id}/` (`source_folder`, `is_synced`, validating that `source_folder` is an active personal folder owned by `request.user`) and pulling via `POST /api/v1/dataroom-folders/{id}/pull-sync/`.
- **Frontend (`AddContentDialog.jsx`, `DataroomPage.jsx`):**
  - Add a *"Keep folder synced with Documents"* checkbox in `AddContentDialog.jsx` when folders are selected.
  - Show a `Synced` badge on linked `DataroomFolder` rows (with tooltip showing the source `/documents` folder name).
  - Add `⋮` menu actions on `DataroomFolder` to **Pull from Documents** and **Link / Unlink Folder**.

---

## Phase 2: Sync Status Tracking & Smart UX

### 1. Data Model & Timestamp Propagation
- **Model (`DataroomFolder`):** Add `last_synced_at = models.DateTimeField(null=True, blank=True)` (updated on initial `add-content` and whenever Push or Pull runs).
- **Source Folder Touching (`backend/documents/`):** Whenever a document or subfolder is added, moved, renamed, or deleted inside a `/documents` `Folder`, touch `folder.updated_at` (and its ancestor folders' `updated_at`).

### 2. $O(1)$ Sync Status Evaluation
Compute `sync_status` on `DataroomFolderSerializer` and `FolderSerializer` by comparing `last_synced_at` vs. `source_folder.updated_at`:
- **`synced`**: `last_synced_at >= source_folder.updated_at` (Up to date)
- **`out_of_sync`**: `source_folder.updated_at > last_synced_at` (Source folder has newer changes)
- **`source_deleted`**: `source_folder.deleted_at is not None` (Source folder moved to Trash)

### 3. Stateful Badges & Contextual Banner (Frontend)
1. **Dynamic Status Badge on `DataroomFolder` (`/datarooms/:id`):**
   - `synced` → Subtle emerald/neutral badge (`✓ Synced`)
   - `out_of_sync` → Highlighted amber/blue badge (`🔄 Updates available` — clicking it immediately pulls changes)
   - `source_deleted` → Muted warning badge (`⚠️ Source in Trash` — clicking it prompts to unlink)
2. **Dynamic Status Badge on `Folder` (`/documents`):**
   - Highlights when any linked Dataroom has `last_synced_at < folder.updated_at` (`🔄 2 need sync` — clicking opens the Push modal).
3. **In-Folder Contextual Sync Banner (`/documents/folders/:folderId`):**
   - When the user is inside a linked `/documents` folder and drops new files into it, show a slim banner at the top of the list:
     > 🔄 **Linked to N Datarooms** — **[Push changes now]**
4. **Optional Auto-Sync Mode (Future Opt-in):**
   - Optional per-folder toggle to auto-propagate changes in the background via Celery when `auto_sync=True`.
