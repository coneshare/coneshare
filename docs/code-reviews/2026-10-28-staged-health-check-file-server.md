# Code Review: Staged Health Check File Server Probe (2026-10-28)

**Scope (staged):**
- `backend/core/views.py`
- `backend/tests/core/test_views.py`
- `core/main.go`
- `core/main_test.go`

**Summary:** `HealthCheckView` (`/api/v1/_health/`) now also probes the Go file server (`GET {CORE_API_URL}/health`) and returns 503 if it is down. The Go service gains a public `/health` route. The DB probe now runs `SELECT 1`. Tests were not executed during this review.

No hardcoded secrets. The Go `/health` route is intentionally unauthenticated and returns only `{"status":"ok"}`.

## Findings

| # | Severity | Location | Issue | Status |
|---|---|---|---|---|
| 1 | MEDIUM | `backend/tests/core/test_views.py` `test_health_check_all_healthy` | Makes a real HTTP call to `http://core:8080/health`; passes only when the Go service is running. Fails in CI or isolated runs. Patch `requests.get` to return 200. | Resolved |
| 2 | MEDIUM | `backend/core/views.py` L430-439 | `_health/` returns 503 when the file server is down. If used as backend liveness probe (Docker/K8s), a file-server outage restarts healthy backend pods. Keep `_health/` shallow (DB + Redis); add a separate readiness endpoint or `?deep=1` for the file-server check. See `plans/todo/k8s_horizontal_scaling_architecture_plan.md`. | Accepted |
| 3 | LOW | `backend/core/views.py` L437-438 | `except Exception: pass` hides failure reasons (same for db/redis probes). Log with `logger.warning(..., exc_info=True)`. `except (OperationalError, DatabaseError)` is redundant since `OperationalError` subclasses `DatabaseError`. | Resolved |
| 4 | LOW | `backend/requirements.txt` | `requests` is imported but not pinned (only `httpx==0.28.1`). Pin it or use `httpx`. | Resolved |
| 5 | LOW | `backend/docs/api/openapi.yaml` L60-65 | Description and response schema omit `file_server`. Regenerate. | Pending (Maintainer) |
| 6 | NIT | `test_views.py`, `main_test.go` | Extra trailing blank lines; Go handler ignores `w.Write` error (harmless). | Resolved |

## Proposed Prevention Rules (pending approval for `docs/tech_stack_guidelines.md`)
- Keep liveness probes shallow (own process, DB, Redis). Put downstream dependency checks in a separate readiness endpoint. Unit tests must mock all outbound HTTP calls and never rely on sibling containers.
- Pin every directly imported third-party package in `requirements.txt`; prefer the already-pinned `httpx`.
