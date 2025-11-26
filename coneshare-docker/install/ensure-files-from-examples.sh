echo "${_group}Ensuring files from examples ..."

ensure_file_from_example runtime/coneshare.nginx.conf
ensure_file_from_example "$CONESHARE_SETTINGS_PY"
ensure_file_from_example runtime/gunicorn.conf.py

echo "${_endgroup}"
