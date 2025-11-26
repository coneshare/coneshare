echo "${_group}Turning things off ..."

if [[ -n "$MINIMIZE_DOWNTIME" ]]; then
  # Stop everything but nginx
  $dc rm -fsv $($dc config --services | grep -v -E '^(nginx)$')
else
  # Clean up old stuff and ensure nothing is working while we install/update
  $dc down -t $STOP_TIMEOUT --rmi local --remove-orphans
fi

echo "${_endgroup}"
