# 📜 Dataroom Audit Trail & Activity Log Preservation Plan (Delete, Move, Rename)

> **Status:** Completed  
> **Goal:** Ensure dataroom visit logs, activity timelines, and compliance audit records remain accurate, complete, and human-readable across all lifecycle mutations: deletion, renaming, and relocation (moving) of documents and folders.

---

## 1. 🔍 Problem Statement & Current Gaps

When a viewer explores a dataroom, each file or folder view is logged as a `DataroomVisit` record:
```python
# backend/sharelinks/models.py
class DataroomVisit(models.Model):
    view_session = models.ForeignKey('ViewSession', on_delete=models.CASCADE)
    dataroom_document = models.ForeignKey('datarooms.DataroomDocument', on_delete=models.SET_NULL, null=True, blank=True)
    dataroom_folder = models.ForeignKey('datarooms.DataroomFolder', on_delete=models.SET_NULL, null=True, blank=True)
```

The current implementation has three fundamental flaws:

| Mutation | Current Behavior | Flaw / Impact |
|---|---|---|
| **Delete Document / Folder** | `on_delete=SET_NULL` wipes the FK pointer. The serializer traverses `source='dataroom_document.document.name'` which evaluates to `None`. | **Empty Audit Entry**: UI renders `"Viewed document: "` with an empty name, losing crucial compliance context. |
| **Rename Document / Folder** | Dynamically joins the *current* name of the active `DataroomDocument` / `DataroomFolder`. | **Historical Distortion**: Renaming `"Draft Agreement.pdf"` to `"Final Agreement.pdf"` retroactively mutates past audit history from 3 weeks ago. |
| **Move Document / Folder** | Hierarchical path is not tracked. If an item moves to a restricted subfolder, historical audit logs cannot show where the document resided when accessed. | **Loss of Spatial Audit**: Audit trail cannot verify whether the viewer viewed the file in the public root or a private subfolder. |

---

## 2. 🏛️ Best Practice Comparison (DocSend, Box, Datasite)

In enterprise Virtual Data Rooms (VDRs) and compliance tools:
1. **Immutable Audit Ledger:** Activity logs are append-only. They never rely solely on dynamic foreign key joins to resolve display names.
2. **Point-in-Time Snapshotting:** When an event occurs, the name, type, and virtual path of the target item are snapshotted onto the audit record at write time.
3. **Live FK + Snapshot Hybrid:**
   - **Point-in-Time Snapshot:** Preserves what the item was named and where it was located *at the moment of access*.
   - **Optional Live FK:** Allows navigation/preview if the item still exists in the room today.
   - **UI Status Cue:** If the item was subsequently deleted or renamed, the UI renders the original name with a subtle badge (e.g., `[Deleted]` or `[Renamed]`).

---

## 3. 📐 Technical Design

### A. Model Schema Enhancement (`DataroomVisit`)

Add point-in-time snapshot fields to `DataroomVisit` in `backend/sharelinks/models.py`:

```python
class DataroomVisit(models.Model):
    id = ULIDField(primary_key=True, editable=False)
    view_session = models.ForeignKey('ViewSession', on_delete=models.CASCADE, related_name='dataroom_visits')
    
    # Soft link: stays null if deleted, but points to live item if it still exists
    dataroom_document = models.ForeignKey('datarooms.DataroomDocument', on_delete=models.SET_NULL, null=True, blank=True)
    dataroom_folder = models.ForeignKey('datarooms.DataroomFolder', on_delete=models.SET_NULL, null=True, blank=True)
    
    # --- Point-in-time Immutable Audit Snapshots ---
    item_type = models.CharField(
        max_length=20, 
        choices=[('document', 'Document'), ('folder', 'Folder')],
        default='document'
    )
    item_name = models.CharField(max_length=255, blank=True, default='')
    item_path = models.CharField(max_length=1024, blank=True, default='', help_text="Virtual folder path at time of visit, e.g. /Financials/2026")
    document_type = models.CharField(max_length=50, blank=True, default='')  # pdf, spreadsheet, etc.
    
    visited_at = models.DateTimeField(default=timezone.now)
    downloaded_at = models.DateTimeField(null=True, blank=True)
```

### B. Event Snapshot Population (`RecordVisitView`)

