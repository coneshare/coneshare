# Folder-to-Dataroom Sync Plan (Push MVP)

**Date:** 2026-11-24  
**Status:** Proposed (Streamlined Push MVP)  
**Issue:** [#424](https://github.com/coneshare/coneshare/issues/424)  
**Scope:** `backend/datarooms/`, `backend/documents/`, `frontend/src/components/documents/`, `frontend/src/components/dialogs/`, `frontend/src/pages/`

---

## Motivation & Use Case

When a user adds a folder from `/documents` to one or more Datarooms (`POST /api/v1/datarooms/{id}/add-content/`), `_replicate_folder_structure` currently performs a one-time snapshot copy into `DataroomFolder` and `DataroomDocument` records without retaining a reference to the source `Folder`. Users maintaining canonical folders shared across multiple Datarooms must manually add new files to each Dataroom individually.

To solve this directly without accidental live exposure while users are still staging files in `/documents`, this plan introduces **opt-in Folder-to-Dataroom linking with an explicit Push workflow from `/documents`**:

- **Single source of truth & single action entry:** Users edit files in `/documents` and click **Sync to Datarooms** to push updates to all (or selected) linked Datarooms.
- **Read-only awareness & safe detach in Datarooms:** Each linked `DataroomFolder` displays a subtle `Synced` indicator and sync-root folders can be safely **Unlinked** without touching any files.

### Explicit Non-Goals (Avoided Over-Engineering)

- **No separate Dataroom Pull workflow:** Avoids duplicate Push/Pull APIs, duplicate UI menus, and user confusion over where to trigger sync.
- **No post-hoc arbitrary re-linking (`PATCH` `source_folder`):** Prevents destructive ambiguity around pre-existing files in an unrelated `DataroomFolder`. Sync links are created only when adding folders from `/documents` via `add-content`.
- **No Phase 2 ancestor `updated_at` propagation / `out_of_sync` polling:** Avoids brittle cross-module timestamp coupling across all upload/move/rename/trash/MCP code paths in `backend/documents/`.
- **No automatic background sync (`auto_sync`):** Preserves safe staging in `/documents` so half-finished edits are never exposed automatically. (`/documents` staging and `Push` govern folder-membership reconciliation—adding new files/subfolders or removing entries moved/deleted from the source folder; edits directly on an already-linked `Document` record, such as trashing it, continue to reflect immediately via `document__deleted_at__isnull=True` filtering.)

---

## Architecture & Implementation

### 1. Data Model (`backend/datarooms/models.py`)

- **`DataroomFolder`:**
  - `source_folder = models.ForeignKey('documents.Folder', null=True, blank=True, on_delete=models.SET_NULL, related_name='synced_dataroom_folders')`
  - `is_synced = models.BooleanField(default=False, db_index=True)`
  - `last_synced_at = models.DateTimeField(null=True, blank=True)` *(optional display timestamp only)*
- **`DataroomDocument`:**
  - `is_synced = models.BooleanField(default=False, db_index=True)`  
    Distinguishes documents created/managed by folder sync (`is_synced=True, is_direct_upload=False`) from documents manually added into a Dataroom folder via `add-content` (`is_synced=False, is_direct_upload=False`) or uploaded directly into the Dataroom (`is_direct_upload=True`).
- **Soft-Delete Behavior (`Folder.deleted_at`):**
  - Moving a source `Folder` to Trash sets `deleted_at` rather than deleting the DB row, so `on_delete=models.SET_NULL` only clears `source_folder` when Trash is permanently emptied.
  - Endpoints and serializers therefore treat `source_folder is None or source_folder.deleted_at is not None` as detached/unavailable (`is_synced` remains safe; Push Sync refuses trashed folders).

### 2. Shared Sync Engine (`backend/datarooms/services.py` & `signals.py`)

A single idempotent helper (`reconcile_dataroom_folder_with_source`) powers both initial synced replication in `add-content` and Push sync:

- **Reconcile Tree (Idempotent):**
  - Queries `.active()` (`deleted_at__isnull=True`) documents and subfolders on `source_folder` owned by the requesting user (`created_by`).
  - Matches existing child `DataroomFolder`s by `(dataroom, parent, source_folder, is_synced=True)`.
  - When creating a missing subfolder (`source_folder=subfolder, is_synced=True, last_synced_at=now`), deduplicates its name via `_get_unique_dataroom_folder_name` so it never collides with an existing local folder, and appends a `DataroomItemOrder` row when custom scope ordering exists.
  - Matches existing `DataroomDocument`s by `(dataroom, folder, document)` and creates missing entries (`is_direct_upload=False, is_synced=True`) with unique names (`_get_unique_dataroom_document_name`) and `DataroomItemOrder` rows.
  - Updates `last_synced_at` on reconciled `DataroomFolder`s.
- **Safe Pruning & Local File Preservation:**
  - Removes stale synced `DataroomDocument` records (`is_synced=True, is_direct_upload=False`) whose `document` was deleted or moved out of `source_folder`.
  - **Never deletes** files uploaded directly into the Dataroom (`is_direct_upload=True`) or documents added manually outside folder sync (`is_synced=False`).
  - Removes stale synced child `DataroomFolder`s (`is_synced=True`) only if they contain no local/manual items (`is_direct_upload=True` or `is_synced=False`); otherwise detaches/keeps the subfolder (`is_synced=False, source_folder=None`) so local Dataroom content is never lost.
- **Guardrails:**
  - Acquires `select_for_update()` on target `Dataroom`(s) in deterministic ID order (`order_by('id')`).
  - Enforces `dataroom.storage_quota_mb` mirroring `add_content` and `get_dataroom_storage_used_bytes` (counting unique `document_id`s across the Dataroom), computing the net storage delta accounting for stale synced documents removed during the same reconciliation (or pruning before adding) so replacing a file does not falsely trip the quota.
  - In `backend/datarooms/signals.py`: `ShareLinkDataroomSetting` stores three concrete non-nullable booleans (`is_visible`, `allow_download`, `enable_watermark`). When creating `ShareLinkDataroomSetting` for a newly created `DataroomFolder` or `DataroomDocument` inside a parent `DataroomFolder`, copy all three booleans from the parent `DataroomFolder`'s `ShareLinkDataroomSetting` row for that `ShareLink` when present, falling back to `(True, link.allow_download, link.enable_watermark)` at the dataroom root or when no parent row exists.

### 3. Backend API Endpoints (`backend/datarooms/` & `backend/documents/`)

*(Note: Keep cross-app imports from `datarooms` inside functions/methods in `backend/documents/`, matching `backend/documents/services.py`, to avoid circular imports.)*

1. **Create Sync Link on Add Content (`POST /api/v1/datarooms/{id}/add-content/`):**
   - Accept optional `sync_folders` boolean (default `False`).
   - When `sync_folders=True`, replicated `DataroomFolder`s store `source_folder`, `is_synced=True`, `last_synced_at`, and their replicated `DataroomDocument`s store `is_synced=True`.
2. **Expose Linked References on Source Folders (`FolderSerializer` in `backend/documents/`):**
   - Expose `synced_datarooms`:  
     `[{ dataroom_id, dataroom_name, dataroom_folder_id, dataroom_folder_path, last_synced_at }]`
   - **No N+1 / Context-Gated:** `DocumentSerializer` embeds `folder = FolderSerializer(read_only=True)` on every serialized document. Only compute/populate `synced_datarooms` when explicitly enabled via serializer context (`synced_datarooms_map` precomputed by folder list/detail views); return `[]` otherwise so `DocumentViewSet` and upload responses run zero extra queries.
   - **Access Filtering & Batch Path Resolution:** `Dataroom` is hard-deleted (no soft-delete/inactive flag), so scope `DataroomFolder` lookups strictly with `dataroom__in=get_dataroom_queryset_for_user(request.user)` and `is_synced=True`. Resolve `dataroom_folder_path` in batch from a single query of `(id, name, parent_id, dataroom_id)` across referenced Datarooms instead of calling `DataroomFolder.get_full_path()` per folder.
3. **Expose Sync Metadata on Dataroom Folders (`DataroomFolderSerializer` in `backend/datarooms/`):**
   - Expose `is_synced`, `source_folder`, `source_folder_name` (retained when trashed so tooltips can name the folder alongside `source_folder_deleted: true`), `source_folder_deleted` (boolean), `is_sync_root` (boolean: `is_synced and (parent is None or not parent.is_synced)`), and `last_synced_at`.
   - Enforce single-tree sync isolation: forbid adding or moving independent synced folders inside an already-synced folder tree, and forbid moving non-root synced subfolders outside their synced parent.
   - Add `select_related('source_folder', 'parent')` on Dataroom folder listing, search, and `DataroomFolderViewSet` querysets.
4. **Push Sync (`POST /api/v1/folders/{id}/sync-datarooms/`):**
   - Validates `folder.created_by == request.user` and `folder.deleted_at is None` (reject trashed source folders).
   - Accepts optional `dataroom_folder_ids` list to push to selected linked Datarooms, or pushes to all linked `DataroomFolder`s matching `source_folder=folder`, `is_synced=True`, and `dataroom__in=get_dataroom_queryset_for_user(request.user)` (supporting Dataroom owners, active collaborators, and org admins while excluding removed collaborators).
   - Returns a per-Dataroom summary (`added`, `removed`, `skipped` / quota error if any).
5. **Safe Sync-Root Detach (`POST /api/v1/dataroom-folders/{id}/unlink/`):**
   - Validates Dataroom access via `get_dataroom_queryset_for_user(request.user)`.
   - Only allowed on **sync roots** (`is_synced=True` and `parent` is `None` or `not parent.is_synced`); returns `400 Bad Request` for synced child subfolders to prevent duplicate re-creation on the next parent Push.
   - Recursively detaches the entire synced descendant subtree (`is_synced=False`, `source_folder=None` on the root and all synced descendant `DataroomFolder`s; `is_synced=False` on all synced `DataroomDocument`s in that subtree) without deleting any files.

### 4. Frontend Workflows

*(Include all 6 locale catalogs in `frontend/src/locales/{de,en,fr,nl,ru,zh-hans}/translation.json` with no inline `defaultValue`, and add new test files to `frontend/vitest.whitelist.json`.)*

1. **Opt-in Checkbox (`frontend/src/components/dialogs/AddContentDialog.jsx`):**
   - When folders are selected, show a *"Keep folder synced with Documents"* checkbox (`sync_folders`).
2. **Source Folder Visibility & Push (`DraggableItem.jsx`, `ActionsDropdown.jsx`, Sync Dialog in `/documents`):**
   - **Compact Badge:** When `item.synced_datarooms?.length > 0`, show a compact badge (`🔄 N`) next to the folder name. Unlinked folders show nothing.
   - **Hover Tooltip:** Lists the referencing Datarooms and folder paths (e.g., `Series A Due Diligence · /Legal`).
   - **Action Menu (`⋮`) & Sync Dialog:** When `synced_datarooms.length > 0`, show **"Sync to Datarooms"** (`RefreshCw` icon). Opening it shows the referencing Datarooms + folder paths (with last synced time) and lets the user push to all or selected Datarooms.
3. **Dataroom Folder Indicator & Unlink (`DataroomPage.jsx`):**
   - Show a subtle read-only `Synced` badge on linked `DataroomFolder` rows (tooltip shows source `/documents` folder name, or warns when source folder is in Trash).
   - Provide **"Unlink from Documents"** in the `⋮` action menu on sync-root folders (`is_sync_root=true`) to detach the synced subtree safely (no Pull action, no re-link dialog).
