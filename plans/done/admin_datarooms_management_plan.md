# 🏛️ Admin Panel: Organization-wide Dataroom Governance Plan

## 1. 📌 Architectural Overview & Motivation

In multi-user enterprise environments, Virtual Datarooms (VDRs) are critical organizational assets used for fundraising, M&A due diligence, audits, and external partner sharing.

### Problem Statement & Decoupling
- **Mental Model Collision**: Previously, the daily user workspace (`/datarooms`) and tenant-wide administrative oversight were mixed together.
- **Solution**: Strictly decouple the standard user workspace from enterprise governance:
  1. **User Workspace (`/datarooms`)**: Focuses exclusively on rooms the user personally participates in (**All My Rooms** = Created + Collaborated, **Created by Me**, **Shared with Me**), even for administrators.
  2. **Admin Panel (`/admin/datarooms`)**: Dedicated enterprise governance dashboard rendering a comprehensive tabular overview of all organization datarooms with management controls (ownership transfer, storage monitoring, quota adjustment, collaborator management, 1-click storage vault upgrades, and forced deletion).

---

## 2. 📍 Design Decisions Summary (from User Directives & `/grill-me`)

| Decision Area | Selected Strategy | Rationale |
| :--- | :--- | :--- |
| **Admin API Route Architecture** | **Dedicated `/api/v1/admin/datarooms/`** | Mounts `AdminDataroomViewSet` under `backend/datarooms/admin_urls.py` and `backend/backend/urls.py`. Guarantees zero circular dependencies between `core` and `datarooms`, enforces strict `IsAdmin` RBAC, and matches Coneshare's established admin API pattern. |
| **Admin Navigation & Supervisor Flow** | **Direct Navigation to Room Workspace** | Clicking a dataroom title opens `/datarooms/:id` directly (where Org Admins already have supervisor access to view and manage contents). `/admin/datarooms` stays focused on high-level tabular governance, KPIs, quotas, and admin actions. |
| **KPI & Data Architecture** | **Server-Side Aggregation & Decoupled Metrics** | Top 3 KPI cards (`Total Datarooms`, `Total Storage Consumed`, `Active Links`) are returned in the response metadata (`metrics`) by `AdminDataroomPagination` so they reflect the entire organization rather than being restricted to the current paginated page. |
| **Sorting & Pagination** | **Server-Side Multi-Column Sorting & Pagination** | Server-side ordering on all columns (`name`, `owner`, `collaborators`, `active_links`, `last_viewed`, `storage`, `created`) with smart initial click defaults (Text: `asc`; Numbers/Dates: `desc`). `last_viewed` uses `nulls_last=True` in both directions. |
| **High-Performance Query Architecture** | **Correlated Scalar Subqueries** | Avoided Cartesian explosion (`rooms × links × sessions × collabs`) by using isolated correlated scalar subqueries (`active_links_subquery`, `collaborators_subquery`, `last_viewed_subquery`, `doc_sum_subquery`). Reduced query latency from ~576ms to ~9ms (~64x speedup). |
| **Default Workspace Scoping** | **Strict Workspace Decoupling** | On `/datarooms` (default workspace), admins only see rooms they personally created or collaborate on (`all` = created + collaborated). Full tenant inventory is queried via `/api/v1/admin/datarooms/` on `/admin/datarooms`. |
| **Governance Action Menu** | **Comprehensive Governance Menu** | Row actions dropdown includes: *Open Workspace*, *Transfer Ownership* (`TransferOwnershipDialog`), *Adjust Storage Quota* (`AdjustStorageQuotaDialog`), *Manage Collaborators* (`ManageCollaboratorsDialog`), *Upgrade to System Vault* (for legacy v1 rooms), and *Delete Dataroom* (`ConfirmationDialog`). |
| **Storage Quota Adjustment** | **Dedicated Dialog with Presets** | Modal (`AdjustStorageQuotaDialog`) with a numeric input in MB, one-click preset buttons (`Unlimited (0)`, `500 MB`, `1 GB`, `5 GB`, `10 GB`), and real-time usage comparison. |
| **Storage Versioning & Badges** | **Minimalist Legacy-Only Badge** | Only legacy v1 rooms display the warning badge `[⚠️ User-Scoped]`. Normal v2 organization-scoped rooms render cleanly without an extra badge. |

