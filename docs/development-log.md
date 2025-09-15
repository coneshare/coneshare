# Development Log

This document tracks the key architectural decisions and implementation steps made during the initial setup of the Coneshare backend.

## Session 1: Core Model & API Setup (2025-09-15)

### 1. Data Model Refactoring
- **Abstract Base Model**: To promote code reuse, the common fields `id` (ULID), `created_at`, and `updated_at` were extracted from the `Organization` model into an abstract `BaseModel`. `Organization` now inherits from this base model.
- **User Model**: The custom `User` model, inheriting from `AbstractUser`, was updated to include an `updated_at` field for consistency.

### 2. Testing Framework
- **Switch to Pytest**: The project was configured to use `pytest` as the primary test driver instead of Django's default test runner.
- **Centralized Test Directory**: All tests were moved from individual app directories to a central `backend/tests/` directory for better organization.
- **Dependencies**: `pytest` and `pytest-django` were added to `requirements.txt`.
- **Configuration**: A `pytest.ini` file was created to specify the Django settings module for the test runner.
- **Initial Tests**: Unit tests were written for the core models (`Organization`, `User`, `UserGroup`) and API views, covering creation, relationships, and basic CRUD operations.

### 3. API Implementation (CRUD)
- **Serializers**: Django Rest Framework (DRF) serializers were created for the `Organization`, `User`, and `UserGroup` models. The `UserSerializer` includes logic to handle password hashing.
- **Views**: DRF `ModelViewSet`s were implemented to provide standard CRUD (Create, Read, Update, Delete) endpoints for the core models.
- **URLs**: API endpoints were registered using a `DefaultRouter` and exposed under the `/api/v1/` URL namespace.

### 4. Self-Hosted Architecture Simplification
- **Single Organization Model**: A key decision was made to simplify the application for the self-hosted use case by assuming a single, pre-existing organization.
- **Read-Only Organization API**: The `OrganizationViewSet` was changed to a `ReadOnlyModelViewSet` to prevent users from creating, updating, or deleting organizations via the API.
- **Automatic User Onboarding**: The `UserSerializer` was modified to automatically assign the default organization to newly created users, removing the need for the client to provide an `organization_id`.

### 5. Default Organization Creation
- **Initial Approach (Data Migration)**: A data migration was first used to create the default organization. This was found to be fragile, as resetting migrations would remove this setup step.
- **Second Approach (`AppConfig.ready`)**: The logic was moved to the `CoreConfig.ready()` method. This caused `OperationalError` and `RuntimeWarning` because it accessed the database during application startup before migrations might have run.
- **Final Solution (`post_migrate` Signal)**: The logic was correctly moved into a `post_migrate` signal handler. This ensures the "Default Organization" is created only after the `core` app's migrations have been successfully applied, which is the robust and recommended Django pattern.

### 6. Development Workflow Improvements
- **Makefile**: The project's `Makefile` was updated with two new commands to streamline development:
  - `make clean`: Removes Python cache files (`.pyc`), old migration files, and the SQLite database.
  - `make test`: Executes the `pytest` test suite within the backend Docker container.

---
