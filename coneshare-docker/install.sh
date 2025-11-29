#!/usr/bin/env bash
set -eE

# Pre-pre-flight? 🤷
if [[ -n "$MSYSTEM" ]]; then
  echo "Seems like you are using an MSYS2-based system (such as Git Bash) which is not supported. Please use WSL instead."
  exit 1
fi

source install/_lib.sh

source install/parse-cli.sh
source install/detect-platform.sh
source install/dc-detect-version.sh
source install/check-minimum-requirements.sh

source install/turn-things-off.sh
source install/create-docker-volumes.sh
source install/ensure-app-env.sh
source install/generate-secret-key.sh
source install/update-docker-images.sh
source install/set-up-and-migrate-database.sh
source install/wrap-up.sh
