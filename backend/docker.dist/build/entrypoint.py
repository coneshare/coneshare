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

    for dirname in ['supervisor', app, 'nginx']:
        check_call('mkdir -p %s/%s' % (log_dir, dirname), shell=True)
        check_call('chown -R coneshare:coneshare %s/%s' % (log_dir, dirname), shell=True)
        check_call('chmod -R 0755 %s/%s' % (log_dir, dirname), shell=True)

    # # get around of supervisor log permission bug
    # # issue: https://github.com/Supervisor/supervisor/issues/123
    # for filename in ['coneshare.log', 'core.out.log', 'script.log', 'task.log']:
    #     check_call('touch %s/%s/%s' % (log_dir, app, filename), shell=True)
    #     check_call('chown -R coneshare:coneshare %s/%s/%s' % (log_dir, app, filename), shell=True)


def main(argv):
    initialize_logdir()

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
        check_call("tail -f /home/coneshare/logs/supervisor/*.log /home/coneshare/logs/nginx/*.log /home/coneshare/logs/coneshare/*.log | grep  -v ping", shell=True)
    elif argv[1] == 'sudo':
        command = ' '.join(argv[2:])  # Join all arguments after the first
        check_call(f"{command}", shell=True)
    else:
        # Run the command provided as the second argument
        command = ' '.join(argv[1:])  # Join all arguments after the first
        check_call(f"gosu coneshare bash -c '{command}'", shell=True)

if __name__ == "__main__":
    # main program
    main(sys.argv)
