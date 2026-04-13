# ConeShare OpenAPI Guide

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

## Where To Find API Docs

- Raw OpenAPI spec: `backend/docs/api/openapi.yaml`
- Live Swagger UI: `/api/schema/swagger/`
- Raw endpoint from running backend: `/api/schema/`

## Team Workflow

When backend API contract changes:
1. Run `make api.schema`
2. Run `make api.schema.validate`
3. Commit updated `backend/docs/api/openapi.yaml` with the API change

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
