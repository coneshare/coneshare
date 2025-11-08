#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

# Define cleanup function
cleanup() {
    echo "--- Shutting down Docker services ---"
    docker compose down -v
}
# Register cleanup function to be called on script exit
trap cleanup EXIT

echo "--- Building and starting Docker services ---"
docker compose up -d --build

echo "--- Waiting for services to be ready ---"
# A simple sleep is often sufficient for local testing.
# In a CI environment, you might use a more robust wait-for-it script.
sleep 15

echo "--- Resetting database and creating test data ---"
docker compose exec -T backend python manage.py flush --no-input
docker compose exec -T backend python manage.py migrate
docker compose exec -T backend python manage.py create_test_data

echo "--- Running Playwright E2E tests ---"
(cd e2e && npm test)

echo "--- E2E tests finished successfully ---"
