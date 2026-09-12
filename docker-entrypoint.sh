#!/bin/sh
set -eu

database_host="$(node ./build/scripts/wait-for-db.js)"
export DATABASE_HOST="$database_host"

npm run migrations
exec npm start
