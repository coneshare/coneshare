if [[ "$MINIMIZE_DOWNTIME" ]]; then
  echo "${_group}Waiting for Coneshare to start ..."

  # Start the whole setup, except nginx.
  $dc up -d --remove-orphans $($dc config --services | grep -v -E '^(nginx)$')
  $dc exec -T nginx nginx -s reload

  docker run --rm --network="${COMPOSE_PROJECT_NAME}_default" alpine ash \
    -c 'while [[ "$(wget -T 1 -q -O- http://web:9000/_health/)" != "ok" ]]; do sleep 0.5; done'

  # Make sure everything is up. This should only touch nginx
  $dc up -d

  echo "${_endgroup}"
else
  echo ""
  echo "-----------------------------------------------------------------"
  echo ""
  echo "You're all done! Run the following command to get Coneshare running:"
  echo ""
  echo "  ./start.sh"
  echo ""
  echo "-----------------------------------------------------------------"
  echo ""
fi
