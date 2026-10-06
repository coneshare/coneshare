# Share Link View-Data Scoped Folder Plan

## Goal
Refactor share-link dataroom content loading to return items for one folder scope at a time, instead of returning the whole tree in one payload.

## Proposed Endpoint Behavior

Endpoint:
- `GET /api/v1/links/{slug}/view-data/`

Query params:
- `parent_id=<dataroom_folder_id>`: optional; if omitted, return root scope items.

Rationale:
- Use `parent_id` (stable ID) instead of path strings.
- Avoid rename/path encoding issues.
- Keep permission checks and queries simple.

## Response Contract (Scoped)

Keep existing high-level metadata:
- `link_type`, `id`, `name`
- `branding_banner`, `brand_primary_color`, `brand_secondary_color`, `brand_accent_color`
- `show_file_index`
- `link_settings`

Add/return scope-specific payload:
- `current_parent_id`
- `breadcrumbs`: ancestors from root to current folder
- `items`: only direct children of current scope, mixed folder/document list

Item ordering:
- Primary: `DataroomItemOrder.position` for `(dataroom, parent_folder=parent_id)`.
- Fallback: deterministic sibling order when no order rows exist for scope.

## Backend Changes

1. Update `sharelinks` view-data handler:
- Parse `parent_id`.
- Validate parent folder belongs to dataroom and is visible for this link.
- Compute visibility with existing rules (including hidden-folder descendant filtering).
- Fetch direct children only for that scope:
- folders where `parent=parent_id`
- docs where `folder=parent_id`

2. Apply scope-level ordering:
- Read `DataroomItemOrder` rows for same scope.
- Build ordered `items` list for siblings only.

3. Return breadcrumbs:
- Resolve ancestors for `parent_id` and include minimal fields (`id`, `name`).

## Frontend Changes

1. Update share-link viewer:
- Request root scope initially.
- On folder click, request `view-data?parent_id=<id>`.
- On breadcrumb click, request target ancestor scope.
- Render returned `items` directly (no global flatten assumptions).

2. Keep index display logic:
- Use `show_file_index` toggle for rendering only.

## Rollout Strategy

1. Implement scoped response first while preserving route.
2. Update frontend viewer to use scoped navigation requests.
3. Remove remaining flat-tree assumptions from viewer logic.
4. Optionally add temporary fallback flag only if needed during transition.

## Test Plan

Backend tests:
- Root scope returns only root direct children.
- Nested `parent_id` returns only that folder’s direct children.
- Invalid/foreign/invisible `parent_id` rejected.
- Scope ordering uses `DataroomItemOrder` and fallback works if rows missing.
- Breadcrumbs are correct for nested scopes.

Frontend tests:
- Initial root load.
- Folder navigation triggers scoped request.
- Breadcrumb navigation triggers scoped request.
- Ordering and file index render correctly for each scope.
