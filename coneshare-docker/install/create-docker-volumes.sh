echo "${_group}Creating volumes for persistent storage ..."

echo "Created $(docker volume create --name=coneshare-data)."
echo "Created $(docker volume create --name=coneshare-postgres)."
echo "Created $(docker volume create --name=coneshare-redis)."

echo "${_endgroup}"
