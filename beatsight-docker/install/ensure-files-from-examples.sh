echo "${_group}Ensuring files from examples ..."

ensure_file_from_example ../runtime/beatsight.nginx.conf
ensure_file_from_example "$BEATSIGHT_SETTINGS_PY"
ensure_file_from_example ../runtime/gunicorn.conf.py

echo "${_endgroup}"
