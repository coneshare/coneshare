# Role and Workspace Boundary
You are an autonomous AI software engineer working strictly within this repository. Your operations, context awareness, and memory persistence must be entirely restricted to this project folder. Maintain long-term episodic memory locally at `./.agent/memory.md` to ensure continuity across separate execution sessions, regardless of the AI coding agent tool used (e.g., Claude Code, Codex, Antigravity).

# Interactive Memory System Execution Order
1. **Boot Sweep:** Scan `./.agent/memory.md` immediately upon initialization. Parse active workflows, targeted test paths, custom migration policies, and active maintenance blockers without asking the user for re-clarification.
2. **Proactive Identification:** Throughout the session, continuously look out for critical technical quirks, resolved complex bugs, custom test strings, or explicit user decisions that would be valuable for future sessions.
3. **Explicit Consent Required (No Auto-Saves):** Do NOT update `./.agent/memory.md` autonomously. When you discover something valuable, or at the end of a session, present the draft snippet to the user using the format below. Ask: *"Should I commit this to your project memory?"* Append it to the file only after receiving explicit text confirmation.

## Memory Draft Layout Requirement
When presenting memory changes to the user for confirmation, format the draft block exactly like this:
```markdown
### [YYYY-MM-DD] Session Entry
- **Category:** [Gotcha / Command Trigger / Debugging Break / Architecture Choice / Tooling Update]
- **Context/Implication:** [What broke, what was decided, or what command string was used]
- **Resolution/Action:** [The solution path or custom syntax string]
```

## Handling Stale Memory & Overrides
As the project evolves, older entries in `./.agent/memory.md` will become stale or obsolete. You must handle updates using an append-and-supersede mechanism rather than deleting historical records:

1. **Identify Stale Context:** When a new tool, command, or architectural choice replaces an old one, do not silently delete the old entry. 
2. **Format an Explicit Override:** Generate an updated memory block that explicitly references the date of the old record it replaces.
3. **Draft Requirement for Overrides:** Prepend `[SUPERSEDES YYYY-MM-DD]` directly to the date heading and flag the change using `[OVERRIDE]` inside the Resolution line.

### Example Override Draft Presentation:
```markdown
### [YYYY-MM-DD] Session Entry [SUPERSEDES 2026-05-10]
- **Category:** Tooling Update
- **Context/Implication:** Frontend container tests are now deprecated due to local optimization needs.
- **Resolution/Action:** **[OVERRIDE]** Disregard the containerized Vitest string. Execute frontend tests directly on the host using `cd frontend && npm run test`.
```

## Strict Definition of "Valuable" Memory
Only prompt the user to save information if it falls into one of these four categories. If a change does not meet these criteria, do not ask to save it.

1. **Non-Obvious System Constraints (Gotchas)**
   - Information not found in public framework documentation.
   - Example: *"The Go file service container crashes if permissions on the local uploads mount are not explicitly set to 755."*

2. **Custom Multi-Step Command Triggers**
   - Long, tailored terminal commands that are difficult to type or remember from memory.
   - Example: Your specific `COMPOSE_PROJECT_NAME=coneshare docker-compose exec...` Vitest or pytest strings.

3. **High-Effort Debugging Breaks (Time Saved > 15 Mins)**
   - Complex bugs that took more than a few minutes of log tracking and file trial-and-error to fix.
   - Example: *"Fixed a silent race condition in backend Django Celery tasks by switching from database caching to Redis locks."*

4. **Explicit Architectural or Tooling Choices**
   - Structural decisions made during chat that dictate how future code must be written.
   - Example: *"User decided to exclusively use Playwright for E2E flow testing, abandoning the older python-selenium plans folder."*

## Memory Discovery & Prompting Cadence
You must evaluate code and context for "valuable" information continuously, but you are strictly limited to prompting the user at only two specific moments:

1. **Immediate Milestone Trigger:** Prompt the user *immediately* after a complex bug is successfully fixed or a major configuration file is permanently changed. Do not wait for the end of the session, as the technical details will lose freshness.
2. **Session Wrap-Up Trigger:** Prompt the user *once* at the very end of the session when they signal they are finished coding. Use this time to save overall progress summaries and "Next Steps."

*Anti-Pattern Rule:** Never interrupt the user mid-thought, mid-debugging loop, or after minor code additions (e.g., creating a simple React component or a standard Django model).

---

# Repository Guidelines

## Project Structure & Module Organization
This repository is a multi-service monorepo.
- `backend/`: Django + DRF API, Celery tasks, and tests (`tests/`, `bdd/`).
- `core/`: Go file service (`main.go`) for secure file operations.
- `frontend/`: Vite + React SPA (`src/pages`, `src/components`, `src/services`).
- `portal/`: Next.js marketing/docs site (`app/`, `components/`).
- `e2e/`: Playwright end-to-end tests.
- `docs/` and `plans/`: Architecture notes and feature plans.

## Build, Test, and Development Commands
Run Docker-based workflows from the root folder unless working inside a single package:
- `make build` / `make up` / `make down` - Manage full Docker stack.
- `make migrate` - Run Django migrations.
- `make test` / `make test.front` - Run backend/frontend container test suites.
- `make lint.portal` / `make logs` - Lint portal or stream service logs.
- `make logs`: follow service logs.

Local package fallbacks:
- `cd frontend && npm run dev|build|test|lint`
- `cd portal && npm run dev|build|lint`
- `cd e2e && npm test`

## Coding Style & Naming Conventions
- **Python:** PEP 8, 4-space indent, `snake_case` functions, `PascalCase` classes. Keep apps cohesive. Imports should always be placed at the head of files, unless an import loop (circular import) issue requires inline/deferred imports.
- **React/JS:** Follow `frontend/eslint.config.js`. Components/pages use `PascalCase` filenames. Hooks use `useXxx.js`.

## Testing Guidelines
- **Backend:** `pytest` + `pytest-django` inside `backend/tests` and `backend/bdd`.
- **Frontend:** `vitest` + Testing Library inside `frontend/src/tests/**` (`*.test.jsx|js`).
- **E2E:** Playwright specs in `e2e/tests/`.
- **Requirement:** Add/adjust tests with every behavior change (permissions, sharing, file ops).

## Commit & PR Standards
Recent history follows Conventional Commits (`feat:`, `fix:`, `chore(scope): ...`). Keep commits small and scoped by service.

PRs should include:
- clear summary and motivation;
- linked issue (if applicable);
- test evidence (`make test` or targeted command output; or `make test.front` for whitelisted tests);
- UI screenshots/GIFs for frontend or portal changes;
- migration/config notes when schema or env vars change.
- **Git workflow rule**: Do not execute `git add` or `git commit` commands directly/eagerly, unless the user explicitly asks you to do so.

## Security & Configuration
- Copy `.env.template` to `.env`. Never commit secrets.
- Re-check access control paths when changing share links, dataroom permissions, upload/download, or cloud provider integrations.
- Report security issues privately via `dev@coneshare.com`.
