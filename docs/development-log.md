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
- **Core Models**: Implemented `Document`, `Folder`, `ShareLink`, `Viewer`, and `ViewSession` models with ULID primary keys and organization-scoped relationships.
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

---

## Session 7: Frontend Build Fixes & Component Integration (2025-09-18)

This session focused on resolving initial frontend setup issues and integrating the first major component. ([`a2d822d`](https://github.com/coneshare/coneshare/commit/a2d822d))

### 1. Component Integration Fix
- **Named vs. Default Export**: Fixed an import error in `DocumentsPage.jsx` where `DocumentsList` was being imported as a default export instead of a named export. This resolved the "does not provide an export named 'default'" error and allowed the component to render.

### 2. Tailwind CSS Configuration
- **Theme Extension**: Updated `tailwind.config.js` to correctly extend the theme with the custom CSS variables (e.g., `--background`, `--primary`) defined in `index.css`. This fixed an issue where utility classes like `bg-background` were not being recognized by the build process.
- **Style Cleanup**: Removed conflicting `@layer base` rules from `index.css` that were overriding the theme variables.

## Session 8: Authentication Implementation & Testing (2025-09-19)

This session focused on implementing secure authentication flows and comprehensive testing.

### 1. JWT Authentication System
- **Library Integration**: Added `djangorestframework-simplejwt` for token management ([`7b5244e`](https://github.com/coneshare/coneshare/commit/7b5244e))
- **Secure UserViewSet**: Modified `UserViewSet` to remove create action and require authentication ([`46f291c`](https://github.com/coneshare/coneshare/commit/46f291c))
- **Token Blacklist**: Implemented logout functionality with token revocation

### 2. Testing Infrastructure
- **Unit Tests**: Added comprehensive auth tests covering registration, login, token refresh and logout flows ([`1db4c9c`](https://github.com/coneshare/coneshare/commit/1db4c9c))
- **BDD Scenarios**: Implemented Gherkin tests for authentication workflows ([`c6588eb`](https://github.com/coneshare/coneshare/commit/c6588eb))
- **Superuser Fix**: Created custom UserManager to handle organization assignment ([`a6ec3e5`](https://github.com/coneshare/coneshare/commit/a6ec3e5))

### 3. Frontend Integration
- **Login Page**: Updated to use JWT endpoints and proper token storage
- **Logout Flow**: Implemented API call to invalidate refresh token ([`9bf6996`](https://github.com/coneshare/coneshare/commit/9bf6996))
- **Error Handling**: Added UI feedback for failed login attempts

### 4. Security Enhancements
- **Password Hashing**: Verified proper password storage in user fixtures
- **API Protection**: Added IsAuthenticated permission to sensitive endpoints
- **CORS Configuration**: Set up proper origin restrictions for frontend/backend communication

### 5. Frontend Integration
- **Login Page**: Updated to use JWT endpoints and proper token storage
- **Logout Flow**: Implemented API call to invalidate refresh token ([`9bf6996`](https://github.com/coneshare/coneshare/commit/9bf6996))
- **Error Handling**: Added UI feedback for failed login attempts

---

## Session 9: File Upload Finalization & Error Handling (2025-09-19)

This session focused on completing the file upload functionality and enhancing error handling.

### 1. Upload Functionality Finalization
- **Multi-File Support**: Enhanced `DocumentsPage.jsx` to handle batch uploads with Promise.all
- **Folder Upload**: Implemented webkitdirectory input for directory tree uploads
- **Path Handling**: Added logic to extract folder paths from uploaded files' relative paths

### 2. Error Handling Improvements
- **Toast Notifications**: Integrated Sonner toast system for upload success/error feedback
- **API Error Interceptor**: Enhanced axios interceptor to handle 401s and token refresh
- **Error Boundary**: Added error boundary component to catch rendering errors

### 3. Testing & Validation
- **Upload Edge Cases**: Added tests for large files, invalid types, and network failures
- **Path Injection Protection**: Implemented server-side path sanitization in `DocumentUploadView`
- **Concurrency Tests**: Verified simultaneous file upload handling

### 4. Documentation Updates
- **Tech Stack Doc**: Updated `coneshare-techstack.md` with final upload implementation details
- **Upload Guide**: Revised `coneshare-upload-file.md` to reflect current V1 implementation
- **API Docs**: Added OpenAPI annotations to upload endpoints in `documents/views.py`

---

## Session 10: UI/UX Refinements & API Hardening (2025-09-21)


This session focused on refining the document upload experience and empty state UI.


### 1. Robust Folder Uploading
- **Race Condition Prevention**: Decoupled folder creation from file uploads to prevent race conditions where multiple uploads would create duplicate folders.
- **Idempotent Folder Creation Endpoint**:
  - Implemented a new `POST /api/v1/folders/from_path/` endpoint. This view takes a path string (e.g., `path/to/folder`) and ensures the entire folder structure exists, creating any missing parts. It's designed to be called once before a batch upload.
  - Added a `unique_together` constraint on `(organization, parent, name)` in the `Folder` model to enforce structural integrity at the database level.
- **Frontend Refactoring**:
  - Updated the folder upload logic in `DocumentsPage.jsx` to first call the new `/from_path/` endpoint to create the folder structure, and only then proceed with uploading the files.
  - Corrected a bug where the `webkitRelativePath` was being incorrectly constructed, ensuring files are placed in the correct nested folders.

### 2. UI Actions & Confirmation
- **Reusable Actions Dropdown**: Created a generic `ActionsDropdown` component to provide 'Rename', 'Delete', and 'Share' actions for both documents and folders, reducing code duplication.
- **Delete Confirmation**: Implemented a reusable `ConfirmationDialog` to prompt users before permanently deleting a document or folder, preventing accidental data loss.
- **API Integration**: Connected the delete functionality to the backend API, including a data refresh mechanism in `DocumentsPage.jsx` to update the UI after a successful deletion.

### 3. API Security & Scoping
- **Ownership Enforcement for Deletion**:
  - Identified and fixed a security vulnerability where users could potentially delete folders they did not own.
  - Added a `created_by` field to the `Folder` model.
  - Updated the `FolderViewSet`'s queryset to filter by the request user, ensuring users can only see and delete their own folders.
- **Scoped Listing Views**:
  - Refined the `DocumentViewSet` to only list documents at the root level (i.e., not inside any folder).
  - Refined the `FolderViewSet` to only list folders at the root level (i.e., no sub-folders). This simplifies the main documents view.

### 4. Frontend Robustness
- **Batch Upload Error Handling**: Switched from `Promise.all` to `Promise.allSettled` for handling multi-file and folder uploads. This ensures that if one file fails to upload, the others can still proceed, improving the user experience for large batches.
- **Unit Testing**: Added comprehensive unit tests for the new `Promise.allSettled` logic in `DocumentsPage.test.jsx` to cover success, partial failure, and total failure scenarios for both file and folder uploads.
- **UI Refactoring**: Refactored the "Upload" button into a more accessible `DropdownMenu` from `@radix-ui/react-dropdown-menu`, simplifying the component's state management and improving keyboard navigation.

### 5. Documentation
- **Upload Flow Update**: Updated `coneshare-upload-file.md` to reflect the new two-step folder upload process (create path, then upload files).
- **Development Log**: Maintained this development log with a summary of changes from the session.

## Session 11: Document Upload Improvements & Empty State (2025-09-23)

This session focused on improving the user experience for document and folder management, hardening the backend API to prevent race conditions and incorrect data access, and enhancing the frontend's robustness.

[https://github.com/coneshare/coneshare/pull/6](https://github.com/coneshare/coneshare/pull/6)

### 1. Upload Logic Refinements
- Implemented distinct handling between file selection and folder uploads
- Improved drag-and-drop behavior to treat all drops as flat file uploads
- Added robust error handling for batch uploads using `Promise.allSettled`

### 2. Empty Documents Component
- Enhanced `EmptyDocuments` component with:
  - Upload icon from lucide-react
  - Clear messaging about upload options
  - Increased vertical spacing for better visibility
  - Conditional rendering based on documents/folders presence

### 3. Robust Folder Upload Handling
- Decoupled folder structure creation from file uploads
- Added path normalization to handle edge cases
- Implemented proper error handling for folder creation failures

### 4. Documentation Updates
- Updated upload documentation to clarify drag-and-drop behavior
- Added corner case scenarios to `coneshare-upload-file.md`


---

## Session 12: API Consolidation & Data Integrity (2025-09-23)

This session focused on optimizing the document and folder listing API to reduce frontend complexity and network requests, while also improving backend data integrity.

[https://github.com/coneshare/coneshare/pull/8](https://github.com/coneshare/coneshare/pull/8)


### 1. Consolidated Folder & Document Listing
- **Unified API Endpoint**:
  - The `FolderViewSet`'s `list` and `retrieve` actions were refactored to return a single, consolidated JSON payload containing `current_folder` metadata, a list of `sub_folders`, and a list of `documents`.
  - This eliminates the need for the frontend to make separate API calls for folders and documents when rendering a view, improving performance and simplifying state management.
- **Frontend Refactoring**:
  - `DocumentsPage.jsx` was updated to use the new consolidated endpoints. It now makes a single API call to fetch all necessary data for the current view (root or a specific folder).
  - The `api.js` service was simplified, replacing separate `getDocuments` and `getFolders` calls with a single `getFolderContents` function.

### 2. Root Folder Handling
- **Simplified Root Endpoint**:
  - The logic for fetching root-level content was moved into the standard `list` action of the `FolderViewSet` (`GET /api/v1/folders/`). This removes the need for a custom `/root/` action or separate logic paths.
- **Frontend Update**:
  - The `getRootFolderContents` function in `api.js` now points to `/api/v1/folders/`.
  - `DocumentsPage.jsx` correctly calls this function when no `folderId` is present in the URL.

### 3. Data Integrity Enhancement
- **Automatic Root Folder Assignment**:
  - Overrode the `save()` method on the `Document` model in `documents/models.py`.
  - This change ensures that any document created without an explicit folder is automatically assigned to the organization's invisible `__root__` folder, preventing orphaned documents and ensuring data consistency.

### 4. Test Suite Updates
- **API Test Refactoring**:
  - The tests in `tests/documents/test_views.py` were updated to reflect the new, consolidated API response structure for both root folder and specific folder content retrieval.
  - Assertions were modified to check for the `current_folder`, `sub_folders`, and `documents` keys in the response data.

---

## Session 13: User Settings & UI Polish (2025-09-24)

This session focused on implementing key user-facing features, hardening the frontend's interaction with the API, and improving the overall robustness of the application through testing and refactoring.

### 1. User Settings & Password Change Implementation [https://github.com/coneshare/coneshare/pull/9](https://github.com/coneshare/coneshare/pull/9) [https://github.com/coneshare/coneshare/pull/10](https://github.com/coneshare/coneshare/pull/10)
- **Backend**:
    - Implemented a secure password change endpoint at `/api/v1/users/set-password/`.
    - Added `ChangePasswordSerializer` with validation for matching new passwords and password strength.
    - The `SetPasswordView` now checks the user's old password before allowing an update.
- **Frontend**:
    - Created a new "Change Password" page under user settings (`/settings/password`).
    - Added a link to the new page in the main user navigation dropdown.
    - Implemented a flow where the user is automatically logged out and redirected to the login page after a successful password change.

### 2. Rename Functionality for Documents & Folders [https://github.com/coneshare/coneshare/pull/11](https://github.com/coneshare/coneshare/pull/11)
- **Backend Analysis**: Confirmed that the existing `ModelViewSet`s for `Document` and `Folder` already supported the necessary `PATCH` requests for renaming, requiring no backend changes.
- **Frontend**:
    - Implemented a reusable `RenameItemDialog` component for a consistent user experience.
    - Integrated the rename action into the `DocumentsList` component for both documents and folders.
    - Added test cases to verify that the rename dialog opens correctly, which also helped identify and fix a bug in how the event handler was being passed to child components.


### 3. API & Frontend Robustness
- **API Interceptor Hardening**:
    - Fixed a bug where the Axios response interceptor was incorrectly treating a 401 "Invalid Credentials" error on the login page as a session timeout, causing an unnecessary page reload. The interceptor now ignores 401s from token-related endpoints.
- **Error Handling**:
    - Refactored `PasswordSettingsPage` to remove a redundant generic error toast, relying on the global interceptor to prevent duplicate notifications.
    - Improved error message handling in `RenameItemDialog` to correctly parse both single string and array-based error responses from the API.
- **Test Suite Maintenance**:
    - Updated several failing tests in `api.test.js` and `DocumentsPage.test.jsx` to align with recent changes in API function signatures and mock data structures.
    - Resolved a test failure caused by a missing `@testing-library/user-event` dependency.

### 4. UI/UX & Build Fixes
- **Persistent Notifications**: Moved the `Toaster` component from individual pages to the root `App.jsx` component. This ensures that toast notifications (like the one for a successful password change) persist even after a page redirect.
- **React Router Upgrade Warnings**: Addressed future flag warnings from `react-router-dom` by enabling the recommended flags in `main.jsx`.
- **Styling Cleanup**: Removed unnecessary CSS classes from an error message element in `RenameItemDialog.jsx` for cleaner code.

---

## Session 14: Testing & Component Refinements (2025-09-25)

### 1. Breadcrumb Provider Fixes
- Resolved test failures by properly wrapping components with `BreadcrumbProvider`
- Updated test utilities to include necessary context providers
- Refactored header breadcrumb display logic after component relocation

### 2. Checkbox Interaction Fix
- Fixed `DraggableItem` checkbox error by switching from `onCheckedChange` to `onClick`
- Resolved type mismatch in checkbox event handling
- Updated selection logic to work with boolean state changes

### 3. Test Suite Updates
- Refactored `DocumentsPage.test.jsx` to verify breadcrumb context usage
- Added test cases for multi-selection highlight behavior
- Fixed drag-and-drop test mocks after component updates

### 4. Development Log Maintenance
- Documented recent fixes for checkbox interactions and test infrastructure
- Updated session history with component refinement details
- Maintained chronological record of UI/UX improvements

---

## Session 15: Document Detail Page & Link Management (2025-09-26)

This session focused on building the document detail page, implementing the full lifecycle for creating and editing share links, and adding several UI/UX enhancements. [https://github.com/coneshare/coneshare/pull/13](https://github.com/coneshare/coneshare/pull/13)

### 1. Document Detail Page Implementation
- **Backend**: The `DocumentSerializer` was enhanced to nest related `share_links` and aggregate all `views` associated with a document, providing a complete data payload for the detail page.
- **Frontend**:
  - A new route and `DocumentPage.jsx` component were created to fetch and display the document details.
  - The UI was structured with new components: `DocumentHeader`, `LinksTable`, `VisitorsTable`, and `Stats`, initially as placeholders.

### 2. Share Link Creation & Editing
- **Secure Backend**: The `ShareLinkSerializer` was updated to securely handle password hashing. It now accepts a `password` field on create/update, hashes it, and stores it in `password_hash`, without ever exposing the hash in API responses.
- **Frontend Form**:
  - A slide-over panel was implemented using a new, reusable `Sheet.jsx` UI component.
  - The `LinkSheet.jsx` component was created to house the form for creating and editing share links, including fields for name, password, and other settings.
  - The `DocumentPage` now manages the state for opening the `LinkSheet` for both creating new links and editing existing ones.
- **UI Components**:
  - The placeholder `LinksTable.jsx` was replaced with a full implementation using a new, reusable `Table.jsx` component.
  - Fixed a build failure by creating a missing `Switch.jsx` component for the form.

### 3. UI/UX Enhancements
- **Action Header**: The `DocumentHeader` was updated to include primary action buttons ("Create Link"), secondary icon buttons ("Preview", "Upload New Version"), and a dropdown menu for less frequent actions ("Download", "Delete").
- **Tooltips**: Added tooltips to the icon buttons for better usability, which involved creating a reusable `Tooltip.jsx` component based on Radix UI. This resolved an earlier build failure caused by a missing component.
- **Copy-to-Clipboard**: Implemented a "Link" column in the `LinksTable` with a user-friendly copy-to-clipboard feature that shows a "Copy" message on hover.

---

## Session 16: Internal Document Preview & Security Hardening (2025-09-27)

This session focused on implementing the end-to-end internal document preview feature, addressing security vulnerabilities in the API, and improving the robustness of both the frontend and backend. [https://github.com/coneshare/coneshare/pull/14](https://github.com/coneshare/coneshare/pull/14)

### 1. Internal Document Preview Implementation
- **End-to-End Feature**:
  - **Frontend**: Created `DocumentPreviewModal` and `PreviewViewer` components to fetch and render document pages in a dialog.
  - **API Integration**: Added a `getDocumentPreviewData` service function and integrated the modal into the `DocumentPage`, triggered by a "Preview" button in the `DocumentHeader`.
  - **Development Server Fix**: Configured the Vite dev server to proxy `/media` requests to the Django backend, resolving an issue where preview images were not loading in the local development environment.

### 2. API Security & Robustness
- **Ownership Enforcement for Preview**:
  - Identified and fixed a critical security vulnerability in the `DocumentPreviewDataView`. The view was updated to ensure that only the user who created a document can access its preview data.
  - Added a backend unit test to confirm that a user cannot access another user's document preview.
- **Ownership Enforcement for Versioning**:
  - Secured the `DocumentVersionUploadView` to prevent a user from uploading a new version to another user's document.
  - Updated the corresponding test case to assert that this action is correctly denied.
- **Absolute URL Generation**:
  - Fixed a bug where the preview API was returning relative URLs for page images, making them unusable by the frontend.
  - The implementation was updated to use `urllib.parse.urljoin` with the `SITE_DOMAIN` setting to reliably construct absolute URLs, accommodating both relative paths and fully-qualified URLs from storage backends. This also resolved a related test failure.

### 3. Frontend Component Robustness
- **Race Condition Fix**:
  - Addressed a potential race condition in `DocumentPreviewModal.jsx` where a state update could be attempted on an unmounted component if the modal was closed before the data fetch completed.
  - The `useEffect` hook was refactored to include a cleanup function, ensuring state is only updated if the component is still mounted.

---

## Session 17: Share Link Preview & Public Viewer (2025-09-27)

This session focused on implementing the end-to-end "Owner's Share Link Preview" feature, which allows a document owner to view a share link as an external user, bypassing all security settings. This involved creating a public-facing viewer page and the secure token-based mechanism to enable the preview. [https://github.com/coneshare/coneshare/pull/15](https://github.com/coneshare/coneshare/pull/15)

### 1. Share Link Preview Mechanism
- **Backend Token System**:
  - A new `PreviewSession` model was added to store temporary, single-use preview tokens.
  - A dedicated endpoint `POST /api/v1/share-links/{id}/preview/` was created to generate a short-lived token for the link owner.
  - The public data view (`ShareLinkViewDataView`) was enhanced to recognize a `previewToken` query parameter. If valid, it bypasses security checks (like passwords) and deletes the token to ensure it's single-use.
- **Frontend Integration**:
  - A "Preview" icon button was added to the `LinksTable` component, allowing owners to generate and open a preview in a new tab.
  - A "Save & Preview" button was added to the `LinkSheet` component for a streamlined workflow when creating or editing links.
  - A `generateShareLinkPreview` function was added to the `api.js` service to communicate with the new backend endpoint.

### 2. Public Document Viewer Page
- **Frontend Implementation**:
  - A new public page component, `ShareLinkViewerPage.jsx`, was created to render documents for external users.
  - A corresponding API service function, `getShareLinkViewData`, was added to fetch the necessary document data using the link's slug and an optional preview token.
  - A new route, `/view/:slug`, was added to `App.jsx` to make the viewer page accessible.
- **UI Polish**: A company logo and name were added to the top-left corner of the public viewer page to maintain brand presence.

### 3. Testing & Hardening
- **Backend Unit Tests**: Added unit tests for the share link preview feature, verifying successful token generation, security bypass, and the single-use nature of the token.
- **Bug Fixes**:
  - Resolved a CSRF `Forbidden (Origin checking failed)` error by adding the frontend development server to Django's `CSRF_TRUSTED_ORIGINS`.
  - Fixed a bug where the preview token was `undefined` in the frontend by correctly destructuring the token from the API response object.
  - Corrected a Django `AttributeError` by using the proper related manager (`share_link.preview_sessions.create`) to create the `PreviewSession` instance.

---

## Session 18: Share Link Password Protection & UX Refinements (2025-09-28)

This session focused on implementing the end-to-end password protection feature for public share links. This involved building a secure password verification flow on the backend, creating a user-friendly password form on the frontend, and significantly refining the user experience for managing link passwords. The session concluded with the addition of comprehensive frontend unit tests to ensure the reliability of the new components. [https://github.com/coneshare/coneshare/pull/16](https://github.com/coneshare/coneshare/pull/16)

### 1. Secure Password Verification Flow
- **Backend**:
  - A new `ShareLinkVerifyPasswordView` was created to handle password submissions for a share link.
  - Upon successful verification, the backend now uses Django's session framework to authorize the user's browser to view that specific link, preventing them from having to re-enter the password on subsequent visits in the same session.
  - Unit tests were added to validate the entire workflow, including failed attempts and successful access after verification.
- **Frontend**:
  - The `ShareLinkViewerPage` was updated to recognize a `401 Unauthorized` response with `protectionType: 'password'`, at which point it renders a `PasswordForm` component.
  - The `PasswordForm` was implemented to securely submit the user's password to the new verification endpoint and trigger a data refetch upon success.
- **Error Handling**:
  - The API error interceptor was refined to display user-friendly toast notifications for password-related errors (e.g., "Invalid password.") instead of generic "401" messages.

### 2. Password Management UX Enhancements
- **Secure Password Editing**: The `LinkSheet` component was refactored to handle password changes securely. The current password is never displayed; instead, the UI provides a field to set a new password.
- **Intuitive Toggle Switch**: A toggle switch was added to the `LinkSheet` to explicitly enable or disable password protection, making the user's intent clear.
- **Dummy Password Display**: To improve usability when editing a link that already has a password, the input field now displays a dummy value (`●●●●●●●●`). This confirms that a password is set and prevents accidental removal if the user only intends to change other settings. The password is only updated if the user actively changes this value.

### 3. Security Hardening & Testing
- **Session Clearing on Logout**: The backend `LogoutView` was updated to clear the Django session, ensuring that any share link authorizations are properly revoked when a user logs out.
- **Frontend Unit Tests**:
  - Added a new test suite for the `LinkSheet` component, covering create/edit modes and all password-related logic.
  - Added a new test suite for the `PasswordForm` component to verify its rendering, state changes, and API interactions.
  - Fixed test failures related to mocking browser APIs (`ResizeObserver`) and handling asynchronous state updates in the test environment.

### 4. Brute-Force Protection for Share Links
- **Vulnerability Identified**: The public endpoint for verifying a share link's password (`/api/v1/links/<slug>/verify-password/`) was identified as a potential target for automated guessing attacks.
- **Solution using DRF Throttling**:
  - Instead of adding an external dependency, the decision was made to use Django REST Framework's powerful built-in throttling mechanism.
  - A custom `PerSlugScopedRateThrottle` class was implemented to scope rate limits on a per-IP, per-link-slug basis. This prevents an attacker targeting one link from locking out access to all other links.
  - The throttle was configured in `settings.py` to a rate of `10/min` for the `'password_verify'` scope and applied directly to the `ShareLinkVerifyPasswordView`.
- **Testing**:
  - A new unit test was added to `tests/documents/test_views.py` to verify the rate-limiting functionality. The test confirms that after 10 failed attempts, the 11th request receives a `429 TOO_MANY_REQUESTS` response, ensuring the protection is active.

---

## Session 19: Share Link Settings UX Overhaul (2025-09-28)

This session focused on a major redesign and enhancement of the share link creation and editing form (`LinkSheet`), significantly improving its usability and adding several new security and tracking features. [https://github.com/coneshare/coneshare/pull/17](https://github.com/coneshare/coneshare/pull/17)

### 1. LinkSheet Component Redesign
- **Wider, Scrollable Layout**: The `LinkSheet` component was made wider and scrollable to accommodate the new settings and improve usability on screens with many options.
- **UI Polish**: Labels, descriptions, and placeholder text were updated to be more descriptive and user-friendly, guiding the user through the available options.

### 2. New Share Link Features
- **Email Requirement Options**:
  - A "Require email to view" switch was added to capture viewer emails.
  - A nested, conditional "Verify email to view" switch was implemented, which only appears when email is required. This provides more granular control over viewer identification.
- **Email Notifications**: A "Receive email notification" switch was added, allowing link creators to be notified when their content is viewed.
- **Expiration Date**: An expiration date picker was added to allow users to set a date after which a link will automatically become inaccessible.

### 3. Backend & Database Support
- **Model Updates**: The `ShareLink` and `ShareLinkPreset` models were updated with new boolean fields (`requires_email`, `receive_email_notification`) to support the new features.
- **Database Migrations**: New database migrations were created and applied to add the new fields to the database schema, ensuring data persistence for the new settings.
- **Serializer Updates**: The corresponding DRF serializers were updated to include and handle the new fields.

---

## Session 20: Interactive Public Document Viewer (2025-09-29)

This session focused on enhancing the public-facing document viewer with an interactive toolbar, providing users with essential controls for a better viewing experience. [https://github.com/coneshare/coneshare/pull/18](https://github.com/coneshare/coneshare/pull/18)

### 1. Viewer Toolbar Implementation
- **New Component**: A `ViewerToolbar.jsx` component was created to house all viewer actions, such as zoom controls, full-screen toggle, download, and print buttons.
- **Conditional Actions**: The toolbar intelligently hides the "Download" and "Print" buttons if the share link settings disallow downloads, ensuring security settings are respected in the UI.

### 2. Interactive Viewer Features
- **Zoom Functionality**: Implemented zoom in and zoom out controls, allowing users to adjust the document's scale. The zoom level is managed in the `ShareLinkViewerPage` and applied via CSS transforms in the `PreviewViewer` component.
- **Full-Screen Mode**: Added a button to toggle full-screen viewing mode for an immersive reading experience, using the browser's Fullscreen API.
- **Page Count & Tracking**:
  - The toolbar now displays the current page and total page count (e.g., "2 / 10").
  - The `PreviewViewer` was refactored to use an `IntersectionObserver`. This efficiently tracks which document page is currently visible in the viewport and updates the page count in the toolbar in real-time.

---

## Session 21: Interactive Document List & UI Hardening (2025-09-29)

This session was dedicated to a major overhaul of the document list's user experience, focusing on interactivity, modernizing the UI, and fixing a series of complex event-handling bugs. The session also introduced the "Star" feature and comprehensive unit tests to ensure component reliability. [https://github.com/coneshare/coneshare/pull/19](https://github.com/coneshare/coneshare/pull/19)

### 1. Modernized List UI
- **Visual Cleanup**: The document list's table style was refined for a cleaner look by removing vertical borders and the header's background color.
- **Interactive Checkboxes**: Item checkboxes (and the header's "select all" checkbox) were hidden by default and are now revealed on hover or when an item is selected, reducing visual clutter.

### 2. "Star" Feature Implementation
- **UI Elements**:
  - A star icon was added to each document and folder row, allowing users to mark items as favorites. The icon's position and visibility were refined based on feedback.
  - A "Starred" filter button was added to the main action bar area, visible when no items are selected.
- **State Management**: The starred status is managed in the `DocumentsPage` state for now, as a frontend-only feature.

### 3. `ActionsDropdown` Bug Fixing & Hardening
- **The Problem**: A series of stubborn bugs caused by event conflicts between `dnd-kit` (drag-and-drop) and Radix UI (dropdown menu) were identified and resolved. Symptoms included the dropdown closing immediately after opening and clicks on menu items triggering navigation on the parent row.
- **The Solution (Multi-layered)**:
  1.  **State-Managed Visibility**: Replaced CSS `group-hover` logic with explicit React `useState` (`isHovered`, `isMenuOpen`) to control the visibility of the "three dots" icon, which resolved conflicts with `dnd-kit`'s event listeners.
  2.  **Event Propagation Control**: Implemented `e.stopPropagation()` on both `onClick` and `onPointerDown` for the `div` wrapping the `ActionsDropdown`. This created a "hard boundary" that prevents any pointer or click events from bubbling up to the draggable parent row, which was the final key to fixing the navigation bug.
  3.  **Code Simplification**: After fixing the event propagation at the source, the complex `e.target.closest()` checks in the row's `handleClick` handler became redundant and were removed.

### 4. Comprehensive Testing
- **New Test Suite**: Created `frontend/src/tests/components/documents/DraggableItem.test.jsx` to specifically target the `ActionsDropdown`'s behavior.
- **Test Scenarios**: Added tests to verify:
  - The "three dots" icon appears correctly on hover and selection.
  - The dropdown menu opens and remains visible after being clicked.
  - Clicking menu items (like "Rename" or "Delete") does not trigger the parent row's navigation action.

### 5. Documentation
- **New Implementation Guide**: Created `docs/coneshare-ui-document-list-imple.md` to document the final, robust solutions for the interactive document list, including the state management and event propagation strategies. This serves as a reference for future development.

---

## Session 22: Download-Only Documents & Image Preview Fixes (2025-10-01)

This session focused on implementing end-to-end support for non-previewable ("download-only") documents and fixing a critical bug that prevented image previews from working correctly. [https://github.com/coneshare/coneshare/pull/20](https://github.com/coneshare/coneshare/pull/20)

### 1. Frontend & Backend Support for Download-Only Documents
- **Document Detail Page**: The `DocumentHeader` was updated to disable the "Preview" button for download-only files, with a tooltip explaining why it's unavailable. ([`0273869`](https://github.com/coneshare/coneshare/commit/0273869))
- **Share Link Creation**: The `LinkSheet` form now enforces the "Allow download" setting for download-only documents, preventing users from disabling it. ([`abced03`](https://github.com/coneshare/coneshare/commit/abced03))
- **Public Viewer Page**: The `ShareLinkViewerPage` was enhanced to display a user-friendly message and a prominent "Download" button when viewing a share link for a download-only file, instead of showing an empty viewer. ([`078e969`](https://github.com/coneshare/coneshare/commit/078e969))

### 2. Backend Image Preview Fix
- **Vulnerability Identified**: A core logic flaw was discovered where the backend would not generate preview data for image files because they are optimized to not have `DocumentPage` records. This affected both internal previews and public share links.
- **Internal Preview Fix**: The `DocumentPreviewDataView` was updated to detect documents with `type='image'` and return a direct URL to the original uploaded file, enabling internal previews to function correctly. ([`af60553`](https://github.com/coneshare/coneshare/commit/af60553))
- **Public Share Link Fix**: The same logic was applied to the `ShareLinkViewDataView` to ensure that public share links for images would also display the preview correctly. ([`9a92f16`](https://github.com/coneshare/coneshare/commit/9a92f16))

### 3. Testing Enhancements
- **Image Preview Test Case**: A new test fixture for creating image documents was added to `tests/conftest.py`.
- **Comprehensive Verification**: Unit tests were added to `tests/documents/test_views.py` to verify the correct behavior of both the internal and public preview endpoints when serving image documents, ensuring the fix is robust.

---

## Session 23: Tracking document viewing activity (2025-10-02)

This session implements a robust system for tracking document viewing activity, providing document owners with deeper insights into how their shared content is consumed. It introduces granular page-level tracking, records comprehensive viewer metadata including geographical location and device information, and ensures reliable data transmission from the frontend. This enhancement significantly improves the analytics capabilities, allowing for a better understanding of user engagement.  [https://github.com/coneshare/coneshare/pull/21](https://github.com/coneshare/coneshare/pull/21)

-  Granular Page View Tracking: Introduced a new PageView model and an API endpoint (/api/v1/page-views/record/) to record detailed page-level viewing durations within a document.

-  Enhanced View Session Data: The existing ViewSession model now captures ip_address, user_agent, country, city, latitude, and longitude for each viewing session, leveraging GeoIP lookup.

-  Frontend Integration: The PreviewViewer.jsx component has been updated to track active page duration and send this data reliably to the backend, including using navigator.sendBeacon for unload events.

-  GeoIP Setup: The development Dockerfile and Django settings have been configured to download the GeoLite2-City database and integrate django.contrib.gis.geoip2 for IP-based location lookups.

-  Improved Visitor Analytics Display: The VisitorsTable.jsx component now presents a richer view of visitor data, including browser, OS, and geographical location, along with formatted viewing durations.

-  Comprehensive Testing: New BDD feature and step definitions, along with unit tests, have been added to cover the new view tracking and GeoIP functionalities.

---

## Session 24: Multi-Step Share Link Authentication (2025-10-05)

This session focused on implementing a sequential, multi-step authentication flow for share links that require both a password and an email address. This enhancement hardens the security for highly sensitive documents and addresses a key edge case in the access control logic. [https://github.com/coneshare/coneshare/pull/22](https://github.com/coneshare/coneshare/pull/22)

### 1. Sequential Authentication Flow
- **Backend Logic**:
  - The `ShareLinkViewDataView` was refactored to perform security checks sequentially: password first, then email.
  - The Django session storage was updated to track granular authorization status (e.g., `password_verified: true`, `email_verified: true`) for each link, allowing the backend to prompt the user for the correct next step.
- **Frontend Compatibility**: The existing frontend components (`PasswordForm`, `EmailForm`) were able to handle the new sequential flow without modification, as the refetch-on-success pattern naturally accommodates multiple steps.

### 2. BDD Test Suite Enhancement
- **New Scenario**: A new BDD feature file and step definitions (`share_link_multi_step_auth.feature`) were created to test the end-to-end multi-step flow, from the initial password prompt to the final document access.
- **Test Suite Hardening**:
  - Fixed a fixture lookup failure by refactoring the BDD `given` step to be self-contained, creating its own test data instead of relying on fixtures from the unit test `conftest.py`.
  - Resolved a `user_context not found` error by adding the missing `Given I am an authenticated user` prerequisite step to the BDD scenario.

---

## Session 25: Viewer Email Tracking & Documentation (2025-10-05)

This session focused on fixing a bug where viewer emails were not being correctly associated with their view sessions and documenting the underlying system logic. [https://github.com/coneshare/coneshare/pull/23](https://github.com/coneshare/coneshare/pull/23)

### 1. Bug Fix: Viewer Email Association
- **Problem**: Identified that the analytics `VisitorsTable` was displaying "Anonymous" for viewers who had provided their email for an email-protected share link.
- **Solution**:
  - The backend was updated to use the Django session to store a viewer's email after they successfully requested access.
  - The `ViewSessionViewSet` was then modified to retrieve this email from the session when creating a new `ViewSession` record, ensuring the `viewer_email` field is correctly populated.
- **Testing**: A new BDD scenario was added to `share_link_email_protection.feature` to reproduce the bug and verify the fix, confirming that view sessions are now correctly linked to viewer emails.

### 2. Architecture Documentation
- **Viewer Logic**: The `coneshare-share-link-view-logic.md` document was updated with a new section explaining the roles of the `ViewSession` and `Viewer` models.
- **Design Rationale**: The documentation now clarifies the design decision to use a denormalized `viewer_email` field on the `ViewSession` model for performance reasons, and it details the session-based mechanism used to associate identified viewers with their activity.

---

## Session 26: Model Renaming & Data Consistency (2025-10-06)

This session focused on improving the clarity of the analytics data model by renaming the core `View` model to `ViewSession` to better reflect its purpose of tracking unique viewing sessions. [https://gitub.com/coneshare/coneshare/pull/25](https://github.com/coneshare/coneshare/pull/25)

### 1. Model & API Renaming
- **Backend**:
  - The `View` model was renamed to `ViewSession` across all backend files, including models, serializers, views, and URLs.
  - The corresponding foreign key in the `PageView` model was updated from `view` to `unique_view`.
  - The API endpoint was changed from `/api/v1/views/` to `/api/v1/view-sessions/`.
- **Frontend**:
  - The `createView` API service function was renamed to `createViewSession`.
  - All frontend components that initiate or use a view session (`ShareLinkViewerPage`, `PreviewViewer`) were updated to use the new naming convention (`ViewSessionId`) and API endpoints.
- **Database**: The changes require a new database migration to rename the `documents_view` table to `documents_ViewSession` and update its related foreign keys.

### 2. Test Suite Updates
- **Unit & BDD Tests**: All backend tests, including unit tests in `test_views.py` and BDD step definitions, were updated to use the new `ViewSession` model and the `/api/v1/view-sessions/` endpoint.
- **Frontend Tests**: Frontend tests for `ShareLinkViewerPage.test.jsx` were updated to mock and call the new `createViewSession` API function.

### 3. Documentation Consistency
- All documentation files referencing the old `View` model (e.g., `coneshare-data-model.md`, `coneshare-share-link-view-logic.md`) were updated to use the new `ViewSession` terminology, ensuring the documentation accurately reflects the current state of the codebase.

---

## Session 27: UI Consistency & Pagination Refinement (2025-10-06)

This session focused on improving UI consistency in the document detail page. [https://github.com/coneshare/coneshare/pull/27](https://github.com/coneshare/coneshare/pull/27)

### 1. Always-Visible Pagination
- **Problem**: The pagination controls in the `VisitorsTable` would disappear when there was only one page of results, causing the layout to shift.
- **Solution**: The `Pagination.jsx` component was modified to always render, even for a single page. The navigation buttons are disabled in this state, providing a consistent and stable UI layout
regardless of the number of items. This change involved removing the conditional `null` return when `totalPages <= 1`.

---

## Session 28: Share Link Management Enhancements (2025-10-07)

This session focused on enhancing the management of share links from the document detail page, adding a critical delete feature and improving the UI for expired links. [https://github.com/coneshare/coneshare/pull/28](https://github.com/coneshare/coneshare/pull/28)

### 1. Delete Share Link Feature
- **End-to-End Implementation**: A full-featured "delete link" capability was added.
- **Backend**: No changes were needed as the `DELETE` method was already supported by the `ShareLinkViewSet`.
- **Frontend**:
  - A `deleteShareLink` function was added to `api.js`.
  - The `DocumentPage` was updated with state management for a `ConfirmationDialog` to prevent accidental deletion.
  - A "Delete" icon button (`Trash2`) was added to the actions column in the `LinksTable`, triggering the confirmation flow.

### 2. Expired Link UI Enhancements
- **Visual Indicator**: The `LinksTable` now displays a red "Expired" badge next to the name of any share link whose `expires_at` date is in the past.
- **Improved UX for Expired Links**:
  - The copy-to-clipboard functionality is disabled for expired links.
  - A tooltip was added to the expired link's URL, explaining that the link has expired and guiding the user to update the expiration date in the settings to reactivate it.

### 3. UI Bug Fix: TooltipProvider Context
- **Problem**: The addition of the new tooltip for expired links caused a runtime error (`Tooltip` must be used within `TooltipProvider`) because the `TooltipProvider` was only wrapped around the action buttons.
- **Solution**: The `LinksTable` component was refactored to have a single `TooltipProvider` wrapping the entire component, ensuring all tooltips within it have the necessary context and resolving the crash.

---

## Session 29: Share Link Status Toggle (2025-10-07)

This session implemented a feature allowing users to activate or deactivate share links directly from the document detail page, replacing the unused `is_archived` field. [https://github.com/coneshare/coneshare/pull/29](https://github.com/coneshare/coneshare/pull/29)

### 1. Backend Refactoring: `is_archived` to `is_active`
- **Model & Serializer Update**: The `is_archived` boolean field in the `ShareLink` model was renamed to `is_active`, with its default changed to `True`. The `ShareLinkSerializer` was updated accordingly.
- **Database Migration**: A database migration was generated to apply the field rename.
- **API Logic Update**:
  - The `ShareLinkViewDataView` was updated to check for `is_active=True`.
  - If a user tries to access an inactive link, the API now returns a `404 Not Found` with the message "This file is not available."
- **Test Updates**: All relevant backend unit and public view tests were updated to reflect the new `is_active` field and its expected behavior.

### 2. Frontend UI Implementation
- **Status Toggle Switch**: A "Status" column with a `Switch` component was added to the `LinksTable`.
- **API Integration**: An `onCheckedChange` handler was implemented for the switch, which calls the `updateShareLink` API to toggle the `is_active` status.
- **UI Refresh**: A callback was passed from the parent `DocumentPage` to the `LinksTable` to trigger a data refresh after the status is updated, ensuring the UI reflects the change.

---

## Session 30: API Refactoring & Token Refresh Hardening (2025-10-08)

This session focused on improving backend code maintainability by refactoring duplicated logic and hardening the frontend's authentication token refresh mechanism to prevent race conditions.

### 1. Backend Code Refactoring (DRY Principle)
- **Problem**: The logic to fetch a `ShareLink` and verify that it exists and is active was duplicated across three public-facing API views.
- **Solution**: A private helper function, `_get_active_share_link`, was created in `documents/views.py` to centralize this logic. The three views were then refactored to use this helper, making the code cleaner and more maintainable.

### 2. API Error Response Standardization
- **Problem**: The new helper function raised a DRF `NotFound` exception (which returns an error with a `detail` key), while other error responses in the views returned a `message` key, leading to inconsistency.
- **Solution**: The views were updated to catch the `NotFound` exception and re-format the response to consistently use the `message` key, simplifying frontend error handling.

### 3. Frontend Token Refresh Race Condition Fix
- **Problem**: The existing token refresh logic in `api.js` was vulnerable to a race condition. If multiple API calls failed with a 401 error simultaneously, it would trigger multiple, redundant token refresh requests.
- **Solution**: The Axios interceptor was completely rewritten to use a request queue. Now, only the first 401 error triggers a token refresh. Subsequent failed requests are queued and only retried after the new token has been successfully fetched and stored.
- **Testing**: The test suite for the API service (`api.test.js`) was updated to verify the new, robust token refresh behavior, including a new test case for handling multiple concurrent requests. A minor bug in the test setup (a missing `url` in a mock error object) was also fixed.

---

## Session 31: Interactive Visitor Analytics & UI Enhancements (2025-10-09)

This session focused on significantly enhancing the visitor analytics dashboard by providing granular, page-by-page insights and improving the user experience with interactive elements. [https://github.com/coneshare/coneshare/pull/31](https://github.com/coneshare/coneshare/pull/31)

### 1. Granular Page View Analytics
- **Backend**:
  - The `ViewSessionSerializer` was updated to nest-serialize related `PageView` objects, including page number and duration.
  - The `DocumentViewSet.view_sessions` action was optimized with `prefetch_related('page_views')` to prevent N+1 query issues.
- **Frontend**:
  - A new `PageViewsChart.jsx` component was created to render a horizontal bar chart of view durations per page.
  - The `VisitorsTable.jsx` was made interactive. It now features an expandable row for each visitor session, revealing the `PageViewsChart` with detailed analytics.

### 2. Page Image Preview on Hover
- **Backend**:
  - The `view_sessions` API endpoint was enhanced to include the storage URL for each document page. An optimization was added to pre-fetch all page URLs for a document in a single query.
  - The `PageViewSerializer` was updated to include the `url` field.
- **Frontend**:
  - The `PageViewsChart` component was updated to wrap each bar in a `Tooltip` component.
  - When a user hovers over a bar, a tooltip now displays the corresponding page image, providing immediate visual context for the analytics.

### 3. Frontend Robustness & Bug Fixes
- **Duplicate Key Warning Fix**:
  - Identified and fixed a bug where the `PageViewsChart` could receive multiple data points for the same page number, causing a React warning about duplicate keys.
  - The component now aggregates the `pageViews` data, summing the durations for each unique page number before rendering, ensuring stability and correctness.

---

## Session 32: Force File Download & Backend Optimization (2025-10-09)

This session focused on improving the file download user experience and optimizing backend performance for image documents.

### 1. Forced File Download
- **Problem**: When users clicked the "Download" button for files like images or PDFs, browsers would often open them in a new tab for online preview instead of saving them to the device.
- **Solution**: The download handler in `ViewerToolbar.jsx` was updated to programmatically create a temporary link (`<a>`) with the `download` attribute. This attribute instructs the browser to treat the URL as a file to be downloaded, providing a consistent user experience.

### 2. Backend Performance Optimization
- **Problem**: A performance issue was identified where the API would make two separate calls to the storage backend to generate URLs for image documents—one for the preview and one for the download URL, even though they pointed to the same file. This was also causing a test to fail due to an unexpected number of mock calls.
- **Solution**: The `ShareLinkViewDataView` in the backend was refactored. It now detects when a document is an image and intelligently reuses the already-generated page preview URL as the `downloadUrl`, eliminating the redundant storage call and fixing the failing test.

## Session 33: Visitor Analytics UI Enhancements (2025-10-10)

This session focused on improving the clarity and usability of the visitor analytics UI on the document detail page. [https://github.com/coneshare/coneshare/pull/33](https://github.com/coneshare/coneshare/pull/33)

### 1. Renaming "Visitors" to "View Sessions"
- **Problem**: The term "Visitors" was inaccurate, as a single visitor could have multiple distinct viewing sessions.
- **Solution**: The `VisitorsTable` component was renamed to `ViewSessionsTable`, and all related UI text was updated to use the more precise term "View Sessions," improving clarity for the user.

### 2. Share Link Visitor Details
- **Feature**: To provide more immediate insights, the "Share Links" table was enhanced with expandable rows.
- **Backend**: The API was updated to nest-serialize view session data within each share link object and optimized the query with `prefetch_related` to prevent N+1 performance issues.
- **Frontend**:
  - A "Views" column was added to the `LinksTable` to show a total count.
  - Rows for links with views now have a chevron icon to expand and collapse a nested details view.

### 3. UI Refinement for Expanded View
- **Iteration 1**: Initially displayed visitor information as a simple sentence.
- **Iteration 2**: Refined the UI into a structured, nested table for better readability.
- **Final Implementation**: The expanded view was updated to perfectly match the style and data columns of the main "View Sessions" table, including:
  - Visitor email and "You" badge.
  - Device, OS, and location information.
  - "Viewed At" and "Downloaded At" timestamps.
  - Duration and completion percentage.
This ensures a consistent and intuitive user experience across the analytics dashboard.

---

## Session 34: Document Versioning UI & Testing (2025-10-10)

This session focused on implementing the user-facing functionality for uploading new versions of existing documents, as outlined in `docs/upload-new-version.md`, and adding corresponding frontend tests to ensure its reliability. [https://github.com/coneshare/coneshare/pull/34](https://github.com/coneshare/coneshare/pull/34)

### 1. "Upload New Version" Feature Implementation
- **API Service**: Added a new `uploadNewVersion` function to `frontend/src/services/api.js` to handle the multipart form data request to the backend. ([`13c42cd`](https://github.com/coneshare/coneshare/commit/13c42cd))
- **UI Integration**:
  - The `DocumentHeader` component was updated to include an "Upload New Version" button, which triggers a handler passed down from the `DocumentPage`.
  - `DocumentPage.jsx` was enhanced with a hidden file input and the core logic to manage the upload process.
- **File Type Mismatch Confirmation**: Implemented a user-friendly confirmation dialog that appears if the uploaded file has a different extension than the original document, preventing accidental replacement with an incorrect file type.
- **State Management & Feedback**: Added state management for the upload process, including toast notifications for success and failure, and a data refresh mechanism to update the UI with the new version's status.

### 2. Frontend Testing for Versioning
- **Test Suite Enhancement**: Added a new test suite to `frontend/src/tests/pages/DocumentPage.test.jsx` specifically for the "Upload New Version" feature. ([`9e92aa5`](https://github.com/coneshare/coneshare/commit/9e92aa5))
- **Test Scenarios**: The new tests cover the complete user flow:
  - Verifying that the upload button correctly triggers the file input.
  - Testing the successful upload of a file with a matching extension.
  - Ensuring the confirmation dialog for mismatched file types is displayed correctly.
  - Validating both the confirmation and cancellation paths from the dialog.
- **Component Mocking**: Updated the mock for the `DocumentHeader` component to allow interaction with the "Upload New Version" button within the test environment.

---

## Session 35: Duplicate Name Handling for Documents & Share Links (2025-10-10)

This session focused on improving data integrity and user experience by implementing automatic renaming for documents and share links with duplicate names. [https://github.com/coneshare/coneshare/pull/35](https://github.com/coneshare/coneshare/pull/35)

### 1. Unique Naming for Document Uploads ([`0adff08`](https://github.com/coneshare/coneshare/commit/0adff08))
- **Feature**: Implemented an automatic renaming feature to handle uploads of documents with the same name as an existing document in the same folder. The system now appends a numeric suffix (e.g., `report (2).pdf`).
- **Performance**: The renaming logic is optimized to use a single database query to find existing names, preventing N+1 performance issues.
- **Database Index**: Added a `db_index` to the `Document.name` field to improve lookup performance.
- **Testing**: Covered the new functionality with unit tests in `test_services.py`.

### 2. Unique Naming for Share Links ([`a4d32c9`](https://github.com/coneshare/coneshare/commit/a4d32c9))
- **Feature**: Extended the unique naming logic to `ShareLink` creation. If a user creates a share link with a name that already exists for that specific document, the new link's name is automatically given a numeric suffix (e.g., `My Link (2)`).
- **Implementation**: Updated the `ShareLinkSerializer` to incorporate this logic during the creation process.
- **Testing**: Added unit tests to `test_serializers.py` to verify renaming for the same document and ensure duplicate names are still allowed for different documents.

---

## Session 36: Renaming Logic Refactor & User-Scoped Uniqueness (2025-10-11)

This session focused on abstracting the unique naming logic, applying it to folders, implementing default naming for share links, and refining data ownership to be user-centric. [https://github.com/coneshare/coneshare/pull/36](https://github.com/coneshare/coneshare/pull/36)

### 1. Generic Renaming Logic & Folder Auto-Renaming ([`97c5036`](https://github.com/coneshare/coneshare/commit/97c5036))
- **Refactor**: Abstracted the auto-renaming logic for documents and share links into a single, generic `_get_unique_name` utility in `documents/services.py` to improve maintainability.
- **Feature**: Applied the new generic logic to folder creation. If a user creates a folder with a name that already exists in the same parent folder, it is automatically renamed with a numeric suffix (e.g., `My Folder (2)`).
- **Validation**: Updated the `FolderSerializer` to use the new logic on creation but correctly raise a validation error if a user tries to *rename* an existing folder to a duplicate name.

### 2. Default Naming for Share Links ([`b550b54`](https://github.com/coneshare/coneshare/commit/b550b54), [`11a18a3`](https://github.com/coneshare/coneshare/commit/11a18a3), [`42f49ab`](https://github.com/coneshare/coneshare/commit/42f49ab))
- **Feature**: Implemented default naming for share links. If a link is created without a name (or with an empty string), it defaults to "Untitled Link". This logic also respects the auto-renaming feature (e.g., "Untitled Link (2)").
- **Validation Fix**: Reworked the `ShareLinkSerializer`'s validation. The automatic `UniqueTogetherValidator` was removed and replaced with a manual check in the `validate` method that only runs on updates. This prevents the validator from incorrectly blocking the auto-renaming logic during creation.

### 3. User-Scoped Uniqueness for Documents & Folders ([`1644108`](https://github.com/coneshare/coneshare/commit/1644108), [`aac6cba`](https://github.com/coneshare/coneshare/commit/aac6cba))
- **Data Model Change**: The `unique_together` constraint on the `Document` and `Folder` models was changed from `('organization', 'parent'/'folder', 'name')` to `('created_by', 'parent'/'folder', 'name')`. This scopes name uniqueness to the user, not the entire organization, allowing different users to have items with the same name in the same location.
- **API Update**: The unique name generation services and serializers were updated to use the new user-scoped filtering logic.
- **Security Hardening**: The `FolderFromPathView`, used for folder uploads, was updated to be user-scoped and now includes a permission check to prevent a user from creating a subfolder inside a path owned by another user.
- **Testing**: API view tests were updated to assert the correct auto-renaming behavior instead of expecting validation errors on duplicate creation. ([`46dcf67`](https://github.com/coneshare/coneshare/commit/46dcf67))

---

## Session 37: Bulk Folder Creation & API Atomicity (2025-10-11)

This session focused on: [https://github.com/coneshare/coneshare/pull/37](https://github.com/coneshare/coneshare/pull/37)

- improving the performance and reliability of the folder upload process by implementing a bulk creation API and hardening its transactional integrity.

- making the folder upload feature more robust by implementing auto-renaming for name conflicts and fixing critical bugs related to uploading folders within existing subfolders.

### 1. Bulk Folder Creation API
- **Performance Enhancement**: Replaced the inefficient `POST /api/v1/folders/from_path/` endpoint, which created one folder path per request, with a new `POST /api/v1/folders/ensure-paths/` endpoint.
- **Atomic Operations**: The new view accepts a list of paths and creates the entire required folder hierarchy within a single, atomic database transaction, ensuring data integrity.
- **Frontend Integration**: Updated `DocumentsPage.jsx` to gather all unique folder paths from a folder upload and send them in a single call to the new `ensure-paths` endpoint before uploading any files.

### 2. Transaction Integrity & Bug Fixes
- **Atomicity Fix**: Corrected a critical bug in the `EnsureFolderPathsView` where returning a `Response` on a permission failure would commit a partial transaction. The view was refactored to raise a `PermissionDenied` exception to correctly trigger a database rollback.
- **Error Handling Fix**: Resolved a subsequent issue where the `PermissionDenied` exception was being caught by a generic handler, returning a `500 Internal Server Error`. A more specific exception block was added to allow DRF to correctly handle the exception and return the appropriate `403 Forbidden` status.

### 3. Testing
- **New Test Suite**: Added a comprehensive test suite for `EnsureFolderPathsView` in `tests/documents/test_views.py`, validating success cases, idempotency, permission denials, and a critical test to ensure the transaction is atomic on failure.
- **Test Maintenance**: Updated an existing test case for document uploads with paths to use the new, more efficient `ensure-paths` endpoint for its setup.

### 4. Auto-Renaming for Folder Uploads
- **Feature**: Implemented a system to handle uploads of folders with names that conflict with existing folders. The backend now automatically renames the new folder with a numeric suffix (e.g., `Reports (2)`).
- **API Enhancement**: The `POST /api/v1/folders/ensure-paths/` endpoint was updated to return a `path_mappings` object in its response (e.g., `{"Reports": "Reports (2)"}`).
- **Frontend Integration**: `DocumentsPage.jsx` was updated to use these mappings to construct the correct file paths for each upload, ensuring files are placed in the newly renamed directory.

### 5. Subfolder Upload Logic Overhaul
- **Bug Identified**: A critical bug was found where uploading a folder (e.g., "new-folder") inside an existing subfolder (e.g., "/data") would cause the backend to incorrectly try to rename "/data" instead of "new-folder".
- **Solution**: The `ensure-paths` API was enhanced with an optional `parent_path` parameter to make the destination explicit.
- **Backend**: `EnsureFolderPathsView` now uses `parent_path` to correctly scope the folder creation and renaming logic.
- **Frontend**: The upload logic was refactored. It now sends only the relative paths of the new folder structure to the API, along with the `parent_path` of the current view. It then correctly reconstructs the full path for each file upload using the `basePath` and any `path_mappings` returned by the API.

### 6. Testing
- **Backend**: Added new unit tests to `tests/documents/test_views.py` to verify the `parent_path` functionality, including success cases, renaming within subfolders, and handling of invalid parent paths.
- **Frontend**: The test suite in `frontend/src/tests/pages/DocumentsPage.test.jsx` was significantly updated to cover the new, more complex folder upload workflow, including mocking the `ensureFolderPaths` response with path mappings and verifying correct path construction for subfolder uploads.

---

## Session 38: API Optimization, Bug Fixes & Manual Folder Creation (2025-10-12)

This session focused on improving backend performance, fixing critical bugs in both the backend and frontend, and implementing a new user-facing feature for manual folder creation. [https://github.com/coneshare/coneshare/pull/39](https://github.com/coneshare/coneshare/pull/39)

### 1. Bug Fixes
- **Subfolder Deletion Fix**: Resolved a critical bug where documents located in subfolders could not be deleted due to improper queryset scoping. The `DocumentViewSet` was refactored to move folder-filtering logic from the global `get_queryset` into the `list` method, ensuring detail-level actions like `destroy` can operate on documents regardless of their location. A regression test was added to verify the fix. ([`30833e2`](https://github.com/coneshare/coneshare/commit/30833e2))

### 2. Frontend "Add Folder" Feature
- **Initial Implementation**: Added an "Add Folder" button to the `DocumentsPage` that used a native browser prompt to get the folder name and called the backend API to create it. ([`de0a24f`](https://github.com/coneshare/coneshare/commit/de0a24f))
- **UX Improvement**: Replaced the native prompt with a polished, reusable `AddFolderDialog` component for a better user experience. The dialog's layout was further refined for better alignment and usability. ([`986ac10`](https://github.com/coneshare/coneshare/commit/986ac10), [`fa6da82`](https://github.com/coneshare/coneshare/commit/fa6da82))

### 3. Frontend Bug Fix: Folder Re-upload
- **Problem**: Identified and fixed a bug where a user could not upload the same folder twice in a row because the file input's `onChange` event was not firing.
- **Solution**: The event handlers for file and folder inputs were updated to reset the input's value to `null` after each upload is processed. A new frontend test case was added to prevent future regressions. ([`fa20b15`](https://github.com/coneshare/coneshare/commit/fa20b15))

---

## Session 39: Star/Unstar Feature & Starred Filter (2025-10-12)

This session focused on implementing a persistent "Star/Unstar" feature for documents and folders, along with a client-side filter to display only starred items. [https://github.com/coneshare/coneshare/pull/40](https://github.com/coneshare/coneshare/pull/40)

### 1. Star/Unstar Feature Persistence
- **Backend**:
  - An `is_starred` boolean field was added to the `Document` and `Folder` models to persist the starred state.
  - The `DocumentSerializer` and `FolderSerializer` were updated to expose this field through the API.
- **Frontend**:
  - The `handleToggleStar` function in `DocumentsPage.jsx` was refactored to perform an optimistic UI update. It now calls the API to persist the change and reverts the UI with an error toast if the API call fails.

### 2. "Starred" Filter Implementation
- **Frontend**:
  - A "Starred" filter button was added to the `DocumentsPage`.
  - A new state variable, `showStarredOnly`, was introduced to toggle the filter. The logic for rendering the items list was updated to filter for starred items when this state is active.

### 3. Testing
- **Backend**: New unit tests were added to `tests/documents/test_views.py` to cover starring and unstarring of documents and folders, including permission checks to ensure users cannot star items they do not own.
- **Frontend**: A new test suite was added to `tests/pages/DocumentsPage.test.jsx` to verify the optimistic UI updates for the star/unstar action (including the failure/revert case) and the functionality of the "Starred" filter.

---

## Session 40: "Move file/folder" Feature (2025-10-12)

This session focused on implementing a robust "Move" feature, allowing users to move multiple documents and folders to a new location within their file hierarchy. [https://github.com/coneshare/coneshare/pull/41](https://github.com/coneshare/coneshare/pull/41)

### 1. Backend Implementation
- **Dedicated API Endpoint**: A new endpoint, `POST /api/v1/actions/move/`, was created to handle the move logic atomically.
- **Transactional Logic**: The `MoveItemsView` uses a database transaction to ensure that the entire move operation succeeds or fails together, preventing partial moves.
- **Server-Side Validation**: The backend validates user permissions on all source and destination items, and includes logic to prevent invalid operations such as moving a folder into itself or one of its own subfolders.
- **Conflict Resolution**: If a moved item has a name that conflicts with an existing item in the destination, it is automatically renamed with a numeric suffix (e.g., `report.pdf` becomes `report (2).pdf`).

### 2. Frontend Implementation
- **"Move" Action**: A "Move" button was added to the `SelectionActionBar`, which appears when one or more items are selected.
- **`MoveItemsDialog` Component**: A new, reusable dialog was created that allows users to browse their folder hierarchy to select a destination. The dialog includes breadcrumbs for navigation and disables invalid destinations (e.g., the folder being moved).
- **API Integration**: `DocumentsPage.jsx` was updated to manage the dialog's state, call the new `moveItems` API service on confirmation, and refresh the data list upon a successful move.

### 3. Testing
- **Backend**: A comprehensive test suite was added to `tests/documents/test_views.py` to cover the move endpoint's functionality, including success cases, permission denials, invalid moves (e.g., cyclical paths), and conflict resolution.
- **Frontend**: A new test suite was added to `frontend/src/tests/pages/DocumentsPage.test.jsx` to verify the end-to-end user flow: selecting items, using the move dialog to select a destination, confirming the move, and ensuring the UI refreshes correctly.

---

## Session 41: File Size Feature Implementation (2025-10-13)

This session focused on implementing the file size feature, providing users with more document information and new sorting capabilities. [https://github.com/coneshare/coneshare/pull/42](https://github.com/coneshare/coneshare/pull/42)

### 1. Backend Implementation
- **Data Model**: The `Document` model was updated with a `file_size` field.
- **Service Layer**: The document creation services were updated to populate the `file_size` on the `Document` model from its primary version.
- **API Exposure**: The `DocumentSerializer` was updated to include the new `file_size` field.

### 2. Frontend Implementation
- **Display File Size**: The `DocumentCard` component now displays the file size in a human-readable format (e.g., "1.2 MB").
- **Sorting Capability**: A "File Size" option was added, and the sorting logic on the `DocumentsPage` was enhanced to handle sorting by this new key.

### 3. Testing
- **Backend**: A unit test was added to confirm that the `file_size` is correctly populated on the `Document` model.
- **Frontend**: A test case was added to verify that documents can be correctly sorted by file size.

---

## Session 42: Watermark Feature Implementation (2025-10-16)

This pull request delivers a significant new feature: dynamic watermarking for shared documents. It enables users to protect their content by applying customizable watermarks, which can include viewer-specific information, to both online previews and downloadable files. The changes span across the backend, introducing new data models, API endpoints, and robust image/PDF processing, and the frontend, providing an intuitive interface for configuring these watermark settings. [https://github.com/coneshare/coneshare/pull/43](https://github.com/coneshare/coneshare/pull/43)

-  Watermark Feature Implementation: Introduced a new watermarking capability for shared documents, allowing users to apply custom text watermarks to document previews and downloads.
-  Dynamic Watermark Text: Watermark text can now include dynamic variables like {{ip-address}} and {{email}}, which are replaced with real-time viewer data when the document is accessed.
-  Backend API Endpoints: Added new API endpoints for dynamically rendering watermarked document pages (images) and generating watermarked PDF files for download.
-  Frontend UI for Watermarks: Integrated UI controls into the share link creation/editing form, enabling users to toggle watermarks, input custom text, and see available dynamic variables.
-  Image and PDF Watermarking: Implemented backend logic using Pillow for image watermarking and pypdf/reportlab for PDF watermarking, featuring tiled and 45-degree rotated text for enhanced visibility.
-  Caching and Performance: Watermarked image rendering includes ETag caching to optimize performance and reduce redundant processing for unchanged content.

---

## Session 43: Share Link UX & Analytics Refinements (2025-10-17)

This session focused on significantly improving the user experience for managing and understanding share links, introducing a consolidated settings summary, interactive elements, and several bug fixes. [https://github.com/coneshare/coneshare/pull/44](https://github.com/coneshare/coneshare/pull/44)

### 1. Enhanced Share Link Expiration
- **Precise Expiration**: Upgraded the share link settings to allow setting an expiration time in addition to the date, providing more granular control.

### 2. Consolidated Link Settings UI
- **New `LinkSettingsSummary` Component**: Replaced multiple columns in the share links table with a single, elegant "Settings" badge.
- **Interactive Tooltip**: The badge now displays a detailed list of all active settings (password, expiration, email requirement, etc.) in a tooltip on hover.
- **Click-to-Edit**: Made the settings badge clickable, allowing users to quickly open the edit form for a link.

### 3. UI/UX Bug Fixes & Refinements
- **Tooltip Event Handling**:
  - Resolved a bug where tooltips would not appear on custom components like `Badge` by ensuring props were correctly forwarded.
  - Fixed a critical UI bug where adding a tooltip to the status `Switch` component caused it to render incorrectly. The fix involved wrapping the `Switch` in a `span` to isolate pointer events.
- **Active/Inactive Status Tooltip**: Added a tooltip to the status toggle in the links table, clearly indicating whether a link is "Active" or "Inactive" on hover.


---

## Session 44: Analytics UI/UX Enhancements (2025-10-17)

This session focused on refining the analytics and share link management UI, improving data presentation, and enhancing user experience by replacing cluttered elements with more modern, consolidated components.  [https://github.com/coneshare/coneshare/pull/45](https://github.com/coneshare/coneshare/pull/45)

### 1. Replaced Reactions with Downloads in Analytics ([`12daace`](https://github.com/coneshare/coneshare/commit/12daace))
- **Backend**: The `DocumentViewSet`'s `stats` action was updated to aggregate the total number of downloads (`Count('downloaded_at')`) from `ViewSession` records.
- **Frontend**: The `Stats.jsx` component was modified to display "Number of downloads" instead of the placeholder "Number of reactions", consuming the new `total_downloads` field from the API.

### 2. Consolidated Share Link Actions ([`ccda15c`](https://github.com/coneshare/coneshare/commit/ccda15c))
- **New Component**: A `LinkActionsDropdown.jsx` component was created to encapsulate "Preview", "Edit", and "Delete" actions into a single "three dots" menu, consistent with the main document list UI.
- **UI Refactor**: The `LinksTable.jsx` was updated to use the new dropdown component, replacing the individual icon buttons and reducing visual clutter in the actions column.

### 3. Paginated View Sessions for Share Links ([`8709ad7`](https://github.com/coneshare/coneshare/commit/8709ad7))
- **Problem**: Share links with a high number of views would create an impractically long list when expanded in the `LinksTable`.
- **Solution**: Implemented a "View more" link that directs users to a new, dedicated analytics page for that specific share link.
  - **Backend**:
    - The `ShareLinkSerializer` was modified to only nest the 10 most recent view sessions (`recent_view_sessions`).
    - A new paginated endpoint, `/api/v1/share-links/{id}/view-sessions/`, was added to the `ShareLinkViewSet` to serve all view sessions for a single link.
  - **Frontend**:
    - A new `ShareLinkAnalyticsPage.jsx` was created to display the paginated view sessions, reusing the existing `ViewSessionsTable` component.
    - The `LinksTable.jsx` was updated to display the "View all sessions" link when the total view count exceeds the number of recent sessions shown.

---

## Session 45: Dashboard Implementation & UI Refinements (2025-10-18)

This session focused on the end-to-end implementation of the new analytics dashboard, including the creation of backend APIs, the development of the frontend UI, and several subsequent refinements and bug fixes.  [https://github.com/coneshare/coneshare/pull/46](https://github.com/coneshare/coneshare/pull/46)

### 1. Backend Analytics API
- **New `analytics` App**: A new Django app was created to house all dashboard-related analytics logic.
- **Dedicated Endpoints**: Implemented several new API endpoints:
  - `GET /api/v1/analytics/dashboard/` for summary data (recent views and links).
  - `GET /api/v1/analytics/daily-visits/` for chart data.
  - Paginated endpoints for "View All" pages (`/links/` and `/view-sessions/`).
- **Data Integrity**: The views were built to serve data scoped to the user's organization, including aggregated daily visit counts and lists of recent activity.
- **Testing**: Added a comprehensive unit test suite for all new analytics API endpoints to ensure correctness and data scoping.

### 2. Frontend Dashboard UI
- **New Homepage**: The default Vite homepage was replaced with a new dashboard UI that displays a daily visits chart, a list of the latest view sessions, and a list of recent
active links.
- **"View All" Pages**: Created `AllLinksPage.jsx` and `AllViewSessionsPage.jsx` to provide paginated views of all active links and view sessions, accessible from the dashboard.
- **Data Visualization**: Integrated the `recharts` library to render the daily visits bar chart.

### 3. Component Refinements & UI Consistency
- **Conditional Columns**: The shared `LinksTable` and `ViewSessionsTable` components were enhanced to conditionally display a "Document" column and hide action/status controls
when used on the dashboard, controlled by a new `isDashboardWidget` prop.
- **Consistent UX**: This conditional logic was also applied to the "View All" pages to ensure the table layout was consistent with the dashboard widgets.
- **Navigation**: Added a "Back to Dashboard" button on the "View All" pages for improved user navigation.

### 4. Bug Fixes
- **Pagination**: Fixed an issue where the pagination controls were being incorrectly displayed for the "Latest View Sessions" table on the dashboard.
- **Layout Bug**: Diagnosed and fixed a major UI layout bug that caused a large blank area to appear on scrollable pages by correcting CSS `overflow` properties in the main layout
component.

---

## Session 46: Import files from Cloud Storage  (2025-10-22)

This session delivers a significant new feature: the ability for users to import files directly from their cloud storage accounts, starting with Dropbox and Google Drive. It encompasses a full-stack implementation, from backend infrastructure for secure OAuth2 connections and asynchronous file handling to a dynamic and intuitive frontend user interface. The changes ensure a robust, scalable, and user-friendly experience for integrating external cloud files into the application, complete with status tracking and error reporting for imports. [https://github.com/coneshare/coneshare/pull/47](https://github.com/coneshare/coneshare/pull/47)

-	New Cloudfiles Application: Introduced a new Django application cloudfiles to manage integrations with external cloud storage providers like Dropbox and Google Drive.
-	Cloud Connection Management: Implemented a CloudConnection model to securely store user-specific OAuth2 tokens (access and refresh tokens) for connected cloud accounts. This model is designed to be extended with encryption for tokens at rest.
-	OAuth2 Flow Integration: Developed API endpoints and frontend components to handle the OAuth2 authorization flow for Dropbox and Google Drive, allowing users to securely connect their cloud accounts. This includes CSRF protection using Redis caching for state tokens.
-	Asynchronous File Import: Integrated Celery tasks (import_from_cloud_task) to handle the asynchronous downloading and processing of files from cloud providers, preventing API timeouts for larger files. Files are saved to the application's storage backend.
-	Dynamic Frontend UI: Updated the frontend to dynamically list available cloud providers, initiate OAuth connections, and provide a modal file browser for selecting and importing files from connected drives. The UI also displays the status of ongoing imports.
-	Document Status Enhancements: Added a status_message field to the Document model to provide more detailed feedback to users regarding the state of file processing, especially during cloud imports or in case of errors.
-	New Dependencies: Added several new Python packages to requirements.txt to support cloud integrations, including dropbox, django-redis, httpx, google-api-python-client, and google-auth-oauthlib.
-	Settings Configuration: Updated settings.py to include configuration for enabled cloud providers, default import folder mappings, and API credentials. Also added Redis cache configuration and a local_settings loading mechanism.


## Session 47: Encrypt Share Link Password  (2025-10-24)

This session significantly enhances the security and flexibility of share link passwords by transitioning from a hashed storage mechanism to an encrypted one. By adopting the django-cryptography library, passwords for share links are now encrypted at rest, allowing for features like password retrieval while maintaining data protection. The changes span across the backend, including model definitions, API serialization, and verification logic, and are complemented by frontend updates for a more user-friendly password input experience. [https://github.com/coneshare/coneshare/pull/50](https://github.com/coneshare/coneshare/pull/50)

 -	Backend Password Encryption: Replaced one-way password hashing with two-way encryption for ShareLink passwords using django-cryptography, enhancing security and usability by allowing passwords to be retrieved.
 -	Model and Migration Updates: The ShareLink model's password_hash field was replaced with an encrypted password field, accompanied by a new database migration to reflect this change.
 -	API and Serialization Logic Refinement: Modified ShareLinkSerializer and ShareLinkVerifyPasswordView to remove manual hashing logic and use direct string comparison for encrypted passwords, simplifying the authentication flow.
 -	Frontend Password Input Component: Integrated a new PasswordInput component in the LinkSheet to provide toggleable password visibility and streamlined password management logic for a better user experience.
 -	Comprehensive Documentation: Updated data model and view logic documentation, including a detailed section on encryption key management, key rotation strategies, and alternative key derivation methods.

