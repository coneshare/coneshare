# Dataroom Enhancements Plan (Issue #152)

## Scope
Enhance datarooms with:
- Per-dataroom branding (banner + color theme)
- Owner-controlled custom ordering of dataroom items
- UI performance/layout improvements for large datarooms

## Current Baseline
Implemented already:
- Dataroom CRUD and content management in `backend/datarooms/`
- Dataroom frontend pages in `frontend/src/pages/DataroomsPage.jsx` and `frontend/src/pages/DataroomPage.jsx`
- Share-link integration, public viewer, and folder download flow

Gaps for Issue #152:
- No per-dataroom branding fields/UI
- No explicit mixed-item ordering model/API
- Dataroom list/detail UI still needs scalability optimization

## Implementation Plan

### 1. Backend schema changes
1. Add branding fields on `Dataroom`:
- `branding_banner` (nullable file/image)
- `brand_primary_color` (nullable string)
- `brand_secondary_color` (nullable string)
- optional `brand_accent_color` (nullable string)
- `show_file_index` (boolean toggle)

2. Add dedicated mixed-order table (new):
- `dataroom_item_order`
- Columns: `dataroom_id`, `parent_folder_id` (nullable), `item_type`, `folder_id` (nullable), `dataroom_document_id` (nullable), `position`
- Constraints:
- exactly one target set (`folder_id` xor `dataroom_document_id`)
- unique scope position: (`dataroom_id`, `parent_folder_id`, `position`)
- unique mapping row per folder/doc item

3. No eager backfill required:
- Keep legacy folder/doc list behavior when `show_file_index` is off.
- Initialize order rows lazily per scope on first reorder action when `show_file_index` is on.

### 2. Backend API and permissions
1. Extend serializers/viewsets to read/write branding fields.
2. Add branding validation:
- Color format validation (`#RRGGBB`, optionally `#RRGGBBAA`)
- Logo type/size checks

3. Add owner-only mixed reorder endpoint:
- `POST /api/v1/datarooms/{id}/reorder-items/`
- payload: `parent_id`, `ordered_items: [{type: folder|document, id}]`

4. Reorder rules:
- All item IDs must belong to the target dataroom
- Reordered items must share the same container scope (same parent folder/root)
- Payload must include all and only items in scope
- If scope has no order rows yet, create rows from the payload in one transaction
- If scope already has rows, update positions in one transaction
- Return 400 for invalid scope/payload, 403 for permission failures

5. List/read behavior:
- `show_file_index = false`: use legacy grouped response (`folders` then `documents`)
- `show_file_index = true`:
- if scope has order rows, return mixed ordered `items` by table positions
- if scope has no rows yet, fallback to deterministic legacy ordering until first reorder

### 3. Frontend updates
1. Add dataroom branding controls (banner upload/remove + color selectors) in dataroom settings/actions.
2. Apply dataroom brand variables to dataroom pages/components with fallback to default app theme.
3. Add manual ordering UX:
- Reorder modal with drag-and-drop in current list context
- Keyboard/fallback controls for accessibility
- Optimistic UI with rollback on API failure

### 4. UI optimization
1. Reduce expensive recomputation/re-renders in dataroom list/detail views.
2. Address known folder ancestor N+1 hotspot in backend serializer path logic.
3. Add large-list strategy (pagination or virtualization trigger) for dataroom item rendering.
4. Improve loading states/layout consistency for nested folder navigation.

### 5. Tests

Backend tests:
- Branding field validation and persistence
- Branding update permission checks
- Reorder endpoint behavior, lazy-init insert path, atomicity, and scope validation
- Invalid payload/error-path coverage

Frontend tests:
- Branding form interactions and theming application
- Reorder interaction and request payload correctness
- File index toggle behavior and ordered/unordered list fallback paths
- Optimistic update rollback on failed reorder
- Large-list rendering/perf smoke checks

## Delivery Sequence
1. Schema + new `dataroom_item_order` table
2. Serializer/viewset + mixed reorder endpoint + lazy-init ordering logic
3. Frontend API methods + branding/settings UI
4. Reorder modal UX + optimistic updates
5. Performance optimizations
6. Backend/frontend test updates and regression pass

## Extensibility Notes
- Keep branding fields grouped to support future custom domain/theme expansion.
- Keep reorder API and `dataroom_item_order` generic enough to extend to additional dataroom entities later.
