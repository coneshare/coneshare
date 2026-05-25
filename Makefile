.DEFAULT_GOAL := help

APP_VERSION ?= dev
GIT_SHA ?= $(shell git rev-parse --short=10 HEAD 2>/dev/null || echo unknown)

# ====================================================================================
# HELPERS
# ====================================================================================

.PHONY: help
help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  up              - Start all services in detached mode"
	@echo "  up.malware      - Start services with malware profile (includes clamav)"
	@echo "  down            - Stop and remove all services"
	@echo "  build           - Build or rebuild services"
	@echo "  portal    - Build the static portal site"
	@echo "  logs            - Follow logs for all services"
	@echo "  core.sh         - Attach a shell to the core container"
	@echo "  back.sh         - Attach a shell to the backend container"
	@echo "  front.sh        - Attach a shell to the frontend container"
	@echo "  portal.sh       - Attach a shell to the portal container"
	@echo "  clean           - Remove migrations, .pyc files, and database"
	@echo "  test            - Run backend tests with pytest"
	@echo "  test.front      - Run frontend tests with vitest"
	@echo "  lint.portal     - Run portal linter with eslint"
	@echo "  lint.docs       - Validate feature docs template sections"
	@echo "  migrate         - Run database migrations"
	@echo "  superuser       - Create a superuser"
	@echo "  api.schema      - Generate OpenAPI schema at backend/docs/api/openapi.yaml"
	@echo "  api.schema.validate - Validate generated OpenAPI schema"


# ====================================================================================
# DOCKER COMMANDS
# ====================================================================================

.PHONY: up
up:
	COMPOSE_PROJECT_NAME=coneshare docker-compose up -d

.PHONY: up.malware
up.malware:
	COMPOSE_PROJECT_NAME=coneshare docker-compose --profile malware up -d

.PHONY: down
down:
	docker-compose down

.PHONY: build
build:
	docker-compose build

.PHONY: dist
dist:
	@echo "--> Building core service image..."
	docker build -t coneshare-core:latest -f core/Dockerfile ./core
	@echo "--> Building frontend assets image..."
	docker build \
		--build-arg VITE_APP_VERSION=$(APP_VERSION) \
		--build-arg VITE_GIT_SHA=$(GIT_SHA) \
		-t coneshare-frontend:latest -f frontend/Dockerfile ./frontend
	@echo "--> Building final coneshare image..."
	docker build -t coneshare:latest -f backend/Dockerfile ./backend

.PHONY: logs
logs:
	docker-compose logs -f

.PHONY: core.sh
core.sh:
	COMPOSE_PROJECT_NAME=coneshare docker-compose exec core sh

.PHONY: back.sh
back.sh:
	COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend bash

.PHONY: front.sh
front.sh:
	COMPOSE_PROJECT_NAME=coneshare docker-compose exec frontend sh

.PHONY: portal.sh
portal.sh:
	COMPOSE_PROJECT_NAME=coneshare docker-compose exec portal sh


# ====================================================================================
# DEVELOPMENT COMMANDS
# ====================================================================================

.PHONY: clean
clean:
	@echo "Cleaning Python cache, migrations, and database..."
	find . -type f -name "*.py[co]" -delete
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find ./backend -path "*/migrations/*.py" -not -name "__init__.py" -delete
	rm -f backend/db.sqlite3

.PHONY: test
test:
	@echo "Running backend tests..."
	COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend pytest

.PHONY: test.front
test.front:
	@echo "Running frontend tests..."
	COMPOSE_PROJECT_NAME=coneshare docker-compose exec frontend npm test

.PHONY: lint.portal
lint.portal:
	@echo "Running portal linter..."
	COMPOSE_PROJECT_NAME=coneshare docker-compose exec portal npm run lint

.PHONY: lint.docs
lint.docs:
	@echo "Running feature docs checks..."
	./scripts/check-feature-docs.sh

.PHONY: portal
portal:
	@echo "Building static portal site..."
	COMPOSE_PROJECT_NAME=coneshare docker-compose exec portal npm run build

.PHONY: migrate
migrate:
	@echo "Running database migrations..."
	COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend python manage.py migrate

.PHONY: superuser
superuser:
	@echo "Creating a superuser..."
	COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend python manage.py createsuperuser

.PHONY: api.schema
api.schema:
	@echo "Generating OpenAPI schema..."
	COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend python manage.py spectacular --file /app/docs/api/openapi.yaml

.PHONY: api.schema.validate
api.schema.validate: api.schema
	@echo "Validating OpenAPI schema..."
	COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend python -m openapi_spec_validator /app/docs/api/openapi.yaml
