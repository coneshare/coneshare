#!/usr/bin/env bash

cd /home/coneshare/app && gosu coneshare bash -c 'python3 -m celery -A coneshare beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler'
