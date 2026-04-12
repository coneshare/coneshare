# Plan: OpenAPI as Source of Truth

## 1. Pick schema engine and wire it into Django
- Use `drf-spectacular` (best fit for DRF viewsets/actions).
- Add dependencies in `backend/requirements*.txt`.
- Configure in Django settings:
  - `DEFAULT_SCHEMA_CLASS = "drf_spectacular.openapi.AutoSchema"`
  - `SPECTACULAR_SETTINGS` (title, version, auth scheme, tags, servers).
- Add schema endpoints in `backend/backend/urls.py`:
  - `/api/schema/` (raw OpenAPI)
  - `/api/schema/swagger/` or `/api/schema/redoc/` (optional UI).

## 2. Make schema quality contract-grade
- Add explicit serializers for request/response bodies where missing.
- Annotate custom actions (`copy`, `stats`, `view-sessions`, upload/finalize endpoints) with `@extend_schema`.
- Add examples and error responses (`400/401/403/404/5xx`) via `OpenApiExample`.
- Normalize operation IDs and tags by domain (`auth`, `documents`, `folders`, `actions`).

## 3. Generate and version the canonical spec
- Add script/Make target:
  - `make api.schema` -> outputs `docs/api/openapi.yaml`.
- Add validation target:
  - `make api.schema.validate` using `spectral` (or `openapi-spec-validator`).
- In CI:
  - regenerate schema
  - fail if diff exists and not committed
  - run schema lint/validation.

## 4. Derive artifacts from OpenAPI (not handwritten)
- Markdown reference:
  - generate from `docs/api/openapi.yaml` using `widdershins` (or `redocly` + template pipeline).
  - output `docs/api/reference.md`.
- Optional additional derived artifacts:
  - Postman collection via `openapi-to-postman`.
  - static HTML docs via Redoc (`docs/api/reference.html`).

## 5. Publish and link
- Replace manual “Document Model API Reference” maintenance with generated file notice.
- Update README/docs nav to point to generated artifacts.
- If `docs.coneshare.com` has a build pipeline, publish from generated markdown/html only.

## 6. Guardrails and ownership
- Add “API change checklist” in PR template:
  - update serializer annotations/examples
  - run `make api.schema`
  - commit schema/artifact diffs.
- Add contract tests to ensure key endpoints remain present with expected methods/statuses.

## Initial deliverables (first PR)
1. `drf-spectacular` integrated + `/api/schema/`.
2. `make api.schema` generating `docs/api/openapi.yaml`.
3. Generated `docs/api/reference.md` from schema.
4. CI job for schema generation + validation + diff check.
5. README links updated to generated reference.

## Suggested implementation split
1. schema generation + CI
2. markdown/postman generation + docs wiring
