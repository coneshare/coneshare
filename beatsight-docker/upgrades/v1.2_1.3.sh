#!/usr/bin/env bash
set -eE

source install/_lib.sh
source install/parse-cli.sh
source install/dc-detect-version.sh

source install/turn-things-off.sh

docker run --rm -v beatsight-data:/data reg.beatsight.com/beatsight/beatsight:v1.3.0 python3 scripts/migrate_daily_commit.py


