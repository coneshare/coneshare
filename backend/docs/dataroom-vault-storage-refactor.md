# Dataroom Vault Storage — Design Review & Refactor Plan

> **Status:** Design revised after peer review — see §9 for corrections before implementing.
> **Context:** Internal design discussion, September 2026.
> **Scope:** `documents.Folder` vault detection, `datarooms.Dataroom` vault linkage, admin page architecture.

---

## 1. Problem Context

### 1.1 The Folder Invariant

The v2 dataroom system vault relies on a structural property of `documents.Folder` to identify vault documents **without recursive tree traversal**:

```
folder.created_by_id IS NULL  AND  folder.parent_id IS NOT NULL  →  vault folder
```

Implemented in `backend/documents/services.py`:

```python
def is_dataroom_vault_document(document: Document) -> bool:
    folder = document.folder
    return bool(folder and folder.created_by_id is None and folder.parent_id is not None)
```

And in `recalculate_user_document_size()`:

```python
.exclude(folder__created_by__isnull=True, folder__parent__isnull=False)
```

### 1.2 Why It Was Introduced

The existing folder classes in self-hosted and production systems map cleanly to distinct field combinations:

| Category | Folder Name Examples | `parent` | `created_by` | In Refactor |
|---|---|---|---|---|
| **Org Root** | `__root__` | `None` | `None` | `folder_type='root'` |
| **Vault Folders** | `__datarooms__`, `<dataroom_id>`, subfolders | `__root__` or vault parent | `None` | `folder_type='vault'` |
| **Personal Folders** | User folders, legacy `Dataroom Uploads` | `__root__` or user parent | `<User>` | `folder_type='personal'` |

The combination `(created_by=None, parent IS NOT NULL)` was exclusive to vault folders, enabling O(1) detection without joins or tree traversal.

### 1.3 Demonstrated Failure — PR #328

PR #328 fixed a silent quota bug caused by the invariant not being automatically maintained. When `upgrade_dataroom_to_v2()` reparented legacy subfolders into the system vault, it did not clear `created_by` on the moved subfolders or their descendants. Because the quota exclusion only checks `document.folder.created_by`, not the full ancestor chain, documents nested inside those subfolders were not excluded — leaving the uploader's personal quota inflated with no error.

**Fix:** Explicitly bulk-update `created_by=None` on all moved subfolders and their descendants. The fix works, but it highlights that the invariant must be **actively policed at every write path** — there is no DB-level enforcement.

---

## 2. Identified Cons of the Invariant Approach

