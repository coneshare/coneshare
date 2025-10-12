# Coneshare

**Coneshare** is an enterprise-grade, self-hosted document sharing and virtual data room solution designed for security, reliability, and administrator control. It provides a complete platform for businesses to manage the entire lifecycle of sensitive documents: upload, process, secure, share, and track.

Built on a modern Python/Django and React stack, Coneshare is delivered as a containerized application that can be deployed on any infrastructure with zero reliance on third-party cloud services.

## Key Features

-   **File & Folder Management**: A familiar, intuitive interface for organizing documents with support for nested folders, renaming, moving, and deleting items.
-   **Bulk Uploads**: Efficiently upload multiple files or entire folder structures while preserving the directory hierarchy.
-   **Secure Link Sharing**: Create secure share links with granular access controls, including:
    -   Password protection
    -   Email verification (with optional magic links)
    -   Link expiration dates
    -   Disabling downloads
-   **Document Versioning**: Upload new versions of documents while retaining a history of previous iterations.
-   **In-Depth Analytics**: Track viewer engagement with detailed analytics, including:
    -   **View Sessions**: See who viewed a document, from where (GeoIP), and on what device.
    -   **Page-Level Tracking**: Monitor how long each page was viewed and calculate completion rates.
    -   **Download Tracking**: Know when a viewer downloads a document.
-   **Asynchronous Processing**: A robust background queue handles document processing (e.g., PDF page generation), ensuring the UI remains responsive during uploads.
-   **Self-Hosted & Secure**: Runs entirely on your infrastructure using Docker. Designed with a security-first mindset, with features like rate-limiting on password-protected links.

## Technology Stack

Coneshare is built with a modern, maintainable, and scalable technology stack suitable for a secure, on-premise environment.

-   **Backend**:
    -   **Framework**: Python, Django, Django REST Framework
    -   **Asynchronous Tasks**: Celery with Redis as the message broker
    -   **Authentication**: JSON Web Tokens (JWT) via `djangorestframework-simplejwt`
-   **Frontend**:
    -   **Framework**: React (Vite)
    -   **Styling**: Tailwind CSS with shadcn/ui components
    -   **API Communication**: Axios with interceptors for automatic token refresh
-   **Database**: PostgreSQL
-   **Deployment**: Docker Compose for easy, single-command deployment
-   **Testing**: Pytest (backend) and Vitest/React Testing Library (frontend)

For more details, see the [Technology Stack Documentation](docs/coneshare-techstack.md).

## Getting Started

### Prerequisites

-   [Docker](https://www.docker.com/get-started)
-   [Docker Compose](https://docs.docker.com/compose/install/)

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/coneshare/coneshare.git
    cd coneshare
    ```

2.  **Configure environment variables:**
    Copy the example environment file.
    ```bash
    cp .env.example .env
    ```
    To ensure consistent container naming, add the following line to your new `.env` file:
    ```
    COMPOSE_PROJECT_NAME=coneshare
    ```

3.  **Build and run the application:**
    Use the `make` commands to build the Docker images and start all services in the background.
    ```bash
    make build
    make up
    ```

4.  **Run database migrations:**
    Apply the initial database schema.
    ```bash
    make migrate
    ```

5.  **Create a superuser:**
    Create an initial admin account to log in with.
    ```bash
    make superuser
    ```
    Follow the prompts to set a username, email, and password.

### Accessing the Application

-   **Frontend Application**: [http://localhost:5173](http://localhost:5173)
-   **Backend API**: [http://localhost:8000/api/v1/](http://localhost:8000/api/v1/)

Log in using the superuser credentials you created.

## Development

The included `Makefile` provides shortcuts for common development tasks.

-   `make build`: Build or rebuild all services.
-   `make up`: Start all services in the background.
-   `make down`: Stop and remove all services.
-   `make logs`: Follow logs for all services.
-   `make back.sh`: Get a shell inside the backend container.
-   `make front.sh`: Get a shell inside the frontend container.

## Running Tests

-   **Run Backend Tests**:
    ```bash
    make test
    ```

-   **Run Frontend Tests**:
    ```bash
    make test.front
    ```

## Project Structure

-   `backend/`: Contains the Django application, including models, views, and services.
-   `frontend/`: Contains the React SPA, including components, pages, and services.
-   `docs/`: Contains project documentation, including architectural decisions, data models, and implementation plans.
-   `docker-compose.yml`: Defines the services, networks, and volumes for the application stack.
-   `Makefile`: Provides convenient shortcuts for common development tasks.

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

---

## Acknowledgements

This project was built with the assistance of [Aider](https://github.com/paul-gauthier/aider), an AI-powered pair programmer. Special thanks to the Aider project for its powerful capabilities in code generation and refactoring.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
