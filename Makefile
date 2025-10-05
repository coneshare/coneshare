.DEFAULT_GOAL := help

# ====================================================================================
# HELPERS
# ====================================================================================

.PHONY: help
help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  up              - Start all services in detached mode"
	@echo "  down            - Stop and remove all services"
	@echo "  build           - Build or rebuild services"
	@echo "  logs            - Follow logs for all services"
	@echo "  back.sh         - Attach a shell to the backend container"
	@echo "  front.sh        - Attach a shell to the frontend container"
	@echo "  clean           - Remove migrations, .pyc files, and database"
	@echo "  test            - Run pytest in the backend container"


# ====================================================================================
# DOCKER COMMANDS
# ====================================================================================

.PHONY: up
up:
	COMPOSE_PROJECT_NAME=coneshare docker-compose up

.PHONY: down
down:
	docker-compose down

.PHONY: build
build:
	docker-compose build

.PHONY: logs
logs:
	docker-compose logs -f

.PHONY: back.sh
back.sh:
	COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend bash

.PHONY: front.sh
front.sh:
	COMPOSE_PROJECT_NAME=coneshare docker-compose exec frontend sh


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
	@echo "Running tests..."
	COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend pytest