In `backend/sharelinks/views.py`:
When creating a `DataroomVisit`:
```python
if doc_id:
    dataroom_doc = DataroomDocument.objects.get(id=doc_id, dataroom=dataroom)
    visit_data.update({
        'dataroom_document': dataroom_doc,
        'item_type': 'document',
        'item_name': dataroom_doc.name or dataroom_doc.document.name,
        'item_path': dataroom_doc.folder.get_full_path() if dataroom_doc.folder else '/',
        'document_type': dataroom_doc.document.type,
    })
elif folder_id:
    dataroom_folder = DataroomFolder.objects.get(id=folder_id, dataroom=dataroom)
    visit_data.update({
        'dataroom_folder': dataroom_folder,
        'item_type': 'folder',
        'item_name': dataroom_folder.name,
        'item_path': dataroom_folder.get_full_path(),
        'document_type': 'folder',
    })
```

### C. Serializer Fallback & Lifecycle Flags

In `backend/sharelinks/serializers.py`:
```python
class DataroomVisitSerializer(serializers.ModelSerializer):
    dataroom_document_name = serializers.SerializerMethodField()
    dataroom_document_type = serializers.SerializerMethodField()
    dataroom_folder_name = serializers.SerializerMethodField()
    item_status = serializers.SerializerMethodField()
    historical_path = serializers.CharField(source='item_path', read_only=True)

    def get_dataroom_document_name(self, obj):
        # Prefer live item name if exists, fallback to snapshot name
        if obj.dataroom_document and obj.dataroom_document.name:
            return obj.dataroom_document.name
        if obj.dataroom_document and obj.dataroom_document.document:
            return obj.dataroom_document.document.name
        return obj.item_name or None

    def get_dataroom_folder_name(self, obj):
        if obj.dataroom_folder:
            return obj.dataroom_folder.name
        return obj.item_name if obj.item_type == 'folder' else None

    def get_item_status(self, obj):
        """Returns 'active', 'deleted', or 'renamed'."""
        if obj.item_type == 'document':
            if not obj.dataroom_document:
                return 'deleted'
            current_name = obj.dataroom_document.name or obj.dataroom_document.document.name
            if obj.item_name and current_name != obj.item_name:
                return 'renamed'
        elif obj.item_type == 'folder':
            if not obj.dataroom_folder:
                return 'deleted'
            if obj.item_name and obj.dataroom_folder.name != obj.item_name:
                return 'renamed'
        return 'active'
```

### D. Frontend Presentation (`ViewSessionsTable.jsx`)

In `frontend/src/components/documents/ViewSessionsTable.jsx`:
1. **Fallback for Missing Names:** If name is completely missing (older legacy records), show `t('viewSessions.deletedDocument', '(Deleted document)')`.
2. **Visual Status Badges:**
   - If `item_status === 'deleted'`: Display a small `[Deleted]` badge next to the historical file name.
   - If `item_status === 'renamed'`: Display current name with tooltip *"Originally viewed as: {original_name}"*.
3. **Tooltip for Historical Path:**
   - When hovering over the document/folder name, show `path: /Financials/2026/Q1.pdf` so moves do not obscure context.

---

## 4. 🗂️ Migration & Backfill Strategy

For existing `DataroomVisit` records in production:
1. **Data Migration:** Run a Django migration script to backfill `item_name`, `item_type`, and `document_type` for all existing records where `dataroom_document_id` or `dataroom_folder_id` is still non-null.
2. **Orphaned Records:** For historical visits where the document was already deleted (`dataroom_document_id IS NULL`), mark `item_name = ""` so the serializer and frontend gracefully display `(Deleted document)`.

---

## 5. 📋 Implementation Phases

- [x] **Phase 1: Database Migration & Model Fields**
  - [x] Add `item_type`, `item_name`, `item_path`, and `document_type` to `DataroomVisit`.
  - [x] Create Django schema migration.
  - [x] Create data migration to backfill live rows.
- [x] **Phase 2: Recording Snapshot Logic**
  - [x] Update `RecordVisitView` in `backend/sharelinks/views.py` to populate snapshots upon visit creation.
  - [x] Update download tracking in `dataroom_download` endpoints.
- [x] **Phase 3: Serializer & Status Handling**
  - [x] Update `DataroomVisitSerializer` to expose `item_status` (`active`, `deleted`, `renamed`) and fall back to snapshots.
- [x] **Phase 4: Frontend UI Polish**
  - [x] Update `ViewSessionsTable.jsx` to render status badges (`Deleted`, `Renamed`).
  - [x] Add i18n translation keys for all languages (`en`, `zh-hans`, `de`, `ru`).
- [x] **Phase 5: Automated Testing**
  - [x] Test delete document → verify name is preserved in activity log.
  - [x] Test rename document → verify log shows historical context or flags rename.
  - [x] Test move document → verify path or location persistence.
