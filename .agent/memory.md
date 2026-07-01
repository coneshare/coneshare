### [Initial Configuration] Active Workspace Constraints
- **Category:** Architecture Choice / Workflow Policy
- **Context/Implication:** Avoid cluttered database schema states during iterative code generation.
- **Resolution/Action:** Do not create Django migration files unless explicitly requested or supplied by the maintainer. When schema changes need migrations, call that out in the final session summary instead of generating files.

### [Target Execution Reference] Containerized Test Inventory
- **Category:** Custom Multi-Step Command Triggers
- **Context/Implication:** Running isolated backend or frontend test suites within the localized Docker environment.
- **Resolution/Action:** Use these exact target strings when executing sub-suite tests for the user:

#### Targeted Backend Test (pytest inside container)
```bash
COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend pytest -q tests/filerequests/test_views.py
```

#### Targeted Frontend Test (Vitest inside container)
```bash
COMPOSE_PROJECT_NAME=coneshare docker-compose exec frontend npm test -- --run src/tests/pages/PublicUploadPage.test.jsx
```

### 2026-06-28 Session Entry
- **Category:** Architecture Choice
- **Context/Implication:** Clicking folders in the document viewer's sibling sidebar navigated the user away to the folder list, disrupting the viewing context.
- **Resolution/Action:** Converted the sibling sidebar to a recursive, expandable folder tree using lazy-loaded folder content endpoints. Implemented test coverage in `DataroomViewer.test.jsx`.

### 2026-06-30 Session Entry
- **Category:** Gotcha
- **Context/Implication:** Frontend container tests are run against a specific whitelist. If newly created or updated frontend test files are not added to `vitest.whitelist.json`, they will be skipped during `make test.front` and CI/CD validation.
- **Resolution/Action:** Always append any newly added or modified Vitest test paths to the `whitelist` array inside `frontend/vitest.whitelist.json`.

### 2026-06-30 Session Entry
- **Category:** Gotcha
- **Context/Implication:** In Radix UI (`DropdownMenu.Item`), calling `e.preventDefault()` inside the `onSelect` callback prevents the default dropdown dismissal behavior, leaving the menu stuck open on the screen after the action is clicked.
- **Resolution/Action:** Avoid `e.preventDefault()` in `onSelect` when the dropdown should dismiss. Use only `e.stopPropagation()` if you need to prevent the click from bubbling to parent row event handlers, and add test assertions to check that the dropdown menu is dismissed upon clicking.

### 2026-07-01 Session Entry
- **Category:** Architecture Choice
- **Context/Implication:** Retaining clickable links and secure watermarking for server-side document previews.
- **Resolution/Action:** Created the hybrid plan at `plans/hybrid-preview-download-plan.md` using server-rendered image overlays for viewer links, and a configurable flattened rasterizer for high-security PDF downloads.

### 2026-07-01 Session Entry
- **Category:** Workflow Policy
- **Context/Implication:** Coding Style guidelines regarding Python imports.
- **Resolution/Action:** Imports should always be placed at the head of files, unless an import loop (circular import) issue requires inline/deferred imports.

### 2026-07-02 Session Entry
- **Category:** Command Trigger
- **Context/Implication:** Commands to run full and targeted test suites inside Docker containers.
- **Resolution/Action:**
  - **Full Backend Suite:** `COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend pytest`
  - **Targeted Backend Test File:** `COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend pytest <path_to_test_file>.py`
  - **Targeted Backend Test Case:** `COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend pytest <path_to_test_file>.py -k <test_case_name>`
  - **Full Frontend Suite (Whitelist):** `COMPOSE_PROJECT_NAME=coneshare docker-compose exec frontend npm run test:whitelist`
  - **Targeted Frontend Test File:** `COMPOSE_PROJECT_NAME=coneshare docker-compose exec frontend npx vitest run <path_to_test_file>.test.jsx`
