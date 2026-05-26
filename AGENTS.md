# Repository Guidelines

## Project Structure & Module Organization
This repository is a multi-service monorepo.
- `backend/`: Django + DRF API (`core`, `documents`, `sharelinks`, `datarooms`, etc.), Celery tasks, and Python tests in `backend/tests/` and BDD tests in `backend/bdd/`.
- `core/`: Go file service (`main.go`) for upload/download and secure file operations.
- `frontend/`: Vite + React SPA (`src/pages`, `src/components`, `src/services`) with unit/component tests in `frontend/src/tests/`.
- `portal/`: Next.js marketing/docs site (`app/`, `components/`, `public/`).
- `e2e/`: Playwright end-to-end tests.
- `docs/` and `plans/`: architecture notes, implementation docs, and feature plans.

## Build, Test, and Development Commands
Use Docker-based workflows from the repository root unless you are iterating inside a single package.
- `make build`: build service images.
- `make up` / `make down`: start/stop the full stack.
- `make migrate`: run Django migrations.
- `make test`: run backend pytest suite in container.
- Targeted backend test in container (example):
  - `COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend pytest -q tests/filerequests/test_views.py`
- `make test.front`: run frontend Vitest suite in container.
- Targeted frontend test in container (example):
  - `COMPOSE_PROJECT_NAME=coneshare docker-compose exec frontend npm test -- --run src/tests/pages/PublicUploadPage.test.jsx`
- `make lint.portal`: run portal ESLint.
- `make logs`: follow service logs.

Local package commands:
- `cd frontend && npm run dev|build|test|lint`
- `cd portal && npm run dev|build|lint`
- `cd e2e && npm test`

## Coding Style & Naming Conventions
- Python: PEP 8, 4-space indentation, `snake_case` for functions/modules, `PascalCase` for classes.
- React/JS: follow `frontend/eslint.config.js`; components and pages use `PascalCase` filenames (for example `DocumentsPage.jsx`), hooks use `useXxx` (for example `useSortedList.js`).
- Keep app/domain modules cohesive (serializers, views, models grouped per Django app).

## Testing Guidelines
- Migration workflow note: do not auto-generate migration files in agent changes; schema migration files are created/run manually by the maintainer.
- Backend: `pytest` + `pytest-django`; test discovery from `backend/tests` and `backend/bdd` (`test_*.py`, `*_tests.py`).
- Frontend: `vitest` + Testing Library; place tests under `frontend/src/tests/**` and use `*.test.jsx|js`.
- E2E: Playwright specs in `e2e/tests/`.
- Add/adjust tests with every behavior change, especially for permissions, sharing, and file operations.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commits (`feat:`, `fix:`, `chore(scope): ...`). Keep commits small and scoped by service.

PRs should include:
- clear summary and motivation;
- linked issue (if applicable);
- test evidence (`make test`, `make test.front`, or targeted command output);
- UI screenshots/GIFs for frontend or portal changes;
- migration/config notes when schema or env vars change.

## Security & Configuration Tips
- Copy `.env.template` to `.env`; never commit secrets.
- Report security issues privately via `dev@coneshare.com`.
- Re-check access control paths when changing share links, dataroom permissions, upload/download, or cloud provider integrations.