---

## 3. 🖥️ UI / UX Specification (`/admin/datarooms`)

### 3.1 Navigation & Routing
- **Route**: `/admin/datarooms` (guarded by `ProtectedRoute` requiring `role === 'admin'`).
- **Nav Item**: Added to `AdminNav.jsx`:
  ```javascript
  { to: '/admin/datarooms', label: t('admin.datarooms') }
  ```

### 3.2 Overview KPI Cards
1. **Total Organization Datarooms**:
   - Total count of active datarooms across the tenant.
2. **Total Storage Consumed**:
   - Total physical storage bytes consumed across all datarooms (`formatBytes`).
3. **Active Links**:
   - Total unexpired active share links live across all organization datarooms.

### 3.3 Search & Filter Controls (Server-Side)
- **Search Input**: Live debounced (300ms) server query matching `name`, owner `name`, and owner `email`.
- **Status Filter Dropdown**:
  - `All Datarooms`
  - `Near Capacity (>80%)`: Rooms exceeding 80% of their configured storage quota (`annotated_storage_used_bytes >= quota_mb * 838861`).
  - `Unlimited Quota`: Rooms with `storage_quota_mb === 0`.
  - `User-Scoped Storage (v1)`: Legacy rooms requiring vault upgrade.

### 3.4 Governance Data Table Structure

| Column | Presentation / Sort Key | Description |
| :--- | :--- | :--- |
| **Dataroom Name** | Sortable (`name` / `-name`) | Clickable title navigating to `/datarooms/:id`. Renders warning badge `User-Scoped` for v1 rooms. |
| **Owner** | Sortable (`owner` / `-owner`) | Avatar + Name + Email (with fallback initial). |
| **Collaborators** | Sortable (`collaborators` / `-collaborators`) | Count badge with quick "+ Manage" trigger opening `ManageCollaboratorsDialog`. |
| **Active Links** | Sortable (`active_links` / `-active_links`) | Count of live active share links. |
| **Last Viewed** | Sortable (`last_viewed` / `-last_viewed`) | Relative time format (e.g. `2 days ago`). Unvisited datarooms display `-` and sort to bottom (`nulls_last=True`). |
| **Storage / Quota** | Sortable (`storage` / `-storage`) | Absolute storage used / configured quota + colored progress bar. |
| **Created** | Sortable (`created` / `-created`, default `-created`) | Date formatted creation timestamp. |
| **Actions** | Dropdown Menu (`MoreVertical` icon) | Open Room, Transfer Ownership, Adjust Storage Quota, Manage Collaborators, Upgrade Storage (v1 only), Delete Dataroom. |

### 3.5 Dialog Components
1. **`AdjustStorageQuotaDialog.jsx`**:
   - Displays current usage: `formatBytes(dataroom.storage_used_bytes)`.
   - Number input for Quota in MB (`0` = Unlimited).
   - Quick preset pills: `Unlimited (0)`, `500 MB`, `1 GB`, `5 GB`, `10 GB`.
   - Calls `updateAdminDataroom(dataroom.id, { storage_quota_mb: quota })`.
2. **`TransferOwnershipDialog.jsx`**: Searchable eligible user list and transfer confirmation.
3. **`ManageCollaboratorsDialog.jsx`**: Add/remove collaborators with admin permissions.
4. **Storage Upgrade Confirmation**: One-click upgrade triggering `upgradeAdminDataroomStorage(dataroom.id)`.
5. **Delete Confirmation**: `ConfirmationDialog` triggering `deleteAdminDataroom(dataroom.id)`.

---

## 4. 🔌 Backend API Contract & Acyclic Architecture

