# Don't forget to update the README and other docs when you change these!
MIN_DOCKER_VERSION='19.03.6'
MIN_COMPOSE_VERSION='2.13.0'    # 2.17.0 for multiple --env-file

# 8 GB minimum host RAM, but there'll be some overhead outside of what
# can be allotted to docker
MIN_RAM_HARD=${MIN_RAM_HARD:-4000} # MB

MIN_CPU_HARD=${MIN_CPU_HARD:-2}
