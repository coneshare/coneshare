
![Coneshare logo](https://raw.githubusercontent.com/coneshare/coneshare/refs/heads/main/coneshare_logo.png)

[![Backend CI](https://github.com/coneshare/coneshare/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/coneshare/coneshare/actions/workflows/backend-ci.yml)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/coneshare/coneshare)
[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Documentation](https://img.shields.io/badge/docs-coneshare-blue)](https://docs.coneshare.com/en/)

⭐ If you like this project, please give this repo a star — it helps more people discover this project.


# Coneshare

> [!TIP]
> For general information about Coneshare and how to install, please visit **[Coneshare on Github](https://github.com/coneshare/)**.


This is the main repository for the Coneshare server. It contains the backend services (written in Python and Go) and the frontend service (written in React).

## Technology Stack

Coneshare is built with a modern, maintainable, and scalable technology stack suitable for a secure, on-premise environment.

-   **Backend (Python)**:
    -   **Framework**: Django, Django REST Framework
    -   **Asynchronous Tasks**: Celery with Redis as the message broker
    -   **Authentication**: JSON Web Tokens (JWT) via `djangorestframework-simplejwt`
-   **File Server (Go)**:
    -   A dedicated service written in Go to handle all secure file I/O operations (uploads, downloads, and deletions), separating file management from the main application's business logic.
-   **Frontend**:
    -   **Framework**: React (Vite)
    -   **Styling**: Tailwind CSS with shadcn/ui components
    -   **API Communication**: Axios with interceptors for automatic token refresh
-   **Database**: PostgreSQL
-   **Deployment**: Docker Compose for easy, single-command deployment
-   **Testing**: Pytest (backend) and Vitest/React Testing Library (frontend)

For more details, see the [Technology Stack Documentation](docs/coneshare-techstack.md).

## Usage

Visit [the docs](https://docs.coneshare.com/en/quick-start/) for a more in-depth guide on how to get started.

## Build from Source

### Prerequisites

-   [Docker](https://www.docker.com/get-started)
-   [Docker Compose](https://docs.docker.com/compose/install/)

### Build Coneshare

1.  **Clone the repository:**
    ```bash
    git clone git@github.com:coneshare/coneshare.git
    cd coneshare
    ```

2.  **Configure environment variables:**
    Copy the example environment file.
    ```bash
    cp .env.template .env
    ```
    *Make sure to review and update the values in `.env` as needed.*

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

## Project Structure

-   `backend/`: Contains the Django application, including models, views, and services.
-   `core/`: Contains the dedicated Go file server for handling all file I/O operations.
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

## Security

If you find a security-related issue, please contact [dev@coneshare.com](mailto:dev@coneshare.com) immediately.
