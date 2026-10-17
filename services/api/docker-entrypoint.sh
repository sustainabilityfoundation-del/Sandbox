#!/bin/sh
# Container entry point. When DATABASE_URL is not set but the database coordinates are (ECS injects them from the Secrets Manager
# secret as DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD), assemble DATABASE_URL with proper URL encoding and TLS verification
# against the RDS certificate bundle. The password is never printed and never passed on a command line (node reads it from the
# environment). Then run the command given to the container.
set -eu

if [ -z "${DATABASE_URL:-}" ] && [ -n "${DB_HOST:-}" ]; then
  DATABASE_URL="$(node --input-type=commonjs -e '
    const e = process.env
    for (const k of ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"]) {
      if (!e[k]) { console.error("docker-entrypoint: " + k + " is not set"); process.exit(1) }
    }
    const enc = encodeURIComponent
    const ca = e.DB_SSL_ROOT_CERT || "/etc/ssl/certs/rds-global-bundle.pem"
    const host = e.DB_HOST_OVERRIDE || e.DB_HOST  // set after a restore into a new instance (runbook)
    process.stdout.write("postgres://" + enc(e.DB_USER) + ":" + enc(e.DB_PASSWORD) + "@" + host + ":" + (e.DB_PORT || "5432") + "/" + enc(e.DB_NAME) + "?sslmode=verify-full&sslrootcert=" + enc(ca))
  ')"
  export DATABASE_URL
  unset DB_PASSWORD
fi

exec "$@"
