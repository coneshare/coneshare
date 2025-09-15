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


# ====================================================================================
# DOCKER COMMANDS
# ====================================================================================

.PHONY: up
up:
	COMPOSE_PROJECT_NAME=beatsight docker-compose up

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
	COMPOSE_PROJECT_NAME=beatsight docker-compose exec backend bash

.PHONY: front.sh
front.sh:
	COMPOSE_PROJECT_NAME=beatsight docker-compose exec frontend sh
