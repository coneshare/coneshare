#!/usr/bin/env bash
# ==============================================================================
# Coneshare - Vault Storage Refactor Integrity Checker
# ==============================================================================
# This script audits the database to verify:
#   1. Folder structural invariants (root, personal, vault)
#   2. Dataroom vault_folder relationships (v2 linked, v1 isolated)
#   3. Document classification accuracy (is_dataroom_vault_document)
#   4. Personal quota calculation correctness
#
# Usage:
#   ./scripts/check-vault-integrity.sh [--strict]
#
# Can be run directly on the host (with Docker Compose) or inside the backend container.
# ==============================================================================

set -euo pipefail

# Detect execution environment
if [[ -f "manage.py" ]] || [[ -f "/app/manage.py" ]]; then
  # Running inside container or active Django virtualenv
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
  elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
  else
    echo "Error: Python binary not found." >&2
    exit 1
  fi

  if [[ -f "manage.py" ]]; then
    "${PYTHON_BIN}" manage.py check_vault_integrity "$@"
  else
    (cd /app && "${PYTHON_BIN}" manage.py check_vault_integrity "$@")
  fi

else
  # Running on the host system with Docker Compose
  COMPOSE_CMD=""
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
  fi

  if [[ -n "${COMPOSE_CMD}" ]]; then
    PROJECT_NAME="${COMPOSE_PROJECT_NAME:-coneshare}"
    echo "Running integrity check via Docker Compose (${PROJECT_NAME})..."
    COMPOSE_PROJECT_NAME="${PROJECT_NAME}" ${COMPOSE_CMD} exec -T backend python manage.py check_vault_integrity "$@"
  else
    echo "Error: Docker Compose was not detected and no manage.py was found in the current directory." >&2
    echo "Please run inside your backend container: python manage.py check_vault_integrity" >&2
    exit 1
  fi
fi
