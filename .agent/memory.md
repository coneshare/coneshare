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
