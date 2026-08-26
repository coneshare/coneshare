# Contributing to Coneshare

Thank you for your interest in contributing to Coneshare! We welcome contributions of all kinds, including bug fixes, new features, documentation improvements, translations, and design updates.

---

## Code of Conduct

We are committed to providing a friendly, safe, and welcoming environment for everyone, regardless of experience level, gender, sexual orientation, disability, personal appearance, body size, race, ethnicity, age, religion, or nationality. Please treat fellow contributors and maintainers with respect and empathy.

---

## Development Setup

Coneshare is organized as a multi-service monorepo:
- `backend/`: Django + Django REST Framework API & Celery tasks
- `core/`: Go service for high-performance file proxying & streaming
- `frontend/`: React + Vite single-page application
- `portal/`: Next.js marketing and documentation site

### Quick Start with Docker

1. **Clone the repository:**
   ```bash
   git clone https://github.com/coneshare/coneshare.git
   cd coneshare
   ```

2. **Configure environment:**
   ```bash
   cp .env.template .env
   ```

3. **Start services:**
   ```bash
   make build
   make up
   ```

4. **Run migrations:**
   ```bash
   make migrate
   ```

---

## Testing Guidelines

Always run tests before opening a pull request to ensure everything remains green.

### Backend Tests
```bash
# Full test suite
COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend pytest

# Targeted test file
COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend pytest tests/path/to/test_file.py
```

### Frontend Tests
```bash
# Whitelisted test suite
COMPOSE_PROJECT_NAME=coneshare docker-compose exec frontend npm run test:whitelist

# Targeted test file
COMPOSE_PROJECT_NAME=coneshare docker-compose exec frontend npx vitest run src/tests/path/to/test.jsx
```

---

## Commit & Pull Request Guidelines

1. **Branch Naming:** Use clear branch names such as `feat/feature-name`, `fix/issue-description`, or `fix.bug_name`.
2. **Conventional Commits:** Format commit titles according to [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat(scope): ...` for new features
   - `fix(scope): ...` for bug fixes
   - `docs(scope): ...` for documentation changes
   - `test(scope): ...` for adding or updating tests
3. **Tests Required:** Include regression tests for all bug fixes and unit/integration tests for new features.

---

## Contributor Recognition

We recognize all forms of contributions (code, documentation, bug reports, design, translation, and community support) in our `README.md` Contributors list following the [All Contributors](https://allcontributors.org/) specification.

When your Pull Request is merged, maintainers will add you to the list. You are also welcome to add yourself in your PR or mention your preferred attribution in the PR description!

