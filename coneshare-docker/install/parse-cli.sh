echo "${_group}Parsing command line ..."


show_help() {
  cat <<EOF
Usage: $0 [options]

Install Coneshare with \`docker compose\`.

Options:
 -h, --help             Show this message and exit.
 -v, --version          Version of current installer script.
 --minimize-downtime    EXPERIMENTAL: try to keep accepting events for as long
                          as possible while upgrading. This will disable cleanup
                          on error, and might leave your installation in a
                          partially upgraded state. This option might not reload
                          all configuration, and is only meant for in-place
                          upgrades.
EOF
}

show_version() {
  cat <<EOF
Version: 1.0.0
EOF
}

MINIMIZE_DOWNTIME="${MINIMIZE_DOWNTIME:-}"

while (($#)); do
  case "$1" in
  -h | --help)
    show_help
    exit
    ;;
  -v | --version)
    show_version
    exit
    ;;
  --minimize-downtime) MINIMIZE_DOWNTIME=1 ;;
  --) ;;
  *)
    echo "Unexpected argument: $1. Use --help for usage information."
    exit 1
    ;;
  esac
  shift
done

echo "${_endgroup}"
