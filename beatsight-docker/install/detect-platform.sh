echo "${_group}Detecting Docker platform"

if ! command -v docker &>/dev/null; then
  echo "FAIL: Could not find a \`docker\` binary on this system. Are you sure it's installed?"
  exit 1
fi

export DOCKER_ARCH=$(docker info --format '{{.Architecture}}')
if [[ "$DOCKER_ARCH" = "x86_64" ]]; then
  export DOCKER_PLATFORM="linux/amd64"
elif [[ "$DOCKER_ARCH" = "aarch64" ]]; then
  export DOCKER_PLATFORM="linux/arm64"
else
  echo "FAIL: Unsupported docker architecture $DOCKER_ARCH."
  exit 1
fi
echo "Detected Docker platform is $DOCKER_PLATFORM"

echo "${_endgroup}"
