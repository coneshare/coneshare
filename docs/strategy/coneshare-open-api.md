# Coneshare OpenAPI Contract Workflow

## Strategy refs
- [Coneshare Roadmap](./coneshare-roadmap.md)
- [Coneshare Technology Stack](./coneshare-techstack.md)
- [Coneshare Data Model](../coneshare-data-model.md)

## Out of scope
- Endpoint-by-endpoint business semantics documentation for each domain app.
- Full elimination of all schema generation warnings in one pass.
- Client SDK generation/distribution process.
- External partner API lifecycle/versioning policy.

## Design decisions
- Decision: Treat generated OpenAPI schema as a versioned contract artifact.
  Rationale: Keeps frontend/integration consumers aligned with backend changes.
  Tradeoff: Requires disciplined schema regeneration and review in API-change PRs.
- Decision: Use `drf-spectacular` as the schema generation and serving implementation.
  Rationale: Native DRF integration and strong OpenAPI compatibility.
  Tradeoff: Requires explicit annotation on custom APIViews/viewsets to avoid missing endpoints.
- Decision: Keep schema validation in developer workflow (`make api.schema`, `make api.schema.validate`) even without strict CI enforcement for now.
  Rationale: Preserves contract quality while allowing incremental warning cleanup.
  Tradeoff: Compliance depends on team discipline until CI enforcement is re-enabled.
- Decision: Derive the public website API Reference (`portal/`) from a curated build-time filter script (`portal/scripts/generate-public-openapi.py`) rather than linking end-users to backend Swagger UI or rendering the raw internal spec directly.
  Rationale: Excludes admin, internal health/schema, and SPA session/OAuth-flow routes from customer-facing docs while keeping endpoint payloads, parameters, and request examples statically generated alongside `backend/docs/api/openapi.yaml`.
  Tradeoff: Backend API changes require re-running the portal sync script so `portal/lib/openapi-public.json` stays current.

## What We Implemented

We introduced OpenAPI schema generation for backend APIs and made it usable as a shared contract.

Completed work:
- Integrated `drf-spectacular` into Django/DRF settings.
- Added schema endpoints:
  - `GET /api/schema/`
  - `GET /api/schema/swagger/`
- Added Make targets:
  - `make api.schema`
  - `make api.schema.validate`
- Generated and versioned schema at:
  - `backend/docs/api/openapi.yaml`
- Annotated APIViews and viewsets with explicit schema metadata so generation no longer drops endpoints.
- Grouped endpoints by app using tags:
  - `core`, `documents`, `datarooms`, `sharelinks`, `cloudfiles`, `filerequests`, `analytics`, `automations`.
- CI schema enforcement job was added first, then intentionally removed for now (not enforced in current version).
- Added Portal public API documentation pipeline & bilingual UI (`portal/`):
  - Generator script: `portal/scripts/generate-public-openapi.py`
  - Curated outputs:
    - `portal/lib/openapi-public.json` (grouped bilingual UI catalog consumed by Next.js pages)
    - `portal/public/openapi.json` (curated OpenAPI `3.0.3` public spec subset)
  - Bilingual static portal routes:
    - `/api-reference` (`portal/app/api-reference/page.js`)
    - `/zh/api-reference` (`portal/app/zh/api-reference/page.js`)
  - Shared UI & helpers:
    - `portal/components/ApiReferenceViews.js`
    - `portal/components/ApiReferenceClient.js`
    - `portal/lib/api-reference-utils.js`
    - Verified by `portal/src/tests/api-reference.test.jsx`

## Where To Find API Docs

- Public developer portal (bilingual static site): `/api-reference` (English) and `/zh/api-reference` (Chinese)
- Curated public UI catalog & OpenAPI JSON: `portal/lib/openapi-public.json`, `portal/public/openapi.json`
- Full raw OpenAPI spec (internal + public): `backend/docs/api/openapi.yaml`
- Live Swagger UI (backend engineering & local debugging): `/api/schema/swagger/`
- Raw endpoint from running backend: `/api/schema/`

## Team Workflow

### 1) Update Backend OpenAPI Contract

