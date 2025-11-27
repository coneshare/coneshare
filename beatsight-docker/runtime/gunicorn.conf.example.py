import multiprocessing

# # Bind Gunicorn to a Unix socket
# bind = 'unix:/tmp/gunicorn.sock'
bind = '127.0.0.1:9998'

# Number of worker processes
workers = multiprocessing.cpu_count() * 2 + 1

# Number of threads per worker process
threads = 2

# Timeout for worker processes
timeout = 60

# Path to the Django project directory
chdir = '/home/beatsight/app'

# WSGI module name (default is 'app.wsgi:application')
wsgi_app = 'beatsight.wsgi:application'

# User and group to run Gunicorn as
user = 'beatsight'
group = 'beatsight'

# Log files
accesslog = '/home/beatsight/logs/beatsight/gunicorn-access.log'
errorlog = '/home/beatsight/logs/beatsight/gunicorn-error.log'

# Logging level
loglevel = 'info'

# Daemon mode
daemon = False

# PID file
pidfile = '/tmp/gunicorn.pid'
