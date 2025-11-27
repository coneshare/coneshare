echo "${_group}Fetching and updating Docker images ..."

echo "BEATSIGHT IMAGE: ${BEATSIGHT_IMAGE}"
docker pull ${BEATSIGHT_IMAGE}

echo "${_endgroup}"
