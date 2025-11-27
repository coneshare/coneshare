#!/usr/bin/env bash

docker run --rm -v beatsight-data:/data -v "$PWD/backups:/backups" reg.beatsight.com/beatsight/beatsight:v1.2.4 tar -czvf /backups/beatsight-data-backup.tar.gz /data

# # restore
# docker run --rm -v beatsight-data:/data -v "$PWD/backup:/backup" reg.beatsight.com/beatsight/beatsight:v1.2.4 tar xzf /backup/beatsight-data-backup-<timestamp>.tar.gz -C /data
