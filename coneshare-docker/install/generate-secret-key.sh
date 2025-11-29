echo "${_group}Generating secret key ..."

if grep -q "SECRET_KEY=django-insecure-development-key-for-coneshare" ../app.env; then
  # This is to escape the secret key to be used in sed below
  # Note the need to set LC_ALL=C due to BSD tr and sed always trying to decode
  # whatever is passed to them. Kudos to https://stackoverflow.com/a/23584470/90297
  SECRET_KEY=$(
    export LC_ALL=C
    head /dev/urandom | tr -dc "a-z0-9@#%^&*(-_=+)" | head -c 50 | sed -e 's/[\/&]/\\&/g'
  )
  sed -i -e "s/^SECRET_KEY=.*$/SECRET_KEY=$SECRET_KEY/" ../app.env
  echo "Secret key written to ../app.env"
fi

echo "${_endgroup}"
