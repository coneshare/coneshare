echo "${_group}Detecting License file"

if [ ! -f "../license.json" ]; then
  echo "FAIL: Cound not find license.json in current directory. Exiting."
  exit 1
fi
echo "Found license.json in current directory"

echo "${_endgroup}"
