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

---

## Session 19: Security Hardening with API Rate Limiting (2025-09-28)

This session focused on hardening the application's security by implementing rate-limiting on the public-facing password verification endpoint to mitigate the risk of brute-force attacks. [https://github.com/coneshare/coneshare/pull/17](https://github.com/coneshare/coneshare/pull/17)

### 1. Brute-Force Protection for Share Links
- **Vulnerability Identified**: The public endpoint for verifying a share link's password (`/api/v1/links/<slug>/verify-password/`) was identified as a potential target for automated guessing attacks.
- **Solution using DRF Throttling**:
  - Instead of adding an external dependency, the decision was made to use Django REST Framework's powerful built-in throttling mechanism.
  - A custom `PerSlugScopedRateThrottle` class was implemented to scope rate limits on a per-IP, per-link-slug basis. This prevents an attacker targeting one link from locking out access to all other links.
  - The throttle was configured in `settings.py` to a rate of `10/min` for the `'password_verify'` scope and applied directly to the `ShareLinkVerifyPasswordView`.
- **Testing**:
  - A new unit test was added to `tests/documents/test_views.py` to verify the rate-limiting functionality. The test confirms that after 10 failed attempts, the 11th request receives a `429 TOO_MANY_REQUESTS` response, ensuring the protection is active.
