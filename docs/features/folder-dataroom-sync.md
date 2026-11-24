# Folder-to-Dataroom Push Sync

## Strategy refs
- [Dataroom Implementation](./dataroom-implementation.md)
- [Folder-to-Dataroom Sync Plan](../../plans/todo/folder_dataroom_sync_plan.md)
- Issue [#424](https://github.com/coneshare/coneshare/issues/424) / PR [#508](https://github.com/coneshare/coneshare/pull/508)

## Out of scope
- **Dataroom-side Pull workflow (`pull-sync`)**: Sync triggers exclusively from `/documents` to avoid duplicate APIs/UI and user confusion over which side owns the operation.
- **Post-hoc arbitrary re-linking (`PATCH` `source_folder`)**: Existing non-synced `DataroomFolder`s cannot be attached to an arbitrary `/documents` folder after creation. Sync links are established only during `add-content` when `sync_folders=True`.
- **Automatic background sync (`auto_sync`) & `out_of_sync` dirty tracking**: No ancestor `updated_at` cascade or dirty-badge polling is maintained in `backend/documents/`, preserving safe staging while files are organized in `/documents`.
- **Syncing custom renames**: Renaming a source `Folder` or `Document` in `/documents` never overwrites custom display names (`DataroomFolder.name` / `DataroomDocument.name`) inside Datarooms.

## Design decisions
- Decision: Implement explicit one-way **Push Sync** from `/documents` (`POST /api/v1/folders/{id}/sync-datarooms/`) rather than bi-directional sync or a Pull action in `/datarooms/:id`.
  Rationale: Directly addresses the canonical workflow (edit once in `/documents`, propagate to N Datarooms) while preventing half-finished uploads from leaking automatically to external viewers.
  Tradeoff: Users must click **Sync to Datarooms** to publish newly added or reorganized items.
- Decision: Enforce **single-tree sync isolation** and **Sync-Root-only Unlink**.
  Rationale: Disallowing nested synced roots (`add-content` with `sync_folders=True` inside a synced folder, moving a synced folder into another synced tree, or splitting a synced subfolder out of its synced parent) guarantees that every `is_synced=True` child folder belongs strictly to its sync root and cannot be accidentally pruned by a parent push or re-duplicated after a partial unlink.
  Tradeoff: Users cannot independently link a second synced folder inside an already-synced folder subtree; they can still place direct uploads or manual non-synced content there.
- Decision: Add a dedicated `DataroomDocument.is_synced` boolean alongside `is_direct_upload`.
  Rationale: Manually added documents from `/documents` (`add-content` with `document_ids`) also store `is_direct_upload=False`. Checking `is_synced=True, is_direct_upload=False` ensures Push Sync never prunes files that were manually placed inside a synced folder.
  Tradeoff: Requires a lightweight indexed boolean column on `DataroomDocument`.
- Decision: Keep Dataroom `Document` links live via `document__deleted_at__isnull=True` while making folder membership snapshot-reconciled via Push.
  Rationale: Matches Coneshare's single-instance document model so trashing or replacing a document version immediately takes effect everywhere it is referenced, whereas adding/removing items from folders waits for explicit Push confirmation.
  Tradeoff: Soft-deleting a `Document` in `/documents` hides it in linked Datarooms immediately even before Push; Push formally cleans up the stale `DataroomDocument` row.
- Decision: Gate `FolderSerializer.synced_datarooms` behind serializer context (`synced_datarooms_map`) and resolve nested Dataroom paths via a single batch query.
  Rationale: `DocumentSerializer` embeds `folder = FolderSerializer(read_only=True)` on every serialized document. Unconditional lookup or per-folder `get_full_path()` calls would trigger N+1 queries across document listings and nested Dataroom trees.
  Tradeoff: `FolderViewSet` actions (`list`, `retrieve`, `search`, `update`/`partial_update`) must pass `_get_synced_datarooms_context(...)`; un-prefetched callers receive `[]`.
- Decision: Inherit all three concrete booleans `(is_visible, allow_download, enable_watermark)` from parent `DataroomFolder`'s `ShareLinkDataroomSetting` in `backend/datarooms/signals.py`.
  Rationale: `ShareLinkDataroomSetting` stores non-nullable booleans (no tri-state overrides). Copying all three prevents newly pushed files/subfolders inside a hidden Dataroom folder (`is_visible=False`) from accidentally leaking to viewers.
  Tradeoff: Newly pushed items inherit the parent folder's share-link visibility/download/watermark configuration uniformly instead of falling back to link-level defaults.
- Decision: Reconcile all selected targets within a Dataroom in three transaction phases (`prune all -> check room quota once -> populate all`) under `Dataroom.objects.select_for_update()`.
  Rationale: When the same source folder is linked multiple times inside one capped Dataroom, pruning every target before evaluating `storage_quota_mb` prevents false quota rejections during file swaps, and transactional savepoints roll back pruning if additions truly exceed the cap.
  Tradeoff: Syncing a room holds a row lock on that `Dataroom` for the duration of the reconciliation.
- Decision: Apply `DataroomItemOrder` unconditionally whenever custom order rows exist in the target scope, ignoring `dataroom.show_file_index`.
  Rationale: Aligns with repository architecture policy (2026-08-16): hiding index numbers must not drop or corrupt custom item ordering.
  Tradeoff: None (consistent with `move_content` and serializer behavior).

---

## 1. Data Model & API Contracts

### Model Fields (`backend/datarooms/models.py`, migration `0008`)
- `DataroomFolder`:
  - `source_folder`: Nullable FK to `documents.Folder` (`on_delete=models.SET_NULL`, `related_name='synced_dataroom_folders'`).
  - `is_synced`: Indexed boolean (`default=False`).
  - `last_synced_at`: Nullable `DateTimeField` updated on initial `sync_folders=True` replication and on each committed Push Sync; cleared to `None` on `Unlink`.
- `DataroomDocument`:
  - `is_synced`: Indexed boolean (`default=False`). Set to `True` only for documents added via `sync_folders=True` replication or Push Sync.

### Endpoints & Serializers
1. **Opt-in Creation**: `POST /api/v1/datarooms/{id}/add-content/` (`AddContentSerializer` accepts `sync_folders`, defaulting to `False`).
2. **Source Folder References**: `FolderSerializer.synced_datarooms` returns `[{ dataroom_id, dataroom_name, dataroom_folder_id, dataroom_folder_path, last_synced_at }]` scoped by `get_dataroom_queryset_for_user(user)`. Populated by `FolderViewSet` (`list`, `retrieve`, `search`, `update`/`partial_update`) via `get_synced_datarooms_map_for_folders`.
3. **Dataroom Folder Metadata**: `DataroomFolderSerializer` exposes read-only `is_synced`, `source_folder`, `source_folder_name`, `source_folder_deleted`, `is_sync_root`, and `last_synced_at`. Dataroom querysets include `select_related('parent', 'source_folder')`.
4. **Push Sync**: `POST /api/v1/folders/{id}/sync-datarooms/` accepts optional `dataroom_folder_ids` (`None` syncs all accessible linked targets; explicit empty/invalid list returns `400`). Returns `{ synced_count, failed_count, results }` (`400` when all targeted rooms fail, `200` on full or partial success).
5. **Unlink**: `POST /api/v1/dataroom-folders/{id}/unlink/` detaches a sync-root `DataroomFolder` and its entire synced descendant subtree (`is_synced=False`, `source_folder=None`, `last_synced_at=None`, and `DataroomDocument.is_synced=False`), refreshing `updated_at` without deleting any files.

---

## 2. Behavior Matrix

| Action in `/documents` | Before Push Sync (Dataroom State) | After Push Sync (`POST /sync-datarooms/`) |
| :--- | :--- | :--- |
| Add document / create subfolder / move item into source | Not visible in Dataroom (staged safely) | Added as synced item(s); inherits parent folder `ShareLinkDataroomSetting` |
| Soft-delete a document (`deleted_at` set) | Immediately hidden (`document__deleted_at__isnull=True`) | Stale `DataroomDocument` row deleted (`is_synced=True, is_direct_upload=False`) |
| Soft-delete a subfolder | Child docs hidden immediately; empty subfolder shell remains | Synced subfolder deleted if empty; if local/manual files exist inside, shell is kept and detached (`is_synced=False`) |
| Move document or subfolder out of source | Still present in Dataroom | Synced entry pruned from old synced folder (or detached if local files exist in subfolder) |
| Move subfolder between subfolders within the same source tree | Unchanged | Pruned from old Dataroom parent (or detached if local files exist) and created under new Dataroom parent |
| Rename source folder or move source root within `/documents` | Sync link preserved (`Folder.id` unchanged); Dataroom folder name/location unchanged; Tooltip `source_folder_name` reflects new name | Same; Dataroom custom folder names remain untouched |
| Upload new document version | Reflected immediately via shared `Document` FK | Same |
| Move source root folder to Trash | Folder stays in Dataroom; badge shows `Source in Trash` (`source_folder_deleted=True`) | Endpoint returns `404` for trashed source folders; restoring from Trash restores sync capability |
| Empty Trash permanently (`Folder` deleted from DB) | `on_delete=SET_NULL` clears `source_folder`; badge falls back to unavailable source tooltip; still unlinkable | No longer linked |

---

## 3. Corner Cases & Safeguards

1. **Collaborator Access & Lock-Time Revocation**
   - `get_dataroom_queryset_for_user(user)` governs both `synced_datarooms` visibility and `sync-datarooms` / `unlink` authorization (supporting owners, active collaborators, and org admins while immediately hiding rooms from removed collaborators).
   - `remove_collaborator` locks the `Dataroom` row (`select_for_update()`), and `sync_source_folder_to_datarooms` re-checks `is_dataroom_collaborator_or_above(user, locked_dataroom)` after acquiring the room lock to close concurrent write races.

2. **Per-Room Transaction Isolation & Accurate Rollback Counts**
   - `sync_source_folder_to_datarooms` processes Datarooms sorted by `dataroom_id` to prevent lock-order deadlocks.
   - Results for a room are buffered in a local `room_results` list inside `with transaction.atomic():` and merged into `synced_count` / `results` only **after** the transaction commits. If `QuotaExceededError` triggers on any target in that room, all pruning in the room rolls back cleanly and every target in that room is reported as `status: 'error'`.

3. **Preserving Direct Uploads & Manually Linked Items During Pruning**
   - Pruning only targets `DataroomDocument` rows matching `is_synced=True, is_direct_upload=False`.
   - When removing a stale synced subfolder (`_prune_stale_synced_subtree`), synced documents are deleted first; if any `DataroomDocument` or child `DataroomFolder` still remains (from direct uploads or manual additions), the folder is kept and detached (`is_synced=False, source_folder=None`) instead of deleted.
   - Exact deleted document counts are read from `deleted_counts.get(DataroomDocument._meta.label, 0)` so cascaded `ShareLinkDataroomSetting` or `DataroomItemOrder` rows never inflate `removed_documents`.

4. **Name Collisions & 255-Char Database Field Limit**
   - Replicated folders (`sync_folders=True`), pushed subfolders, and synced documents use `get_unique_name` (`backend/backend/utils.py`) with `max_length=255`.
   - When appending ` (2)` to a 255-character name would overflow `VARCHAR(255)`, `get_unique_name` truncates `base` cleanly while preserving short file extensions (`<= 32` chars) and deduplication suffixes, and falls back to truncating the raw name when an early `.` produces a fake over-long suffix.

5. **Nested Synced Trees, Wrapper Folders & Moving Synced Documents**
   - Adding a synced folder inside an already-synced folder (`add-content`), moving any folder containing a synced folder/descendant into another synced tree (`move-content` / `DataroomFolderViewSet` `PATCH`), or moving a synced child subfolder out of its synced parent are rejected with `400 Bad Request`.
   - Moving a synced `DataroomDocument` to a different Dataroom folder via `move-content` detaches it (`is_synced=False`) so destination Push Syncs do not prune it as stale (while the original synced source folder re-adds its copy on the next Push).
   - `POST /api/v1/dataroom-folders/{id}/unlink/` rejects already-unlinked folders and non-root synced child folders (`parent.is_synced=True`) and traverses only `is_synced=True` descendants.

6. **Frontend Sync Dialog State & Error Aggregation**
   - `AddContentDialog` hides the `sync_folders` opt-in checkbox unless at least one folder is selected, and omits `sync_folders` when unchecked so non-sync payloads remain unchanged.
   - `DocumentsPage` stores `folderIdToSync` (rather than an object snapshot) and derives `folderToSync` from live `folders` state; `SyncFolderToDataroomsDialog` keys its reset effect on `[isOpen, folderId]` via `folderRef`, so partial-sync refreshes update `last_synced_at` in place without clearing inline error alerts.
   - Both `200` partial failures and `400` all-room failures parse `results` through `formatFailedResults` so users see localized per-Dataroom failure reasons.
