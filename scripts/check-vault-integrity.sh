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
#   ./scripts/check-vault-integrity.sh
#
# Can be run directly on the host (with Docker Compose) or inside the backend container.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_SCRIPT="${SCRIPT_DIR}/check-vault-integrity.py"

if [[ ! -f "${PYTHON_SCRIPT}" ]]; then
  echo "Error: Python audit script not found at ${PYTHON_SCRIPT}" >&2
  exit 1
fi

# Detect execution environment
if [[ -f "manage.py" ]] || [[ -f "/app/manage.py" ]]; then
  # Running inside a container or active Django virtualenv
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
  elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
  else
    echo "Error: Python binary not found." >&2
    exit 1
  fi

  RUNNER_PY="import sys, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings'); import django; django.setup(); exec(sys.stdin.read())"
  if [[ -f "manage.py" ]]; then
    "${PYTHON_BIN}" -c "${RUNNER_PY}" < "${PYTHON_SCRIPT}"
  else
    (cd /app && "${PYTHON_BIN}" -c "${RUNNER_PY}" < "${PYTHON_SCRIPT}")
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
    RUNNER_PY="import sys, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings'); import django; django.setup(); exec(sys.stdin.read())"
    COMPOSE_PROJECT_NAME="${PROJECT_NAME}" ${COMPOSE_CMD} exec -T backend python -c "${RUNNER_PY}" < "${PYTHON_SCRIPT}"
  else
    # Fallback to direct python if available
    if command -v python3 >/dev/null 2>&1; then
      python3 "${PYTHON_SCRIPT}"
    else
      echo "Error: Neither Docker Compose nor Python3 were detected." >&2
      echo "Please run inside your backend container: python scripts/check-vault-integrity.py" >&2
      exit 1
    fi
  fi
fi
