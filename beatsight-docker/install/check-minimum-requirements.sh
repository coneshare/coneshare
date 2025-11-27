echo "${_group}Checking minimum requirements ..."

source install/_min-requirements.sh

# Check the version of $1 is greater than or equal to $2 using sort. Note: versions must be stripped of "v"
function vergte() {
  printf "%s\n%s" $1 $2 | sort --version-sort --check=quiet --reverse
  echo $?
}

DOCKER_VERSION=$(docker version --format '{{.Server.Version}}' || echo '')
if [[ -z "$DOCKER_VERSION" ]]; then
  echo "FAIL: Unable to get docker version, is the docker daemon running?"
  exit 1
fi

if [[ "$(vergte ${DOCKER_VERSION//v/} $MIN_DOCKER_VERSION)" -eq 1 ]]; then
  echo "FAIL: Expected minimum docker version to be $MIN_DOCKER_VERSION but found $DOCKER_VERSION"
  exit 1
fi
echo "Found Docker version $DOCKER_VERSION"

COMPOSE_VERSION=$($dc_base version --short || echo '')
if [[ -z "$COMPOSE_VERSION" ]]; then
  echo "FAIL: Docker compose is required to run self-hosted"
  exit 1
fi

if [[ "$(vergte ${COMPOSE_VERSION//v/} $MIN_COMPOSE_VERSION)" -eq 1 ]]; then
  echo "FAIL: Expected minimum $dc_base version to be $MIN_COMPOSE_VERSION but found $COMPOSE_VERSION"
  exit 1
fi
echo "Found Docker Compose version $COMPOSE_VERSION"

CPU_AVAILABLE_IN_DOCKER=$(docker run --rm busybox nproc --all)
if [[ "$CPU_AVAILABLE_IN_DOCKER" -lt "$MIN_CPU_HARD" ]]; then
  echo "FAIL: Required minimum CPU cores available to Docker is $MIN_CPU_HARD, found $CPU_AVAILABLE_IN_DOCKER"
  exit 1
fi
echo "Found CPU available in docker: $CPU_AVAILABLE_IN_DOCKER"

RAM_AVAILABLE_IN_DOCKER=$(docker run --rm busybox free -m 2>/dev/null | awk '/Mem/ {print $2}')
if [[ "$RAM_AVAILABLE_IN_DOCKER" -lt "$MIN_RAM_HARD" ]]; then
  echo "FAIL: Required minimum RAM available to Docker is $MIN_RAM_HARD MB, found $RAM_AVAILABLE_IN_DOCKER MB"
  exit 1
fi
echo "Found RAM available in docker: ${RAM_AVAILABLE_IN_DOCKER}MB"

echo "${_endgroup}"