1. **No DB enforcement** — purely application-level convention. Any code path that creates a `Folder` with `created_by=None` and a `parent_id` silently becomes a vault folder.
2. **Invisible to schema readers** — nothing in `documents/models.py` indicates `created_by=None` means "system vault", not just "optional owner".
3. **Fragile implicit convention** — detection relies entirely on column nullability rather than explicit semantic intent, making query maintenance error-prone.
4. **Per-node requirement** — every folder in a vault subtree must have `created_by=None`. Reparenting alone does not enforce this; every write path must do it manually (as PR #328 demonstrated).
5. **Vault ↔ Dataroom join is a naming convention** — the vault folder is found by `folder.name == str(dataroom.id)` under `__datarooms__`. This is fragile; renaming or a data inconsistency breaks the link.
6. **Admin/debug queries require structural guessing** — finding all vault folders, detecting orphans, and joining back to `Dataroom` records all require reconstructing the tree convention at query time.

---

## 3. Constraints on the Solution

| Constraint | Source |
|---|---|
| `documents` module must NOT import `datarooms` | Layering rule: `datarooms` is a higher-level module. Dependency must be one-way. |
| Vault admin/debug page needed (list storage, detect orphans, health checks) | Requires a real FK join from `Dataroom` to its vault `Folder`, not a name convention. |
| v2 is unreleased; small number of v2 datarooms in production | Data migration is acceptable — migration touches only a handful of rows, runs in milliseconds. |

---

## 4. Options Explored

### Option 1 — Application-layer hardening only (no DB changes)
- Custom `FolderManager` with `vault()` queryset
- Factory method `create_vault_folder()` to enforce `created_by=None`
- Runtime assertions in vault services

**Verdict:** Improves discipline but the detection logic still relies on the implicit invariant.

### Option 2 — `is_vault` BooleanField with legacy fallback (schema migration only)
- Add `is_vault = BooleanField(default=False)` to `Folder`
- Detection: `folder.is_vault OR (created_by=None AND parent IS NOT NULL)`
- New vault folders set `is_vault=True`; existing rows rely on fallback

**Verdict:** Better than Option 1, but still carries the fallback indefinitely. `is_vault` is also a boolean rather than an explicit categorical classification.

### Option 3 — `CheckConstraint` only (schema migration only)
- Documents the invariant at DB level but doesn't add a new discriminator column

**Verdict:** Useful as a safety net but doesn't solve the core query and domain clarity problems.

### Option 4 — `dataroom` FK on `documents.Folder` (rejected)
- Add `dataroom = OneToOneField(Dataroom)` directly to `Folder`
- **Rejected:** Creates a circular dependency — `documents` would import `datarooms`, violating the layering rule.

---

## 5. Chosen Design

### 5.1 `folder_type` CharField on `documents.Folder`

`folder_type` is a storage-layer classification — it describes what the folder *is* within the document storage hierarchy. It belongs in `documents` and contains no reference to `datarooms`.

```python
# documents/models.py
class Folder(BaseModel):
    FOLDER_TYPE_ROOT     = 'root'
    FOLDER_TYPE_PERSONAL = 'personal'
    FOLDER_TYPE_VAULT    = 'vault'

    FOLDER_TYPE_CHOICES = [
        (FOLDER_TYPE_ROOT,     'Org Root'),
        (FOLDER_TYPE_PERSONAL, 'Personal'),
        (FOLDER_TYPE_VAULT,    'System Vault'),
    ]

    folder_type = models.CharField(
        max_length=20,
        choices=FOLDER_TYPE_CHOICES,
        default=FOLDER_TYPE_PERSONAL,
        db_index=True,
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(folder_type='root',     parent__isnull=True,  created_by__isnull=True)  |
                    Q(folder_type='personal', created_by__isnull=False)                       |
                    Q(folder_type='vault',    parent__isnull=False, created_by__isnull=True)
                ),
                name='folder_type_structural_invariant',
            )
        ]
```

> **Note on `personal` condition:** `personal` folders only require `created_by__isnull=False`. While standard API creation via `FolderViewSet.perform_create` defaults `parent` to `__root__`, omitting `parent__isnull=False` at the DB level allows direct ORM calls, test fixtures, and batch scripts to instantiate personal folders without breaking on an unsupplied `parent`. Since `vault` strictly enforces `created_by=None` and `root` strictly enforces `parent=None, created_by=None`, there is zero collision risk.


### 5.2 `vault_folder` OneToOneField on `datarooms.Dataroom`

The FK lives in `datarooms` (the higher-level module), pointing down to `documents.Folder`. Dependency direction is preserved.

```python
# datarooms/models.py
class Dataroom(BaseModel):
    ...
    vault_folder = models.OneToOneField(
        'documents.Folder',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='owned_dataroom',  # reverse ORM accessor — no import needed in documents
    )
```

### 5.3 Clean detection functions (no fallback)

```python
# documents/services.py — zero knowledge of datarooms

def is_dataroom_vault_document(document: Document) -> bool:
    return bool(document.folder_id and document.folder.folder_type == 'vault')

def recalculate_user_document_size(user: User) -> int:
    with transaction.atomic():
        locked_user = User.objects.select_for_update().get(pk=user.pk)
        qs = Document.objects.active().filter(created_by=locked_user).exclude(
            folder__folder_type='vault'
        )
        actual_size = qs.aggregate(total=Sum('file_size'))['total'] or 0
        locked_user.total_document_size = max(0, actual_size)
        locked_user.save(update_fields=['total_document_size'])
        user.total_document_size = locked_user.total_document_size
        return user.total_document_size
```

### 5.4 Admin page queries (all via `datarooms` module)

```python
# Storage usage per dataroom (aggregates via DataroomDocument to cover all subfolder depths; see §9 Flaw B)
Dataroom.objects.annotate(
    storage_bytes=Sum(
        'documents__document__file_size',
        filter=Q(documents__document__deleted_at__isnull=True)
    ),
    document_count=Count(
        'documents__document',
        filter=Q(documents__document__deleted_at__isnull=True),
        distinct=True
    ),
)

# Orphaned vault folders (only direct children under the __datarooms__ container missing a Dataroom pointer; see §9 Flaw A)
vault_container = Folder.objects.filter(folder_type='vault', parent__folder_type='root').first()
Folder.objects.filter(
    parent=vault_container,
    owned_dataroom__isnull=True
)

# v2 datarooms missing a vault_folder link (integrity alert)
Dataroom.objects.filter(storage_version=2, vault_folder__isnull=True)

# Invariant violations (structural mismatch — data quality check)
Folder.objects.filter(
    created_by__isnull=True,
    parent__isnull=False,
).exclude(folder_type='vault')
```

---

## 6. Migration Plan (Streamlined 2-Phase Plan)

Instead of a multi-stage zero-downtime ceremony across 5+ steps, the migration is executed via **two coordinated, self-contained app migrations** respecting the dependency DAG:

1. **`documents` app migrates first** (low-level foundation): adds column $\rightarrow$ backfills types $\rightarrow$ attaches `CheckConstraint`.
2. **`datarooms` app migrates second** (high-level): adds `vault_folder` FK $\rightarrow$ backfills links for v2 datarooms (depends on `documents` migration).
3. **Code cleanup**: removes structural invariant fallback from service functions.

---

### Step 1 — `documents` Migration (`0008_folder_folder_type_and_invariant`)

Combines schema addition, data backfill, and constraint enforcement in a single migration:

```python
# backend/documents/migrations/0008_folder_folder_type_and_invariant.py

def backfill_folder_types(apps, schema_editor):
    Folder = apps.get_model('documents', 'Folder')
    # Org roots
    Folder.objects.filter(created_by__isnull=True, parent__isnull=True).update(folder_type='root')
    # Vault folders (system vault container and room trees)
    Folder.objects.filter(created_by__isnull=True, parent__isnull=False).update(folder_type='vault')
    # Everything else is personal (already defaulted, ensure clean state)
    Folder.objects.filter(folder_type__isnull=True).update(folder_type='personal')


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0007_alter_document_unique_together_and_more'),
    ]

    operations = [
        # 1. Add column with default='personal' (unconstrained initially)
        migrations.AddField(
            model_name='folder',
            name='folder_type',
            field=models.CharField(
                choices=[('root', 'Org Root'), ('personal', 'Personal'), ('vault', 'System Vault')],
                db_index=True,
                default='personal',
                max_length=20,
            ),
        ),
        # 2. Backfill existing rows so roots and vaults satisfy invariant
        migrations.RunPython(backfill_folder_types, reverse_code=migrations.RunPython.noop),
        # 3. Attach CheckConstraint now that data is clean
        migrations.AddConstraint(
            model_name='folder',
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(folder_type='root', parent__isnull=True, created_by__isnull=True) |
                    models.Q(folder_type='personal', created_by__isnull=False) |
                    models.Q(folder_type='vault', parent__isnull=False, created_by__isnull=True)
                ),
                name='folder_type_structural_invariant',
            ),
        ),
    ]
```

---

### Step 2 — `datarooms` Migration (`0006_dataroom_vault_folder`)

Adds the `vault_folder` OneToOneField and backfills it for all existing v2 datarooms. Explicitly depends on `documents.0008` so Django runs `documents` first in the migration DAG:

```python
# backend/datarooms/migrations/0006_dataroom_vault_folder.py

def backfill_vault_folder(apps, schema_editor):
    Dataroom = apps.get_model('datarooms', 'Dataroom')
    Folder = apps.get_model('documents', 'Folder')

    vault_root = Folder.objects.filter(name='__datarooms__', folder_type='vault').first()
    if not vault_root:
        return

    for dataroom in Dataroom.objects.filter(storage_version=2).select_related('organization'):
        vault_folder = Folder.objects.filter(
            organization=dataroom.organization,
            parent__name='__datarooms__',
            name=str(dataroom.id),
            folder_type='vault'
        ).first()
        if vault_folder:
            dataroom.vault_folder = vault_folder
            dataroom.save(update_fields=['vault_folder'])


class Migration(migrations.Migration):

    dependencies = [
        ('datarooms', '0005_dataroom_storage_quota_mb_dataroom_storage_version_and_more'),
        ('documents', '0008_folder_folder_type_and_invariant'),  # Enforces documents runs first
    ]

    operations = [
        migrations.AddField(
            model_name='dataroom',
            name='vault_folder',
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='owned_dataroom',
                to='documents.folder',
            ),
        ),
        migrations.RunPython(backfill_vault_folder, reverse_code=migrations.RunPython.noop),
    ]
```

> The `__datarooms__` name sentinel is used **only once** — inside this migration — to bootstrap the FK. After this, no runtime code relies on folder names.

---

### Step 3 — Service Code Cleanup

Delete the `created_by_id is None and parent_id is not None` condition from:
- `is_dataroom_vault_document()`
- `recalculate_user_document_size()`

And update `get_or_create_dataroom_storage_folder()` to use `Folder.get_or_create_vault_subfolder()`.

---

## 7. Net Code Cleanup

| Site | Before | After |
|---|---|---|
| `is_dataroom_vault_document()` | 2-branch condition (explicit + fallback) | `folder.folder_type == 'vault'` |
| `recalculate_user_document_size()` | Double `Q()` exclude | `.exclude(folder__folder_type='vault')` |
| Vault folder enumeration | Find `__datarooms__` by name, traverse children | `Folder.objects.filter(folder_type='vault')` |
| Join Dataroom ↔ Folder | Parse `folder.name` as ULID | `dataroom.vault_folder` OneToOneField |
| Orphan detection | Manual tree inspection | `Folder.objects.filter(parent=vault_container, owned_dataroom__isnull=True)` |
| `is_direct_upload_dataroom_document()` | Ancestor while-loop tree traversal | `doc.folder.folder_type == 'vault'` |
| `sync_dataroom_folder_rename()` | Reconstructs path list from root | Resolves relative to `dataroom.vault_folder` |
| DB enforcement | None (application convention only) | `CheckConstraint` on all three folder types |

---

## 8. Dependency Architecture (preserved)

```
datarooms  (high-level)
    │  imports / FKs to documents
    ↓
documents  (low-level — storage, quota, file ops)
    │  folder_type: storage-layer classification (no reference to datarooms)
    ✗  must NEVER import datarooms
```

`Dataroom.vault_folder` FK points DOWN (correct direction).
`related_name='owned_dataroom'` gives ORM reverse access on `Folder` without any import in `documents`.


---

## 9. Post-Review Corrections (Peer Review, September 2026)

> **Architectural Assessment:** The core data model (`Folder.folder_type` enum + `CheckConstraint` + `Dataroom.vault_folder` OneToOneField) is completely solid. The corrections below are strictly **function/query logic refinements** (scoping orphan queries, aggregating storage across nested subfolders, propagating vault types on subfolder creation, and relaxing personal folder parent nullability).

---

### Flaw A — Orphan Detection Query Flags All Valid Subfolders ✅ Confirmed

> **Data Model Impact:** **None.** The schema and foreign key relationships (`Folder.parent`, `Folder.owned_dataroom`, `Folder.folder_type`) are solid. This is purely a query-scoping refinement in admin diagnostics.

**Original query (§5.4):**
```python
Folder.objects.filter(folder_type='vault', owned_dataroom__isnull=True)
```

**Problem:** `owned_dataroom` is non-null only on the single folder directly pointed to by `Dataroom.vault_folder` — the room-level root (e.g. `__datarooms__/<room_id>/`). Every other vault folder in the tree has `owned_dataroom=None`:

```
__datarooms__/       folder_type='vault', owned_dataroom=None  ← false orphan
  <room_id>/         folder_type='vault', owned_dataroom=<Dataroom>  ← correct, NOT flagged
    SubfolderA/      folder_type='vault', owned_dataroom=None  ← false orphan
      NestedB/       folder_type='vault', owned_dataroom=None  ← false orphan
```

This query produces a 100% false-positive rate for all vault folders except room-level roots.

**Correction:** Scope to direct children of the vault container. Avoid the `name='__datarooms__'` sentinel in runtime code — use structural position instead:

```python
# The __datarooms__ container: a vault folder whose parent is the org root
vault_container = Folder.objects.filter(
    folder_type='vault',
    parent__folder_type='root'
).first()

# True orphans: direct children of the container with no Dataroom pointer
orphans = Folder.objects.filter(
    parent=vault_container,
    owned_dataroom__isnull=True
)
```

---

### Flaw B — Admin Storage Query Misses Nested Documents ✅ Confirmed

> **Data Model Impact:** **None.** The `DataroomDocument` membership table already tracks all documents associated with a dataroom regardless of folder nesting depth. This is purely an aggregation query refinement.

**Original query (§5.4):**
```python
Dataroom.objects.select_related('vault_folder').annotate(
    storage_bytes=Sum('vault_folder__documents__file_size'),
)
```

**Problem:** `Document.folder` is a FK to the **immediate parent** folder (`documents/models.py` L78). The reverse relation `vault_folder__documents` only returns documents whose direct parent is the vault root. Documents in any subfolder (`SubfolderA`, `NestedB`, etc.) are completely excluded.

**Correction:** Aggregate through `DataroomDocument`, which is the authoritative membership table for all documents regardless of subfolder depth:

```python
from django.db.models import OuterRef, Subquery, Sum, F

storage_subq = DataroomDocument.objects.filter(
    dataroom=OuterRef('pk')
).values('dataroom').annotate(
    total=Sum('document__file_size')
).values('total')[:1]

Dataroom.objects.annotate(storage_bytes=Subquery(storage_subq))
```

Or as a readable two-step query for the admin page (not a hot path):
```python
from django.db.models import Sum
Dataroom.objects.annotate(
    storage_bytes=Sum(
        'documents__document__file_size',
        filter=Q(documents__document__deleted_at__isnull=True)
    )
)
# 'documents' is the related_name on DataroomDocument.dataroom
```

---

### Flaw C — `default=FOLDER_TYPE_PERSONAL` Causes Runtime Crash on Vault Subfolder Creation ✅ Confirmed

> **Data Model Impact:** **None.** The schema definition and DB constraint (`folder_type='vault'` allowing `created_by=None`) are completely solid. This is purely an application method / service refinement (`get_or_create_vault_subfolder()` factory + explicit `folder_type` passing).

**Problem in §5.1:**
```python
folder_type = models.CharField(..., default=FOLDER_TYPE_PERSONAL)
```

After the migration, `get_or_create_dataroom_storage_folder()` creates subfolders with:
```python
Folder.objects.get_or_create(
    organization=organization,
    parent=current_folder,
    name=part,
    created_by=None             # no folder_type passed → default='personal'
)
```

`folder_type='personal'` with `created_by=None` violates the `folder_type_structural_invariant` CheckConstraint. This is a **runtime crash** (IntegrityError) on every direct upload with a subfolder path.

**Architectural Decision: Strict Explicit Assignment**

Per architectural review, we avoid magic auto-coercion in `Folder.save()`. Instead, all code and test paths creating vault folders must explicitly pass `folder_type=Folder.FOLDER_TYPE_VAULT`.

#### Fix 1 — Factory classmethod (primary, explicit)

Add a `get_or_create_vault_subfolder()` classmethod to `Folder`:

```python
# documents/models.py
@classmethod
def get_or_create_vault_subfolder(cls, *, organization, parent, name, **kwargs):
    """Sanctioned vault subfolder creation. Enforces folder_type and created_by invariant."""
    assert parent.folder_type == cls.FOLDER_TYPE_VAULT, (
        f"Parent folder {parent.id!r} is not a vault folder (got {parent.folder_type!r})."
    )
    return cls.objects.get_or_create(
        organization=organization,
        parent=parent,
        name=name,
        defaults={
            'folder_type': cls.FOLDER_TYPE_VAULT,
            'created_by': None,
            **kwargs
        }
    )
```

#### Fix 2 — Explicit Vault Creation in Services & Migrations

1. **`get_or_create_dataroom_storage_folder()`**:
   - If `dataroom.vault_folder` is already set, use it directly (O(1) lookup, no tree walking).
   - If `dataroom.vault_folder` is None (lazy allocation), create `__datarooms__` and room folder with `folder_type=Folder.FOLDER_TYPE_VAULT, created_by=None`, link `dataroom.vault_folder`, and save.
   - For relative subfolders, call `Folder.get_or_create_vault_subfolder()`.
2. **`upgrade_dataroom_to_v2()`**:
   - Explicitly update `folder_type=Folder.FOLDER_TYPE_VAULT` and `created_by=None` on all moved subfolders and their descendants.
   - Link `locked_dataroom.vault_folder = vault_room_folder`.
3. **`delete_dataroom()`**:
   - Use `dataroom.vault_folder` directly as the target storage folder.
4. **`sync_dataroom_folder_rename()`**:
   - Resolve physical folder starting from `dataroom.vault_folder` instead of walking down from org root.

---

### Flaw D — CheckConstraint Over-Specification on Personal Folders ✅ Resolved

> **Data Model Impact:** Refinement to the `Folder` `CheckConstraint` definition only—relaxing `personal` to `created_by__isnull=False` without requiring `parent__isnull=False`.

**Original constraint (§5.1):**
```python
Q(folder_type='personal', parent__isnull=False, created_by__isnull=False)
```

**Problem:**
While API folder creation in `FolderViewSet.perform_create()` defaults an omitted parent to `__root__`, `Folder.save()` does not auto-assign a parent on creation. Throughout backend tests, fixtures, and internal scripts, personal folders are frequently instantiated via `Folder.objects.create(name=..., created_by=user, organization=org)` without explicitly specifying `parent` (defaulting to `None`). Requiring `parent__isnull=False` causes immediate `IntegrityError` failures across existing tests and scripts.

**Correction:**
Loosen the `personal` branch to require only `created_by__isnull=False`:
```python
Q(folder_type='personal', created_by__isnull=False)
```
Because `vault` strictly mandates `created_by=None` and `parent IS NOT NULL`, and `root` strictly mandates `created_by=None` and `parent=None`, personal folders are completely disjoint from vault and root folders, introducing zero risk of collision.

---

### Revised Implementation Sequence (Plan B)

Following the peer review and grill alignment, the implementation executes in two coordinated migrations ordered by the Django dependency DAG, followed by runtime service updates:

**Phase 1 — `documents` App:**
1. Model updates in `backend/documents/models.py`:
   - `folder_type` CharField (choices: `root`, `personal`, `vault`; `default='personal'`)
   - `folder_type_structural_invariant` CheckConstraint (`root`, `personal`, `vault`)
   - `get_or_create_vault_subfolder()` classmethod
   - `clean()` method validation for `folder_type` invariants
2. Migration `documents.0008_folder_folder_type_and_invariant`:
   - `AddField('folder', 'folder_type', default='personal')`
   - `RunPython(backfill_folder_types)` (sets `'root'` and `'vault'`)
   - `AddConstraint(folder_type_structural_invariant)`

**Phase 2 — `datarooms` App:**
3. Model additions in `backend/datarooms/models.py`:
   - `vault_folder` OneToOneField on `Dataroom` pointing to `'documents.Folder'` (`null=True, blank=True, on_delete=models.SET_NULL, related_name='owned_dataroom'`)
4. Migration `datarooms.0006_dataroom_vault_folder`:
   - `AddField('dataroom', 'vault_folder', ...)`
   - `RunPython(backfill_vault_folder)` (links existing v2 datarooms to their vault folder)
   - Declares dependency on `documents.0008` (Django runs `documents` first)

**Phase 3 — Runtime Code Updates:**
5. Update `get_or_create_dataroom_storage_folder()` in `backend/datarooms/services.py`:
   - Direct lookup via `dataroom.vault_folder`
   - Lazy allocation & linking on demand for v2 rooms
   - Use `Folder.get_or_create_vault_subfolder()` for subfolders
6. Update `upgrade_dataroom_to_v2()` in `backend/datarooms/services.py`:
   - Update `folder_type='vault'` and `created_by=None` on all moved subfolders and descendants
   - Set `locked_dataroom.vault_folder = vault_room_folder`
7. Update `delete_dataroom()` in `backend/datarooms/services.py`:
   - Resolve target storage folder via `dataroom.vault_folder`
8. Update `sync_dataroom_folder_rename()` in `backend/datarooms/services.py`:
   - Resolve relative to `dataroom.vault_folder`
9. Clean up detection functions in `backend/documents/services.py`:
   - `is_dataroom_vault_document()`: `bool(doc.folder_id and doc.folder.folder_type == 'vault')`
   - `recalculate_user_document_size()`: `.exclude(folder__folder_type='vault')`
10. Update admin queries in `backend/datarooms/admin_views.py`:
    - Storage usage: `Sum('documents__document__file_size', filter=Q(documents__document__deleted_at__isnull=True))`
    - Orphan vault folders: `parent=vault_container, owned_dataroom__isnull=True`
11. Run test suite to verify end-to-end functionality.