### 4.1 Architecture & Circular Dependency Prevention
To maintain clean unidirectional architecture (`datarooms` $\longrightarrow$ `core` without circular module imports):
- Admin viewsets and serializers live inside `backend/datarooms/` (`admin_views.py`, `admin_urls.py`).
- Root URLconf `backend/backend/urls.py` mounts `path('api/v1/admin/datarooms/', include('datarooms.admin_urls'))`.
- Cross-app interactions (e.g. `core.admin_views` referencing datarooms) use deferred local imports to avoid circular import cycles.

### 4.2 Endpoint Inventory

| Endpoint | Method | Role Guard | Purpose |
| :--- | :--- | :--- | :--- |
| `/api/v1/admin/datarooms/` | `GET` | Org Admin | Lists organization datarooms with server-side pagination, search, status filter, multi-column ordering, and KPI metrics. |
| `/api/v1/admin/datarooms/{id}/` | `GET/PATCH` | Org Admin | Inspects or updates name, branding, settings, or `storage_quota_mb`. |
| `/api/v1/admin/datarooms/{id}/` | `DELETE` | Org Admin | Purges dataroom, storage vault (`__datarooms__/<id>`), item orders, and link settings. |
| `/api/v1/admin/datarooms/{id}/transfer-ownership/` | `POST` | Org Admin | Transfers primary ownership to another teammate. |
| `/api/v1/admin/datarooms/{id}/upgrade-storage/` | `POST` | Org Admin | Migrates legacy v1 dataroom to v2 organization system storage vault. |
| `/api/v1/admin/datarooms/{id}/collaborators/` | `GET/POST` | Org Admin | Lists or invites collaborators. |
| `/api/v1/admin/datarooms/{id}/collaborators/{user_id}/` | `DELETE` | Org Admin | Removes a collaborator. |
| `/api/v1/admin/datarooms/{id}/eligible-collaborators/` | `GET` | Org Admin | Lists eligible users for collaboration / ownership. |
| `/api/v1/datarooms/` | `GET` | Authenticated | Standard user workspace listing (returns only datarooms created by `request.user` or where user is a collaborator). |

---

## 5. 🚀 Execution & Implementation Status

### Phase 1: Backend Implementation ✅ Completed
- [x] Created `backend/datarooms/admin_views.py` with `AdminDataroomViewSet`.
- [x] Created `backend/datarooms/admin_urls.py` registering `AdminDataroomViewSet`.
- [x] Mounted in `backend/backend/urls.py` (`/api/v1/admin/datarooms/`).
- [x] Scoped `DataroomViewSet.get_queryset` in `backend/datarooms/views.py` to participating rooms for user workspace list.
- [x] Implemented server-side pagination (`AdminDataroomPagination`) with organization metrics embedding.
- [x] Implemented multi-column ordering and search filtering.
- [x] Optimized query performance with correlated scalar subqueries (reduced latency from ~576ms to ~9ms).
- [x] Added unit tests in `backend/tests/datarooms/test_admin_views.py` (9/9 pass).

### Phase 2: Frontend API & Components ✅ Completed
- [x] Added admin dataroom API methods to `frontend/src/services/api.js`.
- [x] Created `frontend/src/components/admin/AdjustStorageQuotaDialog.jsx`.
- [x] Created `frontend/src/pages/AdminDataroomsPage.jsx`.
- [x] Added `/admin/datarooms` link to `frontend/src/components/admin/AdminNav.jsx`.
- [x] Added `/admin/datarooms` route in `frontend/src/App.jsx`.
- [x] Added interactive column sorting and debounced server-side search.
- [x] Added Active Links and Last Viewed columns with relative time formatting.
- [x] Synchronized all 4 locales (`en`, `zh-hans`, `de`, `ru`).

### Phase 3: Testing & Quality Assurance ✅ Completed
- [x] Added frontend unit tests in `frontend/src/tests/pages/AdminDataroomsPage.test.jsx`.
- [x] Registered test file in `frontend/vitest.whitelist.json`.
- [x] Executed full backend and frontend test suites with 100% passing results (9/9 pytest, 50/50 vitest).
