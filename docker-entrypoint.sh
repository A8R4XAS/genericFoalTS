#!/bin/sh
set -eu

retries="${DATABASE_CONNECT_RETRIES:-30}"
delay="${DATABASE_CONNECT_DELAY:-2}"
attempt=1

until node -e "const { Client } = require('pg'); const client = new Client({ host: process.env.DATABASE_HOST, port: Number(process.env.DATABASE_PORT), user: process.env.DATABASE_USERNAME, password: process.env.DATABASE_PASSWORD, database: process.env.DATABASE_NAME }); const timeout = setTimeout(() => process.exit(1), 2000); client.connect().then(() => client.end()).then(() => { clearTimeout(timeout); process.exit(0); }).catch(() => process.exit(1));"; do
  if [ "$attempt" -ge "$retries" ]; then
    echo "Database is not reachable after $retries attempts." >&2
    exit 1
  fi

  echo "Waiting for database connection (${attempt}/${retries})..."
  attempt=$((attempt + 1))
  sleep "$delay"
done

npm run migrations
exec npm start
