# Code Review: Staged Data Consistency & Cleanup Batch 2

**Date:** 2026-10-31  
**Branch:** `fix.data_consistency_batch_2`  
**Scope:** Staged files across `datarooms/`, `documents/`, `sharelinks/`, and test suites:
- `backend/datarooms/views.py`
- `backend/documents/views.py`
- `backend/sharelinks/models.py`
- `backend/sharelinks/views.py`
- `backend/tests/datarooms/test_views.py`
- `backend/tests/documents/test_views.py`
- `backend/tests/sharelinks/test_models.py`
- `backend/tests/sharelinks/test_views.py`

---

## Test Verification

- **Targeted Backend Pytest Suite:**
  ```bash
  COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend pytest -q \
    tests/datarooms/test_views.py \
    tests/documents/test_views.py \
    tests/sharelinks/test_models.py \
    tests/sharelinks/test_views.py
  ```
  *Result:* `430 passed in 160.97s (0:02:40)`

---

## General Standards & Historical Rules Audit

| Standard / Historical Rule | Status | Observations |
| :--- | :---: | :--- |
| **No Hardcoded API Keys / Secrets** | Passed | No secrets or tokens introduced. |
| **Atomic Transactions & Data Integrity** | Passed | Operations in `move_content` and `reorder_items` wrap order cleanup in `transaction.atomic()`. |
| **Historical Rule 1: Concurrency & Lock Guarding** | Passed | Preview rebuild has stale-time check (15m threshold) and conflict guard. |
| **Historical Rules 7 & 10: i18n & No Inline Defaults** | Passed | No hardcoded or inline `defaultValue` user-facing strings added. |
| **Database Migrations Integrity** | ❌ **Failed** | Staged model constraints added to `ShareLinkDataroomSetting` without a corresponding migration file (`0013_...`). |
| **Repository Import Style (AGENTS.md)** | ⚠️ **Warning** | Multiple inline `import` statements found in `models.py` and test files instead of file headers. |

---

## Findings Summary

| # | Severity | Component / File | Description |
| :- | :---: | :--- | :--- |
| **1** | **HIGH** | `backend/sharelinks/models.py:175-185`, `backend/tests/sharelinks/test_views.py:1494` | **Missing Django Migration for Unique Constraints & Incompatible Test Setup**: `UniqueConstraint`s were added to `ShareLinkDataroomSetting` without running `makemigrations`. In addition, `test_view_data_with_duplicate_dataroom_setting_does_not_500` relies on `bulk_create` to insert duplicate rows; once the migration is applied to PostgreSQL/SQLite, the database engine will reject `bulk_create` with an `IntegrityError`, breaking the test. |
| **2** | **MEDIUM** | `backend/datarooms/views.py:442-443` | **Unscoped Item Order Deletion in `move_content` (Cross-Dataroom Mutation)**: Cleanup queries delete order rows using raw `folder_id__in=folder_ids` and `dataroom_document_id__in=doc_ids` without filtering by `dataroom=dataroom`. Supplying IDs from another dataroom deletes their order records. |
| **3** | **LOW** | `backend/sharelinks/models.py:192,195`, `backend/tests/documents/test_views.py:1207`, `backend/tests/sharelinks/test_models.py:87` | **Inline Imports**: Redundant inline imports of `IntegrityError`, `timedelta`, `timezone`, and models violate the repository's top-level import standard. |

---

## Detailed Evaluation & Remediation

### 1. [HIGH] Missing Migration & Fragile Test Setup for `ShareLinkDataroomSetting` Constraints

#### Problem Mechanics
1. In `backend/sharelinks/models.py:175-185`, two unique constraints were added:
   ```python
   models.UniqueConstraint(
       fields=['share_link', 'dataroom_document'],
       condition=Q(dataroom_document__isnull=False),
       name='unique_sharelink_dataroom_document'
   ),
   models.UniqueConstraint(
       fields=['share_link', 'dataroom_folder'],
       condition=Q(dataroom_folder__isnull=False),
       name='unique_sharelink_dataroom_folder'
   ),
   ```
   Running `makemigrations --dry-run` shows that migration `0013_sharelinkdataroomsetting_unique_sharelink_dataroom_document_and_more.py` was never generated or staged. The database schema in production/CI will not have these constraints.
