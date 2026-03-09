#!/usr/bin/env bash
set -e

cd /home/coneshare/app
exec gosu coneshare python3 -m celery -A backend worker --loglevel=info
