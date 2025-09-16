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

## Session 2: Document Management Implementation (2025-09-15)

### 1. Document App Architecture
- **Core Models**: Implemented `Document`, `Folder`, `ShareLink`, `Viewer`, and `View` models with ULID primary keys and organization-scoped relationships.
- **API Endpoints**: Created DRF ModelViewSets for all document-related models with:
  - Automatic organization assignment from authenticated user
  - Read-only timestamp fields
  - Nested URL structure under `/api/v1/`
- **Security**: All endpoints enforce authentication and organization scope checks

### 2. File Upload System
- **Storage Abstraction**: Implemented dual storage backend support (Filesystem/MinIO) configurable via environment variables
- **Upload Endpoint**: Created dedicated `/api/v1/uploads/document/` endpoint with:
  - Multi-part file upload handling
  - Automatic folder structure creation from path parameter
  - ULID-based unique file naming
  - Storage error handling
- **Async Processing**: Basic file status tracking implemented with 'ready' state

### 3. Testing Infrastructure
- **Model Tests**: Added comprehensive tests for document models and relationships
- **API Tests**: Implemented test cases for:
  - CRUD operations on documents/folders
  - File upload validation
  - Path-based folder creation
  - Organization-scoped data isolation
- **Test Data**: Created factory methods for organization, user, and document fixtures

### 4. Security & Configuration
- **Storage Security**: Configured S3-compatible storage with environment variables
- **Content Type Handling**: Added MIME type validation and storage
- **Path Sanitization**: Implemented safe folder path processing with Pathlib
- **Error Handling**: Added structured error responses for upload failures

---

## Session 3: API Scoping & Behavior-Driven Development (2025-09-16)

### 1. API Endpoint Scoping
- **User-Scoped Lists**: The `DocumentViewSet` and `ShareLinkViewSet` `get_queryset` methods were updated to filter by `created_by=request.user` instead of the user's organization. This ensures users can only list their own documents and share links.
- **Scoping Tests**: Unit tests were added to `tests/documents/test_views.py` to confirm this behavior. A second user was added to the test setup to verify that one user cannot see resources created by another user in the same organization.

### 2. Introduction of Behavior-Driven Development (BDD)
- **Framework Setup**: The project was set up for BDD testing by adding `pytest-bdd` to `requirements.txt` and creating a new `backend/bdd/` directory for feature files and step definitions.
- **Pytest Configuration**: `pytest.ini` was updated to include the `bdd` directory in its `testpaths`.

### 3. BDD Test Implementation
- **Document Upload Scenario**: A feature file (`document_upload.feature`) was created to describe the user workflow of uploading a document and seeing it in their list. Corresponding step definitions were implemented in Python.
- **Folder Upload Scenario**: A second BDD scenario was added (`folder_upload.feature`) to test the creation of a nested folder structure during a file upload when a `path` parameter is provided.
- **Shared Steps**: Common `Given` steps (e.g., "I am an authenticated user") were refactored into a `bdd/step_definitions/common_steps.py` file to promote reuse and keep test files clean.
- **Step Discovery**: The BDD test files were updated to use `pytest_plugins` to reliably load the shared steps, resolving a `StepDefinitionNotFoundError`.
- **Database Access**: The BDD scenarios were decorated with `@pytest.mark.django_db` to grant them necessary access to the test database.

---
