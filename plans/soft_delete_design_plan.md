# 🗑️ Document & Folder Soft-Delete Design Plan

> **Prerequisite for:** [Coneshare Stdio MCP Server Plan](file:///Users/xiez/coneshare/plans/todo/stdio_mcp_server_plan.md)  
> **Target Models:** [Document](file:///Users/xiez/coneshare/backend/documents/models.py#L49-L124), [Folder](file:///Users/xiez/coneshare/backend/documents/models.py#L19-L47)

---

## 1. 📌 Overview & Rationale

To support safe document operations in the upcoming **Stdio MCP Server** (`coneshare-mcp`) and improve workspace safety in the Coneshare web app, we are implementing a **Soft-Delete Architecture**.

Instead of performing destructive `SQL DELETE` queries on documents and folders, items are moved to **Trash** with recovery support.

---

## 2. 🗄️ Database Schema & Data Models

### 2.1 Schema Updates (`backend/documents/models.py`)

Add soft-delete metadata columns to `Document` and `Folder`:

```python
class Folder(BaseModel):
    # Existing fields...
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    deleted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='folders_deleted'
    )

class Document(BaseModel):
    # Existing fields...
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    deleted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='documents_deleted'
    )
```

### 2.2 Unique Constraints & Duplicate Name Handling

Currently, `Document` and `Folder` have `unique_together` constraints:
- `Document`: `('created_by', 'folder', 'name')`
- `Folder`: `('created_by', 'parent', 'name')`

#### Soft-Delete Collision Policy
When a document named `"foo.txt"` is soft-deleted, creating a new file named `"foo.txt"` in the same folder and subsequently soft-deleting it will **succeed without error**.

**How this works under Partial Unique Constraints:**
1. Replace legacy `unique_together` with Django `UniqueConstraint` using `condition=Q(deleted_at__isnull=True)`.
2. This ensures uniqueness is enforced **only among active non-deleted items**.
3. When multiple items named `"foo.txt"` are soft-deleted, their `deleted_at` timestamps are non-null (`deleted_at != None`), so they **do not violate the partial index**. All deleted versions coexist in Trash differentiated by primary key (ULID) and `deleted_at` timestamp.

#### Restoration Collision Policy
If a user attempts to **restore** an older `"foo.txt"` from Trash while another active file named `"foo.txt"` currently exists in the target folder:
- **Strategy:** The restore operation checks for active name collisions. If a collision exists, it automatically appends a numerical copy suffix (e.g. `"foo (restored 1).txt"`) before clearing `deleted_at`, ensuring the restore operation succeeds without throwing a `409 Conflict` or database `IntegrityError`.

---

## 3. 🔍 Query Managers & Filtering Strategy

To prevent accidental exclusion in Django Admin or standard foreign key resolutions:

### 3.1 Custom QuerySet & Manager

```python
class SoftDeleteQuerySet(models.QuerySet):
    def active(self):
        return self.filter(deleted_at__isnull=True)

    def deleted(self):
        return self.filter(deleted_at__isnull=False)

class SoftDeleteManager(models.Manager.from_queryset(SoftDeleteQuerySet)):
    """
    Custom manager exposing .active() and .deleted() methods while leaving
    default .all() intact to prevent breaking Django Admin and FK resolution.
    """
    def active(self):
        return self.get_queryset().active()

    def deleted(self):
        return self.get_queryset().deleted()
```

### 3.2 View & Endpoint Filtering Rules

- Standard Document/Folder list & detail endpoints (`/api/v1/documents/`, `/api/v1/folders/`) filter against `Document.objects.active()` and `Folder.objects.active()`.
- Trash endpoints (`/api/v1/trash/`) filter against `Document.objects.deleted()` and `Folder.objects.deleted()`.

---

## 4. 🌳 Cascading Soft-Delete & Restore Logic

### 4.1 Folder Soft-Delete Behavior
When a folder is soft-deleted:
1. Set `deleted_at = timezone.now()` and `deleted_by = requesting_user` on the folder.
2. Recursively traverse all descendant subfolders (`folder.get_descendants()`) and contained documents.
3. Update `deleted_at` and `deleted_by` across the entire subtree within a single `transaction.atomic()` block.

### 4.2 Restoration Behavior (Google Drive / Dropbox Alignment)

To keep database transactions clean, prevent partial tree inconsistencies, and match industry standards (Google Drive, Dropbox, macOS Trash):

- **Atomic Whole-Folder Restoration:** Restoring a soft-deleted folder restores the folder, its parent folder chain (if deleted), and **all nested subfolders and files** as an atomic operation (`transaction.atomic()`).
- **No Selective In-Trash Extraction:** Users restore the entire folder tree in 1 click. If a user only needed 1 file from a deleted folder, they restore the folder, take the file, and re-delete any unneeded items.

---

## 5. 🔗 Share Links & Dataroom Visibility Impact

### 5.1 Public Share Links
- **Access Blocking:** When a document is soft-deleted, attempts to view or download it via active `ShareLink` tokens return `404 Not Found`.
- **Automatic Reactivation:** Restoring a document from Trash immediately restores existing `ShareLink` access without requiring new tokens or link re-configuration.

### 5.2 Datarooms Integration Policy
Datarooms reference workspace documents via `DataroomDocument(document=...)`.

1. **Soft-Deleted Document in a Dataroom:**
   - **Viewer / Guest Access:** Dataroom viewer endpoints filter against `document__deleted_at__isnull=True`. Soft-deleted documents are **automatically hidden** from the Dataroom index tree and viewer UI.
   - **Dataroom Admin View:** Shows a subtle indicator (*"Item in Trash"*) or filters out soft-deleted items.
   - **Restoration Behavior:** If the document is restored from Trash (`deleted_at = NULL`), it **automatically reappears in the Dataroom** with its position (`DataroomItemOrder`), custom title, and permissions fully intact!

2. **Permanent Hard Delete:**
   - When a document is permanently purged from Trash, `on_delete=CASCADE` on `DataroomDocument` deletes the Dataroom reference and item order entry from the database.

---

## 6. 📦 Storage Quota & 30-Day Hard Purge Retention

### 6.1 Quota Calculation
- Items in Trash **continue to count toward the organization's storage quota**.
- Quota is freed **only upon permanent hard deletion** (either manual "Empty Trash" or automatic retention purge).

### 6.2 30-Day Auto-Retention Purge (Celery Cron)
- Daily Celery task `purge_expired_trash_documents_task`:
  1. Identifies documents with `deleted_at < now() - 30 days`.
  2. Deletes physical files from storage (MinIO/S3 via Go file service or Django storage handler).
  3. Hard-deletes `DocumentVersion` and `Document` database records.

---

## 7. 🔌 REST API Endpoints Specification

| Method | Endpoint | Description |
|---|---|---|
| `DELETE` | `/api/v1/documents/{id}/` | Soft-delete a document (moves to trash) |
| `DELETE` | `/api/v1/folders/{id}/` | Soft-delete a folder & all nested contents |
| `GET` | `/api/v1/trash/` | List soft-deleted documents & folders via DB-level SQL `UNION ALL` pagination |
| `POST` | `/api/v1/trash/{id}/restore/` | Restore document/folder from trash |
| `DELETE` | `/api/v1/trash/{id}/permanent/` | Permanently hard-delete item & storage binary |
| `DELETE` | `/api/v1/trash/empty/` | Permanently hard-delete all items in trash |

### 7.1 Database-Level Pagination Strategy (User-Scoped)
Trash is **strictly user-scoped** (`deleted_by=user`). Users can only view, restore, or permanently delete items in Trash that they soft-deleted.

To avoid loading large trash sets into Python memory, `GET /api/v1/trash/` uses Django QuerySet `.union()` with user-scoped filtering:

```python
# Pure SQL-level pagination using UNION ALL (User-Scoped with Location Metadata)
folders_qs = Folder.objects.deleted().filter(
    deleted_by=request.user
).annotate(
    item_type=Value('folder', CharField()),
    size=Value(None, BigIntegerField()),
    parent_name=F('parent__name')
).values('id', 'name', 'item_type', 'size', 'deleted_at', 'deleted_by_id', 'parent_name')

docs_qs = Document.objects.deleted().filter(
    deleted_by=request.user
).annotate(
    item_type=Value('document', CharField()),
    size=F('file_size'),
    parent_name=F('folder__name')
).values('id', 'name', 'item_type', 'size', 'deleted_at', 'deleted_by_id', 'parent_name')

combined_qs = folders_qs.union(docs_qs).order_by('-deleted_at')
```
- **PostgreSQL Execution:** `LIMIT 20 OFFSET 0` is applied directly in SQL.
- **Index Support:** Covered by compound index `(deleted_by_id, deleted_at)`.
- **Location Context:** Exposes `parent_name` (e.g. `"root"` vs `"folder"`) so users can distinguish items with identical names deleted from different locations.
- **Privacy & Security:** Isolates trash per user — members cannot see or modify other users' trash items.
- **Memory Overhead:** $O(\text{page\_size})$ — only 20 rows are loaded into Python memory regardless of trash size.

---

## 8. 🎨 Frontend UI Design Specification (`TrashPage.jsx`)

### 8.1 Sidebar Navigation Integration
- Add Trash navigation item to [SidebarContent.jsx](file:///Users/xiez/coneshare/frontend/src/components/layout/SidebarContent.jsx):
  ```javascript
  import { Trash2 } from "lucide-react";
  { href: "/trash", label: "Trash", icon: Trash2 }
  ```

### 8.2 Page Layout & Header
- **Page Route:** `/trash` ([TrashPage.jsx](file:///Users/xiez/coneshare/frontend/src/pages/TrashPage.jsx))
- **Header Title:** `"Trash"`
- **Header Description:** `"Items in Trash are retained for 30 days before automatic purge."`
- **Header Action:** **"Empty Trash"** button (Destructive variant with confirmation modal).

### 8.3 Trash Table Component (`TrashList.jsx`)
Standard table layout matching Coneshare design tokens:
- **Columns:**
  1. `Checkbox` — Supports batch item selection.
  2. `Name` — Type icon (Folder, PDF, Video, Image, Document) + file name.
  3. `Location` — Original folder (`parent_name`).
  4. `Deleted Date` — Human-readable timestamp (e.g. *"2 hours ago"*).
  5. `Size` — Formatted size (*"2.4 MB"*, or `"-"` for folders).
  6. `Actions` — Quick inline action buttons:
     - 🔄 **Restore** (Primary icon button)
     - 🗑️ **Delete Permanently** (Destructive hover icon button)

### 8.4 Multi-Selection & Floating Action Bar
When checkboxes are selected, a bottom floating bar appears:
- Displays count: `"X items selected"`
- Actions: **"Restore Selected"** and **"Delete Selected Permanently"**.

### 8.5 Interactive Dialogs
1. **Empty Trash Confirmation Dialog:** Prompt confirming permanent deletion of all items in Trash.
2. **Permanent Delete Dialog:** Prompt confirming permanent binary removal of individual/selected items.
3. **Restore Conflict Toast:** If restoring an item encounters a name collision, toast notifies: *"Restored as 'foo (restored 1).txt'"*.

### 8.6 Empty State
Renders a centered empty state when Trash contains 0 items:
- Muted `Trash2` icon.
- Text: *"Trash is empty. Soft-deleted documents and folders will appear here."*

### 8.7 Trash Item Interaction & Inspection Policy

#### 1. Clicking a Trashed Document
- **Behavior:** Opens a **Read-Only Document Inspector Modal**.
- **Metadata Shown:** Document name, original path, file size, file type, deletion date, and `deleted_by` user.
- **Disabled Actions:** Downloads, public share link generation, editing, and preview image rendering are **disabled** while in Trash.
- **Available Actions:** **Restore** and **Delete Permanently**.

#### 2. Clicking a Trashed Folder
- **Behavior:** Opens a **Trashed Folder Details Modal**.
- **Metadata Shown:** Folder name, original parent path, total contained items count, total folder size, deletion date, and `deleted_by` user.
- **Action:** **"Restore Folder"** (restores the folder + all nested contents atomically) or **"Delete Permanently"**.
- **Rationale (Google Drive / Dropbox Standard):** Prevents partial tree states and keeps the codebase simple, fast, and maintainable. Users restore the folder in 1 click to access its contents.

---

## 9. 📋 Implementation Plan & Deliverables

1. **Backend Implementation:**
   - Update `Document` & `Folder` models in `backend/documents/models.py`.
   - Add service functions for cascading soft-delete, restore, and hard-delete in `backend/documents/services.py`.
   - Implement `/api/v1/trash/` ViewSet in `backend/documents/views.py`.
   - Add unit & integration tests in `backend/tests/documents/`.
2. **Frontend UI:**
   - Add Trash sidebar link in `frontend/src/components/layout/SidebarContent.jsx`.
   - Create `TrashPage.jsx` and `TrashList.jsx` in `frontend/src/pages/` and `frontend/src/components/trash/`.
3. **MCP Server Integration:**
   - Connect `delete_document` in `mcp-server/coneshare_mcp/tools/documents.py` to `DELETE /api/v1/documents/{id}/`.
