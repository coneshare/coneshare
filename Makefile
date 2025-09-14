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
	@echo "  attach-backend  - Attach a shell to the backend container"
	@echo "  attach-frontend - Attach a shell to the frontend container"


# ====================================================================================
# DOCKER COMMANDS
# ====================================================================================

.PHONY: up
up:
	docker-compose up -d

.PHONY: down
down:
	docker-compose down

.PHONY: build
build:
	docker-compose build

.PHONY: logs
logs:
	docker-compose logs -f

.PHONY: attach-backend
attach-backend:
	docker-compose exec backend bash

.PHONY: attach-frontend
attach-frontend:
	docker-compose exec frontend sh
