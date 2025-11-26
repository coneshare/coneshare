echo "${_group}Setting up / migrating database ..."

$dc up -d postgres
# Wait for postgres
RETRIES=5
until $dc exec postgres psql -U postgres -c "select 1" >/dev/null 2>&1 || [ $RETRIES -eq 0 ]; do
  echo "Waiting for postgres server, $((RETRIES--)) remaining attempts..."
  sleep 1
done

os=$($dc exec postgres cat /etc/os-release | grep 'ID=debian')
if [[ -z $os ]]; then
  echo "Postgres image debian check failed, exiting..."
  exit 1
fi


$dcr web python3 manage.py migrate

echo "${_endgroup}"
