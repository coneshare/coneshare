#!/usr/bin/env bash

cd /home/coneshare/app && gosu coneshare bash -c 'python3 -m celery -A coneshare worker --loglevel=info'
