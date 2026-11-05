# Code Review: Staged Data Consistency & Cleanup Batch 1

**Date:** 2026-10-30  
**Branch:** `fix.data_consistency_batch_1`  
**Scope:** Staged files across `core/`, `backend/`, and test suites:
- `backend/core/management/commands/check_vault_integrity.py`
- `backend/documents/services.py`
- `backend/sharelinks/models.py`
- `backend/sharelinks/serializers.py`
- `backend/sharelinks/views.py`
- `backend/tests/documents/test_services.py`
- `backend/tests/sharelinks/test_models.py`
- `backend/tests/sharelinks/test_nda_gate.py`
- `core/main.go`
- `core/main_test.go`

---

## Test Verification

- **Go Core Service Tests:**
  ```bash
  COMPOSE_PROJECT_NAME=coneshare docker-compose exec core go test ./...
  ```
  *Result:* `ok coneshare/core 0.005s` (All unit tests passed)

- **Targeted Backend Pytest Suite:**
  ```bash
  COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend pytest -q tests/documents/test_services.py tests/sharelinks/test_models.py tests/sharelinks/test_nda_gate.py
  ```
  *Result:* `73 passed in 25.60s`

---

## Findings Summary

| # | Severity | Component / File | Description |
| :- | :---: | :--- | :--- |
| **1** | **MEDIUM** | `backend/documents/services.py:532-540` | **Missing HLS Directory Cleanup in `delete_folder_and_contents`**: While `delete_document_and_files` was patched to add the parent `_hls` folder to `storage_keys_to_delete`, `delete_folder_and_contents` still only collects `version.storage_key` and `version.original_storage_key`. When deleting a folder containing video documents, `.ts` segment files are orphaned on disk. |
| **2** | **MEDIUM** | `backend/documents/services.py:345-365` | **Prefix Reference Check Missing in Batch `filter_unreferenced_storage_keys`**: While `is_storage_key_referenced` was updated to check prefix matches for keys ending with `_hls`, the batch function `filter_unreferenced_storage_keys` only matches exact `storage_key__in=keys_list`. Enqueuing an `_hls` directory in bulk file deletions does not verify prefix references against existing document versions. |
| **3** | **LOW** | `backend/tests/sharelinks/test_nda_gate.py:224` | **Inline Import in Test Method**: `from sharelinks.models import Viewer` is imported inside `test_nda_acceptance_recognized_with_different_email_casing`, violating repository PEP 8 import standards. |

---

## Detailed Evaluation & Remediation

### 1. [MEDIUM] Missing HLS Directory Cleanup in `delete_folder_and_contents`

In `backend/documents/services.py:532-540`:
```python
for version in versions:
    if version.original_storage_key:
        storage_keys_to_delete.add(version.original_storage_key)
    if version.storage_key and version.storage_key != version.original_storage_key:
        storage_keys_to_delete.add(version.storage_key)
```

#### Problem Mechanics
In `delete_document_and_files`:
```python
if version.storage_key and version.storage_key != version.original_storage_key:
    storage_keys_to_delete.add(version.storage_key)
    if version.type == 'video' or version.storage_key.endswith('/playlist.m3u8') or '_hls' in version.storage_key:
        hls_dir = os.path.dirname(version.storage_key)
        if hls_dir.endswith('_hls'):
            storage_keys_to_delete.add(hls_dir)
elif version.type == 'video' and version.original_storage_key:
    base_path, _ = os.path.splitext(version.original_storage_key)
    hls_dir = f"{base_path}_hls"
    storage_keys_to_delete.add(hls_dir)
```
When a user deletes a folder, any video versions contained within it will only enqueue the playlist `.m3u8` file and original upload, leaving the `_hls` folder and all generated `.ts` chunks behind on disk.

#### Required Remediation
Replicate or extract the HLS directory detection helper so that `delete_folder_and_contents` also appends the `_hls` directory to `storage_keys_to_delete`.

---

### 2. [MEDIUM] Missing Prefix Matching in `filter_unreferenced_storage_keys`

In `backend/documents/services.py:345-365`:
```python
def filter_unreferenced_storage_keys(
    storage_keys: set[str],
    organization_id: int,
    exclude_document_ids: Optional[list[int]] = None,
) -> set[str]:
    ...
    referenced_keys = set(
        Document.objects.filter(
            Q(organization_id=organization_id) &
            (Q(storage_key__in=keys_list) | Q(original_storage_key__in=keys_list))
        ).values_list('storage_key', flat=True)
    )
```

#### Problem Mechanics
`is_storage_key_referenced(storage_key)` checks:
```python
if storage_key.endswith('_hls'):
    doc_qs = doc_qs | Document.objects.filter(
        Q(organization_id=organization_id) &
        (Q(storage_key__startswith=f"{storage_key}/") | Q(original_storage_key__startswith=f"{storage_key}/"))
    )
```
However, in `filter_unreferenced_storage_keys`, all queries perform an exact `__in=keys_list`. If an `_hls` directory key is passed into `filter_unreferenced_storage_keys` (as enqueued during folder or document cleanup), the query will never match version storage keys like `org/doc_hls/playlist.m3u8`. If another document or version shared this prefix, it would be falsely considered unreferenced and deleted.

#### Required Remediation
In `filter_unreferenced_storage_keys`, partition out any keys ending with `_hls` and verify them via `startswith` queries or iterate them using `is_storage_key_referenced`.

---

### 3. [LOW] Inline Import in `test_nda_gate.py`

In `backend/tests/sharelinks/test_nda_gate.py:224`:
```python
def test_nda_acceptance_recognized_with_different_email_casing(self, public_client, nda_share_link):
    from sharelinks.models import Viewer
```

#### Required Remediation
Move `Viewer` to the top-level import statement alongside `ShareLink, NDAAcceptance, ViewSession`.

---

## Positive Architecture & Consistency Highlights

1. **Storage Quota Calculation Consistency**:
   - `recalculate_user_document_size` now counts both active and soft-deleted documents (`Document.objects.filter(...)` without `.active()`). Because soft-deleted files stay on physical disk until permanently purged, this eliminates quota drift and negative balance crashes on purge.
   - Using `Greatest(Value(0), F('total_document_size') - size)` guarantees database-level protection against negative quota underflows.

2. **Viewer Email Normalization**:
   - Normalizing viewer emails (`.strip().lower()`) across models, querysets, serializers, and NDA acceptance checks fixes access denial when email casing differs between sessions.

3. **Secure Directory Deletion in Go File Server**:
   - `core/main.go` checks that paths are strictly clean and validates that the directory ends with `_hls` before invoking `os.RemoveAll`, preventing arbitrary directory traversal or accidental root deletions.

---

## Proposed Additions to Long-Term Memory

```markdown
# Proposed Additions to Long-Term Memory
[ ] Issue: Recalculating user storage quota (`recalculate_user_document_size`) excluded soft-deleted documents (`Document.objects.active()`), causing quota drift while trashed files still resided on disk and triggering negative quota upon permanent purge.
Prevention Rule: Storage quota recalculations and integrity checks must count all documents residing on disk (both active and trashed) until physically purged, and quota subtractions must use `Greatest(Value(0), F('total_document_size') - size)` to guarantee non-negative usage.
```
