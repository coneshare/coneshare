# Coneshare Technology Stack

This document outlines the core technologies used in Coneshare, an enterprise-grade, self-hosted document sharing solution. The stack is designed to be maintainable and suitable for secure, self-hosted environments.

---

## Backend API (Python / Django)

The backend is built using the Django framework, chosen for its robust security features, scalability, and rapid development capabilities.

-   **Core Framework:** **Django**
    -   The foundation for data models, business logic, and security.
-   **API Layer:** **Django REST Framework (DRF)**
    -   Used to build REST APIs for the frontend and integrations.
    -   **JSON Naming Convention:** All API responses use `snake_case` for field names to maintain consistency between the Python backend and the JSON payload.
-   **Authentication:** **djangorestframework-simplejwt**
    -   Provides stateless API authentication using JSON Web Tokens (JWT), ideal for a decoupled SPA frontend.
-   **Asynchronous Tasks:** **Celery**
    -   Manages a background queue for long-running tasks, primarily for asynchronous document processing and conversions.
-   **Message Broker:** **Redis**
    -   Acts as the message broker for Celery to manage the task queue, ensuring reliability.
-   **Storage Abstraction:** **Django's Storage API**
    -   Provides a flexible storage backend that is configurable via environment variables to support on-premise solutions like **MinIO** or a local filesystem.

---

## File Service (Go)

Coneshare includes a dedicated Go service for file handling operations.

-   **Language / Runtime:** **Go**
    -   Implemented as a separate service in `core/`.
-   **HTTP Router:** **go-chi/chi**
    -   Lightweight router for service endpoints.
-   **Responsibilities:**
    -   Secure upload/download paths and file operation flows.
    -   Separation of file-serving concerns from the Django API layer.

---

## Frontend (React / Vite)

The frontend is a modern single-page application (SPA) built with React, providing a responsive and interactive user experience.

-   **Core Library:** **React**
    -   Used to build all user interface components, from the main dashboard to the document viewer.
-   **Build Tool:** **Vite**
    -   Provides a fast and modern development environment and build process for the React application.
-   **UI & Styling:**
    -   **Tailwind CSS**: A utility-first CSS framework for rapid UI development.
    -   **Radix UI primitives**: Accessible component primitives used across the UI.
    -   **shadcn-style component patterns**: Reusable component patterns built with Radix + Tailwind utilities.
    -   **Lucide React**: A consistent icon set.
-   **API Communication & Routing:**
    -   **Axios**: A promise-based HTTP client for requests to the Django backend.
    -   **React Router**: Handles all client-side routing.
-   **Document Viewer:** A custom, performant document viewer is used to render document pages within the browser.

---

## Portal / Website (Next.js + MDX)

The repository also includes a separate portal application for marketing pages and long-form docs/blog content.

-   **Framework:** **Next.js**
    -   Server-rendered/static site for website and content pages.
-   **Content Format:** **MDX**
    -   Blog/docs content maintained as versioned `.mdx` files in-repo.

---

## Deployment & Infrastructure

The entire stack is designed to be deployed easily in a self-hosted environment using containerization.

-   **Containerization:** **Docker Compose**
    -   A `docker-compose.yml` file orchestrates the deployment of the entire application stack with a single command.

-   **Database:** **PostgreSQL**
    -   The primary relational database for storing all application data.

-   **Web Server / Reverse Proxy:** **Nginx**
    -   Serves frontend assets and acts as a reverse proxy for backend services.

---

## Testing

The project employs a comprehensive testing strategy for both the backend and frontend to ensure code quality, reliability, and maintainability.

### Backend Testing
-   **Test Runner:** **Pytest** with `pytest-django` for seamless integration with the Django framework.
-   **Unit & Integration Tests:** Cover models, services, serializers, and API endpoints to verify business logic and data integrity.
-   **Behavior-Driven Development (BDD):** **pytest-bdd** is used to write feature tests that describe application behavior from a user's perspective, ensuring that features meet requirements.
-   **Fixtures:** Reusable test data and components are managed via Pytest fixtures located in `tests/conftest.py`. This includes fixtures for creating users, documents, and authenticated API clients.
-   **Mocking:** `unittest.mock.patch` is used to mock external services (like Celery tasks and file storage) to isolate tests and ensure predictable outcomes.

### Frontend Testing
-   **Test Runner:** **Vitest**, a fast and modern testing framework compatible with Vite.
-   **Component Testing:** **React Testing Library** is used to test components by interacting with them as a user would, ensuring they are accessible and functional.
-   **Fixtures & Setup:** Test setup and reusable mocks are managed within test files using `beforeEach` hooks and helper functions to render components with default or overridden props.
-   **Mocking:** **Vitest's mocking capabilities** (`vi.mock`) are used to isolate components (e.g., child components, API services) and mock external dependencies for predictable test outcomes.

### End-to-End (E2E) Testing
-   **Framework:** **Playwright** is used for E2E tests, which run real user scenarios in a browser against the live application.
-   **Orchestration:** Tests are run against the full application stack (backend, frontend, database, etc.), managed by Docker Compose. A root-level script (`run-e2e-tests.sh`) automates the entire process: starting services, seeding the database, running tests, and shutting down.
-   **Data Seeding:** A custom Django management command (`create_test_data`) is used to reset and seed the database before each test run. This ensures a clean, predictable state for tests, including a test user and sample documents/folders.
-   **Authentication:** A dedicated Playwright setup file (`auth.setup.js`) logs in as the test user once and saves the authentication state. Subsequent tests reuse this state, making them faster and more reliable by bypassing repetitive UI logins.
