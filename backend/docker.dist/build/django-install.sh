#!/bin/bash
set -e

# move nginx logs to ${LOG_DIR}/nginx
sed -i \
  -e "s|access_log /var/log/nginx/access.log;|access_log ${LOG_DIR}/nginx/access.log;|" \
  -e "s|error_log /var/log/nginx/error.log;|error_log ${LOG_DIR}/nginx/error.log;|" \
  /etc/nginx/nginx.conf


# configure supervisord to use our program configs
ln -s ${RUNTIME_DIR}/nginx.supervisor.conf /etc/supervisor/conf.d/nginx.conf
ln -s ${RUNTIME_DIR}/core-serv.supervisor.conf /etc/supervisor/conf.d/core-serv.conf
ln -s ${RUNTIME_DIR}/web.supervisor.conf /etc/supervisor/conf.d/web.conf
