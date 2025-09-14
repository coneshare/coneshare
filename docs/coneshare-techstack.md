# Coneshare Technology Stack

This document outlines the core technologies chosen for Coneshare, an enterprise-grade, self-hosted document sharing solution. The stack is designed to be modern, maintainable, and suitable for a secure, on-premise environment.

---

## Backend (Python / Django)

The backend is built using the Django framework, chosen for its robust security features, scalability, and rapid development capabilities.

-   **Core Framework:** **Django**
    -   Handles all API logic, user authentication, and data models.
    -   Leverages Django's built-in security features for a secure foundation.
    -   Utilizes the powerful **Django Admin** for a ready-to-use administrative interface to manage users, teams, and system configurations.
    -   Uses Django's `Group` and `Permission` framework for granular access control.
    -   Integrates with SAML-based SSO providers via proven Django libraries (e.g., `django-saml2-auth`).

-   **Asynchronous Tasks:** **Celery**
    -   Manages a background queue for long-running tasks, primarily for asynchronous document processing and conversions.

-   **Message Broker:** **Redis** or **RabbitMQ**
    -   Acts as the message broker for Celery to manage the task queue, ensuring reliability.

-   **Storage Abstraction:** **Django's Storage API**
    -   Provides a flexible storage backend that is configurable via environment variables to support on-premise solutions like **MinIO** or a local filesystem.

---

## Frontend (React / Vite)

The frontend is a modern single-page application (SPA) built with React, providing a responsive and interactive user experience.

-   **Core Library:** **React**
    -   Used to build all user interface components, from the main dashboard to the document viewer.
    -   Communicates with the Django backend via a REST API to fetch and display data.
    -   Handles UI for features like the analytics dashboard, data room management (including drag-and-drop), and status tracking for document uploads.

-   **Build Tool:** **Vite**
    -   Provides a fast and modern development environment and build process for the React application.

-   **Document Viewer:** A performant PDF viewer library (e.g., `react-pdf`) will be integrated for viewing documents within the browser.

---

## Deployment & Infrastructure

The entire stack is designed to be deployed easily in a self-hosted environment using containerization.

-   **Containerization:** **Docker Compose**
    -   A `docker-compose.yml` file orchestrates the deployment of the entire application stack with a single command.

-   **Database:** **PostgreSQL**
    -   The primary relational database for storing all application data.

-   **Web Server / Reverse Proxy:** **Nginx**
    -   Serves the static React frontend application and acts as a reverse proxy for the Django API.