When backend API endpoints, serializers, query parameters, or schemas change:
1. Run `make api.schema`
2. Run `make api.schema.validate`
3. Inspect the diff in `backend/docs/api/openapi.yaml`

### 2) Sync Official Portal API Reference (`portal/`)

When public REST API endpoints change (added, modified, deprecated, or removed):
1. Regenerate the curated public catalog and spec from `backend/docs/api/openapi.yaml`:
   ```bash
   python3 portal/scripts/generate-public-openapi.py
   ```
   *(Requires `PyYAML` in the Python environment running the script. Optional positional args: `<source_yaml> <public_openapi_json> <ui_catalog_json>`.)*
2. If you added **new URL prefixes** on the backend, review filtering and categorization rules in `portal/scripts/generate-public-openapi.py`:
   - **Internal / admin / SPA-only / auth routes** (should stay hidden from public docs): add prefixes, exact paths, or `(path, method)` tuples to `EXCLUDED_PREFIXES`, `EXCLUDED_EXACT`, or `EXCLUDED_OPERATIONS`.
   - **New public REST endpoints**: ensure `categorize_path(path)` maps them to one of the keys in `CATEGORY_DEFS` (or add a new entry in `CATEGORY_DEFS` with English/Chinese titles and descriptions). Unmapped paths (`categorize_path` returning `None`) are intentionally skipped.
   - **Permission tier classification**: update `FULL_ACCESS_POST_PATHS` or `compute_tier_hint()` if specific non-`DELETE` endpoints require `full_access` API keys or anonymous (`public`) access.
   - *(Note: when both `PATCH` and `PUT` exist on the same path, the script keeps both in `portal/public/openapi.json` but omits the duplicate `PUT` card from `portal/lib/openapi-public.json`.)*
3. Verify portal unit tests and static build:
   ```bash
   make test.portal
   make portal
   ```
   - `make test.portal` executes `portal/src/tests/api-reference.test.jsx` along with the rest of the portal suite.
   - `make portal` builds the static Next.js site (`next build`) covering `/api-reference` and `/zh/api-reference`.
   - If you keep a long-running `portal` dev container open and see stale SSR HTML or missing CSS classes after edits, restart it (`COMPOSE_PROJECT_NAME=coneshare docker-compose restart portal`).
4. Commit `backend/docs/api/openapi.yaml`, `portal/lib/openapi-public.json`, `portal/public/openapi.json`, and any generator/UI updates in the same change set.

## Policy

For backend API contract changes, `backend/docs/api/openapi.yaml` must be regenerated, validated, and committed in the same change set. When the change affects public REST API endpoints, the synced portal artifacts (`portal/lib/openapi-public.json` and `portal/public/openapi.json`) must also be regenerated and verified with `make test.portal` and `make portal`.

## Common Use Cases

### 1) Discover endpoint contracts quickly

Use Swagger UI to inspect:
- required request fields
- response body shapes
- auth requirements
- status codes

This reduces guesswork for frontend and integration work.

### 2) Obtain JWT token (login)

Endpoint:
- `POST /api/v1/token/`

Request example:
```json
{
  "email": "owner@acme.com",
  "password": "your-password"
}
```

Response example:
```json
{
  "access": "<jwt-access-token>",
  "refresh": "<jwt-refresh-token>"
}
```

### 3) Use access token on protected APIs

Add header:
```http
Authorization: Bearer <jwt-access-token>
```

Example:
```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
  http://localhost:8000/api/v1/documents/
```

### 4) Refresh access token

Endpoint:
- `POST /api/v1/token/refresh/`

Request:
```json
{
  "refresh": "<jwt-refresh-token>"
}
```

Use returned new `access` token for subsequent requests.

### 5) Logout / invalidate refresh token

Endpoint:
- `POST /api/v1/logout/`

Request:
```json
{
  "refresh": "<jwt-refresh-token>"
}
```

Include `Authorization: Bearer <access-token>` as well.

## Notes

- OpenAPI generation currently has warnings, but schema errors are now `0` and spec validation passes.
- Warnings cleanup is deferred and can be handled incrementally later.
