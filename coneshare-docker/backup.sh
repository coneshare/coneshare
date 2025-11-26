#!/usr/bin/env bash

docker run --rm -v coneshare-data:/data -v "$PWD/backups:/backups" ${CONESHARE_IMAGE} tar -czvf /backups/coneshare-data-backup.tar.gz /data

# # restore
# docker run --rm -v coneshare-data:/data -v "$PWD/backup:/backup" ${CONESHARE_IMAGE} tar xzf /backup/coneshare-data-backup-<timestamp>.tar.gz -C /data
