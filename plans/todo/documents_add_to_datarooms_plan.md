# Add Folders & Documents to Datarooms from Documents Workspace Plan

**Date:** 2026-11-27  
**Status:** Proposed  
**Issue:** [#516](https://github.com/coneshare/coneshare/issues/516)  
**Scope:** `backend/datarooms/`, `frontend/src/services/api.js`, `frontend/src/pages/`, `frontend/src/components/documents/`, `frontend/src/components/dialogs/`, `frontend/src/locales/`, `frontend/src/tests/`

---

## Motivation & Use Case

Currently, adding library content into a Dataroom only works in reverse: users must leave `/documents`, open a specific Dataroom (`DataroomPage`), click **Add Content** (`AddContentDialog`), and re-navigate to the desired folders/documents. When distributing a prepared folder or set of documents across multiple client Datarooms, the user has to repeat that workflow once per Dataroom.

On `DocumentsPage`, `ActionsDropdown` only exposes **Sync to Datarooms** for folders that already have active sync targets (`synced_datarooms.length > 0`). Unlinked folders and standalone documents have no direct action to push/add them to Datarooms, and `SelectionActionBar` only supports **Move** and **Delete**.

This plan introduces a direct **"Add to Datarooms"** workflow on `DocumentsPage` for both **folders** and **documents** into **one or more existing Datarooms**, reusing the existing `POST /api/v1/datarooms/{id}/add-content/` backend API.

---

## Scope & Non-Goals

### In Scope
1. **Row action (`ActionsDropdown`):** Add **Add to Datarooms** on both `type === 'folder'` and `type === 'document'` rows when rendered from `DocumentsPage` (via optional `onAddToDatarooms` callback so `DataroomPage` and shared views remain unaffected).
2. **Bulk selection toolbar (`SelectionActionBar`):** Show **Add to Datarooms** whenever one or more folders and/or documents are selected.
3. **Target selection dialog (`AddToDataroomsDialog`):**
   - Search and multi-select from accessible **existing** Datarooms (`GET /api/v1/datarooms/`).
   - Add selected items to each chosen Dataroom's **root** (`destination_folder_id: null`).
   - Show the **Keep synced with source folder** (`sync_folders`) toggle whenever at least one folder is selected (hidden when only documents are selected).
   - Display **non-blocking informational sync hints** on Datarooms that already contain a synced copy of a selected folder (e.g., `"Synced at /A/folderA"` or `"X of Y folders already synced here"`). Do not disable/block selection so intentional root/additional copies remain possible.
   - Handle partial failures across multiple Datarooms cleanly without re-adding already-succeeded Datarooms on retry.
4. **Backend duplicate-document idempotency:** Ensure `DataroomViewSet.add_content` idempotently skips documents that already exist in `(dataroom, destination_folder)`—preventing unwanted renamed clones (`doc (2).pdf`) at root and `IntegrityError` -> `500` in subfolders.

### Explicit Non-Goals (Deferred)
- Creating a **new Dataroom** inline from the dialog (DocSend *"Share as Space"* style).
- Choosing per-Dataroom **destination subfolders** during multi-Dataroom selection.
- Snapshot/sync isolation for standalone **documents** (documents remain live references to `documents.Document` via `DataroomDocument`).
- Adding an **Add to Datarooms** CTA to the unlinked subfolder header/banner on `DocumentsPage` (row and bulk actions cover MVP).

---

## Architecture & Implementation

### 1. Backend: Idempotent Document Handling & Folder Name Deduplication (`backend/datarooms/views.py`, `backend/datarooms/services.py`)

In `DataroomViewSet.add_content` (`POST /api/v1/datarooms/{id}/add-content/`):
- `DataroomDocument` enforces `unique_together = ('dataroom', 'document', 'folder')` (`backend/datarooms/models.py`). Under PostgreSQL standard `UNIQUE` semantics (`NULL != NULL`):
  - When `destination_folder` is a subfolder (`folder_id IS NOT NULL`), re-adding the same `document_id` triggers `IntegrityError`, caught by the broad `except Exception` handler and returned as HTTP `500`.
  - When `destination_folder` is root (`folder_id IS NULL` — the scope `AddToDataroomsDialog` targets), PostgreSQL permits duplicate `(dataroom_id, document_id, NULL)` rows, so `add_content` currently creates a renamed duplicate (`doc (2).pdf`). Notably, `TestDataroomViewSet.test_add_document_with_name_conflict_is_renamed` (`backend/tests/datarooms/test_views.py`) currently posts the same `document.id` twice to root and asserts `count() == 2` / `"doc (2).pdf"`.
- **Changes in `add_content` (`backend/datarooms/views.py`):**
  - Deduplicate input lists upfront (`doc_ids = list(dict.fromkeys(doc_ids))`, `folder_ids = list(dict.fromkeys(folder_ids))`) so duplicate IDs in a single request never trip `docs_to_add.count() != len(doc_ids)` (`403`).
  - Inside `with transaction.atomic():` under `locked_dataroom`, query `DataroomDocument` consistently against `locked_dataroom` so re-adding the same `document_id` is idempotent at **both** root and subfolder scopes:
    ```python
    existing_doc_ids_in_scope = set(
        DataroomDocument.objects.filter(
            dataroom=locked_dataroom,
            folder=destination_folder,
            document_id__in=[doc.id for doc in docs_to_add],
        ).values_list('document_id', flat=True)
    )
    ```
  - Filter `new_docs_to_add = [doc for doc in docs_to_add if doc.id not in existing_doc_ids_in_scope]`.
  - When computing `all_new_doc_ids` for `check_dataroom_quota_for_documents`, use `[doc.id for doc in new_docs_to_add]` plus folder subtrees; only invoke `check_dataroom_quota_for_documents` when `all_new_doc_ids` is non-empty.
  - Only create `DataroomDocument` and `DataroomItemOrder` rows for `new_docs_to_add` (creating against `locked_dataroom`).
  - Only call `touch_dataroom_folder_ancestors` / `touch_dataroom` when at least one document or folder was actually created (`new_docs_to_add` or `folders_to_add` non-empty).
  - Update `TestDataroomViewSet.test_add_document_with_name_conflict_is_renamed` to use two **distinct** `Document` instances that share the same filename (matching its docstring), and add dedicated idempotency tests for re-adding the same `document.id`.
- **Change in `replicate_folder_to_dataroom` (`backend/datarooms/services.py`):**
  - Unconditionally call `get_unique_dataroom_folder_name(dataroom, parent_dataroom_folder, source_folder.name)` regardless of `sync_enabled`. Currently, `sync_enabled=False` reuses `source_folder.name` verbatim, which creates duplicate sibling `DataroomFolder` names at root and can break `DataroomFolder.objects.get(...)` (`MultipleObjectsReturned` / `500`) in upload request/finalize flows.

---

### 2. Frontend Entry Points

#### A. `ActionsDropdown.jsx` & Prop Threading (`DocumentsList.jsx`, `DraggableItem.jsx`)
- Add optional `onAddToDatarooms` prop across `DocumentsList` -> `DraggableItem` -> `ActionsDropdown`.
- Inside `ActionsDropdown.jsx`:
  - Render **Add to Datarooms** (`FolderPlus` or `Share2`/`FolderInput` — recommend `FolderPlus` or `PlusCircle` / distinct icon from `RefreshCw` sync and `Share2` link sharing) whenever `onAddToDatarooms` is provided (works for both `type === 'folder'` and `type === 'document'`).
  - Widen `DropdownMenu.Content` from `w-48` to `w-52` / `w-56` so longer German/French/Russian **Add to Datarooms** labels fit on a single line cleanly.
  - Keep existing **Sync to Datarooms** (`RefreshCw`) strictly for folders with `item.synced_datarooms?.length > 0` so pushing updates to existing sync targets and adding to Datarooms remain clear and distinct.
  - Because `DataroomPage.jsx` and read-only views do not pass `onAddToDatarooms`, the menu item automatically appears **only** in `DocumentsPage.jsx`.

#### B. `SelectionActionBar.jsx`
- Add optional `onAddToDatarooms` prop to `SelectionActionBar`.
- When provided, render an **Add to Datarooms** outline button next to **Move** and **Delete** regardless of whether the selection contains folders only, documents only, or both.

---

### 3. Frontend Dialog & API (`frontend/src/services/api.js`, `frontend/src/components/dialogs/AddToDataroomsDialog.jsx`)

#### API Update (`frontend/src/services/api.js`)
- Update `addContentToDataroom` to accept an optional Axios `config` object:
  ```js
  export const addContentToDataroom = (id, data, config = {}) =>
    api.post(`/datarooms/${id}/add-content/`, data, config);
  ```
- Pass `{ skipErrorToast: true }` from `AddToDataroomsDialog` so parallel `Promise.allSettled` rejections do not emit stacked duplicate global Axios `toast.error` popups alongside the dialog's summary `toast.warning` and inline per-Dataroom error panel.

#### Props
- `isOpen` (`boolean`)
- `onOpenChange` (`(open: boolean) => void`)
- `items` (`{ folders: Array, documents: Array }`) — normalized target payload (snapshot-backed and dynamically enriched from `DocumentsPage`).
- `onSuccess` (`({ syncedFoldersUsed, allSucceeded }) => void`) — refreshes `DocumentsPage` via `fetchDataRef.current?.()` (no `refreshUser()` needed since adding existing library items to a Dataroom does not alter `user.total_document_size`).

#### Data Loading & State Hygiene
- On open, fetch accessible Datarooms via `getDatarooms()` (note: `DataroomViewSet.list` returns an unpaginated array of Datarooms created by or shared with the user, all with collaborator write capability).
  - Use a monotonic request/session counter (`activeSessionIdRef` / `fetchSeqRef`) to prevent stale async responses when closing/reopening quickly.
  - Show skeleton/loading state while fetching and retryable error state on fetch failure.
- Client-side search box filters Datarooms by `name` (fast, zero extra network chatter on unpaginated response).
- Compute a deterministic `targetSignature` from sorted folder/document IDs (`folders.map(f => f.id).sort()` + `documents.map(d => d.id).sort()`). Key the dialog's reset `useEffect` strictly on `[isOpen, targetSignature]` (reading latest `items` from a ref rather than putting `items` directly in effect dependencies) so background `synced_datarooms` enrichment on partial-failure refresh never wipes modal state:
  - `selectedDataroomIds`: `[]`
  - `syncFolders`: `false` (matches `AddContentDialog.jsx` default)
  - `succeededDataroomIds`: `[]` (tracks Datarooms that succeeded during the current modal session so partial-failure retries do not duplicate-add folders)
  - `errorDetails`: `[]` (`[{ id, name, detail }]`)

#### Sync Toggle & Hints
- Compute `hasFolders = (items?.folders?.length || 0) > 0` and `hasDocuments = (items?.documents?.length || 0) > 0`.
- Render the **Keep synced with source folder** checkbox only when `hasFolders === true`:
  - If `hasFolders && hasDocuments`, show helper text explaining that sync tracking applies to selected folders only while documents are added as live references.
  - If `!hasFolders` (documents only), hide the sync checkbox completely.
- **Existing sync indicator (non-blocking):**
  - Build a lookup map from `items.folders` keyed by `dataroom_id`, tracking **distinct** `folder.id`s and deduplicated/sorted `dataroom_folder_path`s (remember a single source folder can be synced to multiple paths within the same Dataroom).
  - If a single folder is targeted and its `synced_datarooms` includes Dataroom `X`, display a subtle badge/subtext on Dataroom `X` (e.g., `Already synced at /A/folderA`, listing paths if multiple).
  - If multiple folders are targeted and `K` of `N` **distinct selected `folder.id`s** are already synced in Dataroom `X` (not raw `synced_datarooms` row count), display `K of N folders already synced here`.
  - Keep the checkbox **enabled** (non-blocking).

#### Submission & Partial Failure Handling
- Compute `pendingSelectedIds = selectedDataroomIds.filter((id) => !succeededDataroomIds.includes(id))`. Disable the submit button whenever `pendingSelectedIds.length === 0` or `isSubmitting`.
- When rendering the Dataroom list:
  - Exclude `succeededDataroomIds` from **Select all** toggling.
  - Render Datarooms in `succeededDataroomIds` as **unchecked + disabled** with an `Added` badge so the user cannot accidentally re-select or submit an already-succeeded target.
- Build payload `{ folder_ids, document_ids, sync_folders: hasFolders ? syncFolders : false }` (omitting `destination_folder_id` / passing `null` for root).
- Execute `addContentToDataroom(dataroomId, payload, { skipErrorToast: true })` across `pendingSelectedIds` using `Promise.allSettled`.
- Guard completion against `activeSessionIdRef` in case the dialog was closed/reopened mid-flight:
  - Track succeeded vs failed Datarooms (`error?.response?.data?.detail` localized via `getLocalizedErrorMessage`).
  - Move newly succeeded Datarooms into `succeededDataroomIds` and remove them from `selectedDataroomIds`.
  - If **all succeeded**: show `toast.success(...)`, call `onSuccess({ allSucceeded: true })`, and close the dialog.
  - If **some failed and some succeeded**: call `onSuccess({ allSucceeded: false })` (so newly created `synced_datarooms` badges appear in the background and enrich the still-open modal), show `toast.warning(...)`, keep the dialog open, and display the inline per-Dataroom error list.
  - If **all failed**: keep the dialog open, show the inline per-Dataroom error list.

---

### 4. `DocumentsPage.jsx` Integration

- Mirror the `syncTarget` / `folderToSync` snapshot + enrichment pattern (`DocumentsPage.jsx:70-79`):
  - Add state `const [addToDataroomsTarget, setAddToDataroomsTarget] = useState(null);` storing a snapshot `{ folders, documents, source }`.
    - Single row trigger (`onAddToDatarooms={(item) => ...}`): stores `{ folders: item.type === 'folder' ? [item] : [], documents: item.type === 'document' ? [item] : [], source: 'row' }`.
    - `SelectionActionBar` trigger (`onAddToDatarooms={handleBulkAddToDatarooms}`): maps `selection.folders` and `selection.documents` IDs against `folders` and `documents` state into `{ folders: [...], documents: [...], source: 'bulk' }`.
  - Derive `resolvedAddToDataroomsItems` via `useMemo`: enrich each snapshot folder/document from live `folders` / `documents` (`folders.find((f) => f.id === sf.id) || sf`) when lists are populated, falling back to the snapshot objects during `fetchData()`'s temporary `setDocuments([]); setFolders([]);` clear so partial-failure refreshes never clear dialog state while still refreshing `synced_datarooms` hints once lists reload.
- Pass `onAddToDatarooms` to both `<SelectionActionBar />` and `<DocumentsList />`.
- On `<AddToDataroomsDialog onSuccess={({ allSucceeded }) => { ... }} />`:
  - Call `fetchDataRef.current?.()` (no `refreshUser()` needed).
  - Unlike `handleMoveItems` (which does not call `handleClearSelection()` because moved items leave the current folder's `allItems` array and `useItemSelection` prunes missing IDs), **Add to Datarooms** leaves items in the current `/documents` folder after refresh. Call `handleClearSelection()` on `allSucceeded` **only** when `addToDataroomsTarget?.source === 'bulk'`, so a single-row `... -> Add to Datarooms` action does not wipe an unrelated multi-row checkbox selection.

---

### 5. Internationalization (`frontend/src/locales/{de,en,fr,nl,ru,zh-hans}/translation.json`)

Reuse existing keys where identical and add missing strings across all 6 locale catalogs (no inline `defaultValue` in `t()` calls; use `资料室` in `zh-hans`; provide proper plural forms `_one`/`_few`/`_many`/`_other` as required by `i18n.test.jsx`):
- Reuse existing `datarooms.keepFoldersSynced` and `datarooms.keepFoldersSyncedHint` (`translation.json:641-642`) for the folder sync toggle; add a mixed folder+document helper key (e.g., `documents.keepFoldersSyncedMixedHint`) only where mixed nuance is needed.
- `documents.addToDatarooms` (Action menu & toolbar button label)
- Dialog title/description (handling single vs multi-item summary), search placeholder, empty datarooms state (`noDataroomsAvailable`, `noDataroomsMatchSearch`), select-all/clear helpers
- `documents.alreadySyncedAtPaths`, `documents.someFoldersAlreadySynced` (with pluralization keys)
- `documents.addToDataroomsSuccess` (`_one`/`_few`/`_many`/`_other`), `documents.addToDataroomsPartial`, `documents.addToDataroomsPartialDetail`, `documents.addedLabel` (for already-succeeded rows before retry)

---

## Verification Plan

### Backend (`pytest`)
In `backend/tests/datarooms/`:
1. Update `TestDataroomViewSet.test_add_document_with_name_conflict_is_renamed` (`test_views.py`) to test two **distinct** `Document` objects with the same filename colliding at root (confirming unique renaming for distinct documents).
2. Add tests for `POST /api/v1/datarooms/{id}/add-content/` when pushing a `document_id` that already exists in `(dataroom, destination_folder)` (both root and subfolder scopes): returns `200 OK`, does **not** raise `500` or create renamed/duplicate `DataroomDocument` or `DataroomItemOrder` rows, and preserves existing item state.
3. Add test for `sync_folders=False` when adding a folder whose name already exists at the destination scope (root/subfolder), verifying `replicate_folder_to_dataroom` deduplicates the folder name via `get_unique_dataroom_folder_name` instead of creating duplicate sibling `DataroomFolder` names.
4. Add test for repeated `document_ids` / `folder_ids` within the same `add-content` request and for mixed payloads under a storage quota limit to confirm deduplication and quota checks behave properly.

### Frontend (`vitest` + `eslint`)
Add/update tests in whitelisted suites (`frontend/vitest.whitelist.json`):
1. **`src/tests/components/dialogs/AddToDataroomsDialog.test.jsx`** (new suite — **must** append to `frontend/vitest.whitelist.json` so `make test.front` / `npm run test:whitelist` executes it in CI):
   - Renders accessible Datarooms and filters by search query.
   - Hides **Keep synced with source folder** for document-only target; shows it when folders are included (and shows mixed hint when both folders and documents are present).
   - Shows non-blocking sync hint (`Synced at /A/folderA`) when a selected folder is already synced in a Dataroom while still keeping that Dataroom selectable; verifies `K of N` counts distinct selected `folder.id`s when one folder has multiple synced paths in the same Dataroom.
   - Submits `addContentToDataroom` for all selected Datarooms in parallel with `{ folder_ids, document_ids, sync_folders }` and `{ skipErrorToast: true }`.
   - Handles partial failure (e.g., quota error on 1 of 2 Datarooms): displays inline error, refreshes data, keeps dialog open, unchecks & disables succeeded targets with `Added` badge, excludes them from `Select all`, disables submit when `pendingSelectedIds.length === 0`, and skips already-succeeded Datarooms on retry.
   - Preserves `succeededDataroomIds` / `errorDetails` when `items` changes during background refresh (`targetSignature` unchanged) while preventing stale state/responses across rapid close/reopen.
2. **`src/tests/components/documents/DraggableItem.test.jsx` & `src/tests/components/documents/DocumentsList.test.jsx`:**
   - Verify **Add to Datarooms** renders in `ActionsDropdown` for both folder and document rows when `onAddToDatarooms` is passed, and is omitted when `onAddToDatarooms` is absent (e.g., inside `DataroomPage`).
3. **`src/tests/pages/DocumentsPage.test.jsx`:**
   - Cover `SelectionActionBar` **Add to Datarooms** rendering across folder-only, document-only, and mixed selections, plus mocked dialog opening from both row menu and `SelectionActionBar`.
   - Verify `handleClearSelection()` runs on `allSucceeded` when opened from `SelectionActionBar` (`source: 'bulk'`), preserves existing selection when opened from a row menu (`source: 'row'`), and retains dialog state across partial-failure `fetchData()` list clears.
4. **`src/tests/services/api.test.js`:**
   - Verify `addContentToDataroom(id, data, config)` forwards `config` (including `skipErrorToast: true`) cleanly.
5. **`src/tests/i18n.test.jsx`:**
   - Confirm 6-locale parity with zero missing/extra plural keys.
6. Run `cd frontend && npm run lint`.
