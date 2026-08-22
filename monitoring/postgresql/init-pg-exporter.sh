#!/bin/sh
set -eu

exporter_password="$(tr -d '\r\n' < /run/secrets/postgres_exporter_password)"

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=exporter_password="$exporter_password" \
  --set=database_name="$POSTGRES_DB" <<'SQL'
CREATE ROLE postgres_exporter LOGIN PASSWORD :'exporter_password';
GRANT CONNECT ON DATABASE :"database_name" TO postgres_exporter;
GRANT pg_monitor TO postgres_exporter;
SQL