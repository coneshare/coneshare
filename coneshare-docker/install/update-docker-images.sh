echo "${_group}Fetching and updating Docker images ..."

echo "CONESHARE IMAGE: ${CONESHARE_IMAGE}"
docker pull ${CONESHARE_IMAGE}

echo "${_endgroup}"
