#!/usr/bin/env bash

dc_base="$(docker compose version &>/dev/null && echo 'docker compose' || echo 'docker-compose')"
dc="$dc_base"

if [[ -f "../.env" ]]; then
    $dc --env-file .env --env-file ../.env up -d
else
    $dc up -d
fi
