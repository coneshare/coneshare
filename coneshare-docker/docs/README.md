# Coneshare Docker Deployment

This document outlines the design and conventions for the `coneshare-docker` directory, which is responsible for the production deployment of the Coneshare application.

## Configuration Design

The deployment configuration is split into two distinct environment files to separate deployment concerns from application secrets.

-   **`coneshare-docker/.env`**: This file is for **deployment-specific variables**. These are variables used by Docker Compose itself for substitution in the `docker-compose.yaml` file (e.g.,
`${CONESHARE_IMAGE}`, `${CONESHARE_BIND}`). This file is intended to be managed by the release manager and will define the specific image and ports for a given release. An example is provided
in `.env.example`.

-   **`../app.env`**: This file is for **application secrets and runtime configuration**. These variables are passed directly *into* the containers to configure the Django backend and other
services (e.g., `SECRET_KEY`, `DATABASE_URL`). This file is intended to be managed by the end-user deploying the application. The installation script automatically creates this file in the
parent directory from the `app.env.example` template.

## Installation Process

The `install.sh` script provides a guided, step-by-step process for setting up a new production instance of Coneshare. It is designed to be modular, sourcing smaller, single-purpose scripts
from the `install/` directory.

The key steps orchestrated by the installer include:
1.  Checking for minimum system requirements (Docker version, CPU, RAM).
2.  Ensuring Docker volumes for persistent data are created.
3.  Copying `app.env.example` to `../app.env` if it doesn't exist.
4.  Generating a secure, random `SECRET_KEY` in `../app.env`.
5.  Pulling the specified Docker images.
6.  Setting up and migrating the database.

## Summary of Recent Changes

The installation process was recently refactored to improve the user experience and secure the initial setup.

-   **Automatic `app.env` Creation**: A new `ensure_app_env` function was added to the installation script. It checks for the existence of `../app.env` and, if it is missing, creates it from
the `coneshare-docker/app.env.example` template. This ensures that users do not have to perform this manual step.

-   **Automatic Secret Key Generation**: The `generate-secret-key.sh` script was updated to operate on the new `../app.env` file. During installation, it automatically replaces the default
placeholder `SECRET_KEY` with a cryptographically secure, randomly generated value.
