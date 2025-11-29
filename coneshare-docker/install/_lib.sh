set -euo pipefail
test "${DEBUG:-}" && set -x

# Override any user-supplied umask that could cause problems, see #1222
umask 002

# Thanks to https://unix.stackexchange.com/a/145654/108960
log_file=coneshare_install_log-$(date +'%Y-%m-%d_%H-%M-%S').txt
exec &> >(tee -a "$log_file")


if [[ -f ../.env ]]; then
  _ENV_CUSTOM=true
else
  _ENV_CUSTOM=false
fi

if [[ $_ENV_CUSTOM == true ]]; then
  t=$(mktemp) && export -p >"$t" && set -a && . .env && . ../.env && set +a && . "$t" && rm "$t" && unset t
else
  # If _ENV_CUSTOM is false
  t=$(mktemp) && export -p >"$t" && set -a && . .env && set +a && . "$t" && rm "$t" && unset t
fi

if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
  _group="::group::"
  _endgroup="::endgroup::"
else
  _group="=== "
  _endgroup=""
fi

# A couple of the config files are referenced from other subscripts, so they
# get vars, while multiple subscripts call ensure_file_from_example.
function ensure_file_from_example {
  target="$1"
  if [[ -f "$target" ]]; then
    echo "$target already exists, skipped creation."
  else
    example="$(echo "$target" | sed 's|^\(.*\)\(\.[^.]*\)$|\1.example\2|')"
    if [[ ! -f "$example" ]]; then
      echo "Oops! Where did $example go? 🤨 We need it in order to create $target."
      exit
    fi
    echo "Creating $target ..."
    cp -n "$example" "$target"
  fi
}

function ensure_app_env {
  if [[ -f "../app.env" ]]; then
    echo "../app.env already exists, skipped creation."
  else
    if [[ ! -f "app.env.example" ]]; then
      echo "Oops! Where did app.env.example go? 🤨 We need it in order to create ../app.env."
      exit 1
    fi
    echo "Creating ../app.env ..."
    cp -n "app.env.example" "../app.env"
  fi
}

mkdir -p ../logs

# Increase the default 10 second SIGTERM timeout
# to ensure celery queues are properly drained
# between upgrades as task signatures may change across
# versions
STOP_TIMEOUT=60 # seconds
