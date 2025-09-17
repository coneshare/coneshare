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

## Session 4: Asynchronous Document Processing & Test Refactoring (2025-09-16)

### 1. Data Model Expansion for V1.0
- **Model Implementation**: Added `DocumentVersion` and `DocumentPage` models to `documents/models.py` to support versioning and page-by-page rendering.
- **Status Field Update**: Updated the `Document` model's `status` field to support the full processing lifecycle (`uploading`, `processing`, `ready`, `error`).

### 2. Asynchronous Task Queue Integration
- **Celery & Redis Setup**: Integrated Celery with a Redis broker and added `redis` and `celery_worker` services to `docker-compose.yml`. ([`09a2e00`](https://github.com/coneshare/coneshare/commit/09a2e00))
- **Configuration**: Configured the Django project to ensure the Celery application is loaded on startup, enabling task discovery. ([`47e4a14`](https://github.com/coneshare/coneshare/commit/47e4a14))

### 3. PDF Processing Pipeline
- **Service Layer & Celery Task**: Introduced a service layer and an async task to handle PDF-to-image conversion, and added necessary system dependencies. ([`074c976`](https://github.com/coneshare/coneshare/commit/074c976))
- **API Refactoring**: The `DocumentUploadView` was refactored to use the new service, returning a `202 ACCEPTED` status to reflect the async operation. ([`3784226`](https://github.com/coneshare/coneshare/commit/3784226))
- **Bug Fix**: Reordered serializer classes to fix an `undefined name` error during application startup. ([`70a946b`](https://github.com/coneshare/coneshare/commit/70a946b))

### 4. Test Suite Refactoring & Improvement
- **Shared Pytest Fixtures**: Created a central `backend/tests/conftest.py` to provide shared fixtures for tests.
- **Test Refactoring**: Refactored all unit and API tests to use the new fixtures, removing repetitive `setUp` methods and converting tests to a functional style. ([`74554cc`](https://github.com/coneshare/coneshare/commit/74554cc)), ([`ee51537`](https://github.com/coneshare/coneshare/commit/ee51537))
- **BDD Test for Async Workflow**:
  - Configured Celery to run tasks synchronously (`CELERY_TASK_ALWAYS_EAGER = True`) during test runs for reliable end-to-end testing.
  - Updated the document upload scenario to verify the document's final status becomes `'ready'`.
- **Fixture Isolation**: Updated the unit test `organization` fixture to create its own isolated test data instead of relying on a pre-existing one, improving test reliability. ([`2f18479`](https://github.com/coneshare/coneshare/commit/2f18479))

---

## Session 5: Document Preview & Deletion (2025-09-16)

This session focused on adding core document lifecycle features: internal preview and permanent deletion.

### 1. Internal Document Preview
- **API Endpoint**: Implemented a new `DocumentPreviewDataView` and registered it at `/api/v1/documents/<str:document_id>/preview-data/`.
- **Functionality**: The view authenticates the user against their organization, checks the document's `status`, and returns metadata including storage URLs for each document page.
- **Testing**: Added unit tests to `tests/documents/test_views.py` covering success cases, handling of non-ready documents, and security scoping to prevent data access across organizations. ([`581b962`](https://github.com/coneshare/coneshare/commit/581b962))

### 2. Document Deletion
- **Service Layer**: Introduced a `delete_document_and_files` service function to handle the complete removal of a document, its versions, pages, and all associated files from the storage backend.
- **API Integration**: Overrode the `DocumentViewSet`'s `destroy` method to call the new service, ensuring file cleanup is performed on every `DELETE` request.
- **Testing**: Implemented tests for both the service function and the API endpoint to verify correct deletion of database records and storage files, and to enforce that users can only delete their own documents. ([`271082a`](https://github.com/coneshare/coneshare/commit/271082a))


## Session 6: Document Versioning & Share Link Viewing (2025-09-17)

This session implemented two major features: document version updates and secure share link viewing.

### 1. Document Version Management
- **API Endpoint**: Added `DocumentVersionUploadView` at `/api/v1/documents/<str:document_id>/versions/` to handle new version uploads.
- **Service Function**: Created a `create_new_document_version` service that:
  - Stores new file versions safely
  - Maintains version numbering
  - Automatically marks new versions as primary
- **Testing**:
  - Added unit tests for version upload success cases and permission validation
  - Created BDD scenario for document versioning with feature file and step definitions
  - Patched Celery task to test async processing flow ([`22c2357`](https://github.com/coneshare/coneshare/commit/22c2357))

### 2. Share Link Viewing System
- **API Architecture**: Implemented the two-request pattern from the design doc for secure share link viewing
- **Public Endpoint**: Created `ShareLinkViewDataView` at `/api/v1/links/<slug:slug>/view-data/` with:
  - Password protection handling
  - Expiration checks
  - Archived link filtering
- **Testing**:
  - Added comprehensive unit tests for all access control scenarios
  - Created BDD test for password-protected links
  - Verified synchronous Celery task execution in tests ([`c915031`](https://github.com/coneshare/coneshare/commit/c915031))
