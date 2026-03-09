#!/usr/bin/python3
import os
import sys
import time
from subprocess import check_call

def initialize_logdir(app='coneshare'):
    """create log directory for app
            /var/log/supervisor
            /var/log/nginx
    """

    log_dir = os.environ['LOG_DIR']

    for dirname in ['nginx']:
        check_call('mkdir -p %s/%s' % (log_dir, dirname), shell=True)

    check_call('chown -R coneshare:coneshare %s' % (log_dir), shell=True)
    check_call('chmod -R 0755 %s' % (log_dir), shell=True)

def change_ugid():
    """Change the UID/GID of the existing container user at runtime
    so they match the host user that owns the mounted files.
    """
    puid = os.getenv("PUID")
    pgid = os.getenv("PGID")

    if puid:
        check_call(f'usermod -o -u {puid} coneshare', shell=True)

    if pgid:
        check_call(f'groupmod -o -g {pgid} coneshare', shell=True)


def main(argv):
    initialize_logdir()
    change_ugid()

    app_dir = os.environ['APP_DIR']
    os.chdir(app_dir)

    if argv[1] == 'debug':
        print('Docker image is running, you can attach into the container for debug')
        while 1:
            time.sleep(5)
    elif argv[1] == 'coneshare':
        check_call("gosu coneshare bash -c 'rm -rf /tmp/gunicorn.pid'", shell=True)

        # Start the container.
        check_call("supervisord -c /home/coneshare/runtime/supervisord/supervisord.conf", shell=True)
        time.sleep(5)
        check_call("tail -f /home/coneshare/logs/*.log", shell=True)
    # elif argv[1] == 'sudo':
    #     command = ' '.join(argv[2:])  # Join all arguments after the first
    #     check_call(f"{command}", shell=True)
    else:
        # Run the command provided as the second argument
        command = ' '.join(argv[1:])  # Join all arguments after the first
        check_call(["gosu", "coneshare", "bash", "-c", command])


if __name__ == "__main__":
    main(sys.argv)
