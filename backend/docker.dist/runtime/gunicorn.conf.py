import os

# Number of worker processes (conservative default of 2 to avoid container memory exhaustion)
raw_workers = os.environ.get("GUNICORN_WORKERS")
try:
    workers = max(1, int(raw_workers)) if raw_workers else 2
except ValueError:
    workers = 2

# Number of threads per worker process
try:
    threads = max(1, int(os.environ.get("GUNICORN_THREADS", "2")))
except ValueError:
    threads = 2

# Worker recycling to mitigate container memory bloat and leaks
try:
    max_requests = max(1, int(os.environ.get("GUNICORN_MAX_REQUESTS", "1000")))
except ValueError:
    max_requests = 1000

try:
    max_requests_jitter = max(0, int(os.environ.get("GUNICORN_MAX_REQUESTS_JITTER", "50")))
except ValueError:
    max_requests_jitter = 50

# Bind Gunicorn to a local port
bind = "127.0.0.1:9998"

# Timeout for worker processes
timeout = 60

# Path to the Django project directory
chdir = "/home/coneshare/app"

# WSGI module name
wsgi_app = "backend.wsgi:application"

# User and group to run Gunicorn as
user = "coneshare"
group = "coneshare"

# Log files (stream to stdout/stderr for container-native logging)
accesslog = "-"
errorlog = "-"

# Logging level
loglevel = "info"

# Daemon mode
daemon = False

# PID file
pidfile = "/tmp/gunicorn.pid"