2. In `backend/tests/sharelinks/test_views.py:1494-1503`:
   ```python
   # Force insert a second duplicate row bypassing model save() via bulk_create
   ShareLinkDataroomSetting.objects.bulk_create([
       ShareLinkDataroomSetting(
           share_link=link,
           dataroom_document=ddoc,
           is_visible=True,
           allow_download=True,
       )
   ])
   ```
   This test passed **only** because migration 0013 was missing from the test database. Once migration 0013 is generated and applied, the PostgreSQL/SQLite engine will reject `bulk_create` with `IntegrityError`, causing this test to fail during test setup.

#### Required Remediation
1. Run `python manage.py makemigrations` to generate migration `0013`.
2. In `test_views.py`, to test defensive query handling for legacy duplicates without colliding with the database constraint, disable constraint checking or insert via raw SQL (or test against existing unconstrained test models).

---

### 2. [MEDIUM] Unscoped `DataroomItemOrder` Deletion in `move_content`

#### Problem Mechanics
In `backend/datarooms/views.py:442-443`:
```python
# Clear old order rows for moved items to prevent orphaned records in source folders
DataroomItemOrder.objects.filter(folder_id__in=folder_ids).delete()
DataroomItemOrder.objects.filter(dataroom_document_id__in=doc_ids).delete()
```
While `docs_to_move` and `folders_to_move` are scoped to `dataroom=dataroom` (lines 418 & 426), `folder_ids` and `doc_ids` originate directly from unvalidated request data (`data.get('dataroom_folder_ids', [])`). If an authenticated user calls `move-content` and passes foreign IDs belonging to an entirely different dataroom, their `DataroomItemOrder` rows will be deleted.

#### Required Remediation
Scope the deletion strictly to the current dataroom and validated items:
```python
DataroomItemOrder.objects.filter(dataroom=dataroom, folder__in=folders_to_move).delete()
DataroomItemOrder.objects.filter(dataroom=dataroom, dataroom_document__in=docs_to_move).delete()
```

---

### 3. [LOW] Inline Imports

#### Problem Mechanics
- `backend/sharelinks/models.py:192, 195`: `from django.db import IntegrityError` is called twice inside `save()`. `IntegrityError` can be imported at the top of the file: `from django.db import IntegrityError, models`.
- `backend/tests/documents/test_views.py:1207-1208`: `from datetime import timedelta` and `from django.utils import timezone` inside `test_rebuild_preview_stale_processing_task_auto_recovers` are already imported at lines 2 and 3 of the same file.
- `backend/tests/sharelinks/test_models.py:87-90`: `Dataroom` and `ShareLinkDataroomSetting` should be imported at top level with `DataroomDocument, DataroomFolder` and `ShareLink, ViewSession`.

---

## Positive Architecture Highlights

1. **Defensive Setting Resolution**:
   In `backend/sharelinks/views.py:_resolve_dataroom_document_setting`, using `.filter().order_by('-updated_at').first()` with an explicit `DoesNotExist` fallback cleanly prevents 500 crashes from legacy duplicate rows.
2. **Rebuild Task Auto-Recovery**:
   In `backend/documents/views.py:rebuild_preview`, allowing user force rebuilds or recovering from tasks stuck in `processing` > 15 minutes prevents documents from being permanently locked when Celery workers restart or die.
3. **Item Order Orphan Cleanup**:
   In `backend/datarooms/views.py:reorder_items`, purging existing scope records before bulk recreating prevents position index collisions.

---

## Proposed Additions to Long-Term Memory

```markdown
# Proposed Additions to Long-Term Memory
[ ] Issue: Adding Django `models.UniqueConstraint` or schema fields without running `makemigrations` leaves the database schema out of sync, and test suites simulating constraint bypass via `bulk_create` will fail once the DB constraint is actually applied.
Prevention Rule: Every model schema modification (`UniqueConstraint`, new fields, altered nullability) must include a generated migration file (`python manage.py makemigrations`), and tests verifying fallback behavior for duplicate/invalid data must not rely on `bulk_create` bypassing database-level constraints.
```
