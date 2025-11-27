#!/bin/bash
set -e

# move nginx logs to ${LOG_DIR}/nginx
sed -i \
  -e "s|access_log /var/log/nginx/access.log;|access_log ${LOG_DIR}/nginx/access.log;|" \
  -e "s|error_log /var/log/nginx/error.log;|error_log ${LOG_DIR}/nginx/error.log;|" \
  /etc/nginx/nginx.conf


# configure supervisord to start nginx
cat > /etc/supervisor/conf.d/nginx.conf <<EOF
[program:nginx]
priority=20
directory=/tmp
command=/usr/sbin/nginx -g "daemon off;"
user=root
autostart=true
autorestart=true
stdout_logfile=${LOG_DIR}/nginx/%(program_name)s.log
stderr_logfile=${LOG_DIR}/nginx/%(program_name)s.log
EOF


# configure supervisord to start file server
cat > /etc/supervisor/conf.d/core.conf <<EOF
[program:core-serv]
command=/home/coneshare/app/core-serv
directory=/home/coneshare/app
user=coneshare
autostart=true
autorestart=true
EOF



# configure supervisord to start Web using gunicorn
cat > /etc/supervisor/conf.d/web.conf <<EOF
[program:web]
command=/usr/local/bin/gunicorn -c /home/coneshare/runtime/gunicorn.conf.py
directory=/home/coneshare/app
user=coneshare
stdout_logfile=${LOG_DIR}/supervisor/out.log
stderr_logfile=${LOG_DIR}/supervisor/error.log
redirect_stderr=true
environment=DJANGO_SETTINGS_MODULE="backend.settings"
EOF
