# Coneshare Technology Stack

This document outlines the core technologies chosen for Coneshare, an enterprise-grade, self-hosted document sharing solution. The stack is designed to be modern, maintainable, and suitable for a secure, on-premise environment.

---

## Backend (Python / Django)

The backend is built using the Django framework, chosen for its robust security features, scalability, and rapid development capabilities.

-   **Core Framework:** **Django**
    -   The foundation for data models, business logic, and security.
-   **API Layer:** **Django REST Framework (DRF)**
    -   Used to build a powerful and flexible REST API for the frontend.
-   **Authentication:** **djangorestframework-simplejwt**
    -   Provides stateless API authentication using JSON Web Tokens (JWT), ideal for a decoupled SPA frontend.
-   **Asynchronous Tasks:** **Celery**
    -   Manages a background queue for long-running tasks, primarily for asynchronous document processing and conversions.
-   **Message Broker:** **Redis**
    -   Acts as the message broker for Celery to manage the task queue, ensuring reliability.
-   **Storage Abstraction:** **Django's Storage API**
    -   Provides a flexible storage backend that is configurable via environment variables to support on-premise solutions like **MinIO** or a local filesystem.

---

## Frontend (React / Vite)

The frontend is a modern single-page application (SPA) built with React, providing a responsive and interactive user experience.

-   **Core Library:** **React**
    -   Used to build all user interface components, from the main dashboard to the document viewer.
-   **Build Tool:** **Vite**
    -   Provides a fast and modern development environment and build process for the React application.
-   **UI & Styling:**
    -   **Tailwind CSS**: A utility-first CSS framework for rapid UI development.
    -   **shadcn/ui**: A collection of reusable UI components built on Radix UI and Tailwind CSS.
    -   **Lucide React**: Provides a simple and consistent icon set.
-   **API Communication & Routing:**
    -   **Axios**: A promise-based HTTP client for making requests to the Django backend, enhanced with interceptors for automatic token refresh.
    -   **React Router**: Handles all client-side routing.
-   **Document Viewer:** A custom, performant document viewer is used to render document pages within the browser.

---

## Deployment & Infrastructure

The entire stack is designed to be deployed easily in a self-hosted environment using containerization.

-   **Containerization:** **Docker Compose**
    -   A `docker-compose.yml` file orchestrates the deployment of the entire application stack with a single command.

-   **Database:** **PostgreSQL**
    -   The primary relational database for storing all application data.

-   **Web Server / Reverse Proxy:** **Nginx**
    -   Serves the static React frontend application and acts as a reverse proxy for the Django API.

---

## Testing

The project employs a comprehensive testing strategy for both the backend and frontend to ensure code quality, reliability, and maintainability.

### Backend Testing
-   **Test Runner:** **Pytest** with `pytest-django` for seamless integration with the Django framework.
-   **Unit & Integration Tests:** Cover models, services, serializers, and API endpoints to verify business logic and data integrity.
-   **Behavior-Driven Development (BDD):** **pytest-bdd** is used to write feature tests that describe application behavior from a user's perspective, ensuring that features meet requirements.

### Frontend Testing
-   **Test Runner:** **Vitest**, a fast and modern testing framework compatible with Vite.
-   **Component Testing:** **React Testing Library** is used to test components by interacting with them as a user would, ensuring they are accessible and functional.
-   **Mocking:** **Vitest's mocking capabilities** are used to isolate components and mock API calls for predictable test outcomes.
