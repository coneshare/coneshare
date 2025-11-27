set -euo pipefail
test "${DEBUG:-}" && set -x

# Override any user-supplied umask that could cause problems, see #1222
umask 002

# Thanks to https://unix.stackexchange.com/a/145654/108960
log_file=beatsight_install_log-$(date +'%Y-%m-%d_%H-%M-%S').txt
exec &> >(tee -a "$log_file")


if [[ -f ../.env ]]; then
  _ENV_CUSTOM=true
else
  _ENV_CUSTOM=false
fi


# Read .env for default values with a tip o' the hat to https://stackoverflow.com/a/59831605/90297
# Summary of What the Command Does
#     Creates a temporary file.
#     Saves the current environment variables to that file.
#     Sets the shell to export all subsequently defined variables.
#     Sources a file (specified by $_ENV) that may define additional environment variables.
#     Stops the automatic exporting of new variables.
#     Sources the temporary file to restore the previously saved environment variables.
#     Cleans up by deleting the temporary file and unsetting the variable t.

# Purpose
# The overall purpose of this command sequence is to manage and preserve the environment variables within a shell session, allowing for the integration of additional variables from a specified file while ensuring that the original environment is restored afterward. This is useful in scenarios where you want to temporarily modify the environment without permanently affecting it.
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
    # sed from https://stackoverflow.com/a/25123013/90297
    example="$(echo "$target" | sed 's|^\.\./||; s|\(.*\)\(\.[^.]*\)$|\1.example\2|')"
    if [[ ! -f "$example" ]]; then
      echo "Oops! Where did $example go? 🤨 We need it in order to create $target."
      exit
    fi
    echo "Creating $target ..."
    cp -n "$example" "$target"
  fi
}

mkdir -p ../runtime ../logs
BEATSIGHT_SETTINGS_PY=../runtime/beatsight_settings.py

# Increase the default 10 second SIGTERM timeout
# to ensure celery queues are properly drained
# between upgrades as task signatures may change across
# versions
STOP_TIMEOUT=60 # seconds

