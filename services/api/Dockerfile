# syntax=docker/dockerfile:1.7
#
# The API host (services/api) as a container image. Build context: the repository root.
#   docker buildx build --platform linux/arm64 -f services/api/Dockerfile -t ews/api:<git sha> .
#
# Reproducible: a pinned base tag (pin the digest too with --build-arg NODE_IMAGE=node:24.20.0-bookworm-slim@sha256:<digest>),
# `npm ci` from package-lock.json, no network access at run time except the database and the AI providers people connect.
# Multi-stage: dependencies are installed in one stage, the CA bundle is fetched in another, the runtime stage copies the results.
# Non-root: the process runs as the unprivileged `node` user (uid 1000, which owns the EFS access point).
# Embedded PostgreSQL is never in the image: the stage removes the package and the build fails if it can still be imported, and
# EWS_DEPLOYED=1 / EWS_PG=external are the image defaults, so the server also refuses to start without DATABASE_URL.

ARG NODE_IMAGE=node:24.20.0-bookworm-slim

# ---- dependencies ---------------------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node . .
# Only @ews/api and the workspaces it depends on, from the lock file; install scripts are not run.
RUN npm ci --workspace @ews/api --include-workspace-root --ignore-scripts
# Embedded PostgreSQL is a development convenience (a devDependency of @ews/api, loaded by dynamic import). Remove it and prove it.
RUN rm -rf node_modules/embedded-postgres node_modules/@embedded-postgres \
 && if node --input-type=module -e "await import('embedded-postgres')" 2>/dev/null; then echo 'embedded-postgres is still installed' >&2; exit 1; fi \
 && rm -rf /home/node/.npm

# ---- RDS certificate bundle (TLS verification of the database) --------------------------------------------------------------
FROM ${NODE_IMAGE} AS certs
# Optional integrity pin: --build-arg RDS_BUNDLE_SHA256=<hex>. Record the value you verified in the runbook.
ARG RDS_BUNDLE_URL=https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
ARG RDS_BUNDLE_SHA256=
COPY services/api/docker-fetch-ca.mjs /tmp/docker-fetch-ca.mjs
RUN node /tmp/docker-fetch-ca.mjs "$RDS_BUNDLE_URL" /certs/rds-global-bundle.pem $RDS_BUNDLE_SHA256

# ---- runtime --------------------------------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV EWS_DEPLOYED=1 \
    EWS_PG=external \
    API_HOST=0.0.0.0 \
    API_PORT=8080 \
    STORAGE_DIR=/data/objects \
    SEED_ON_START=false \
    NODE_OPTIONS=--enable-source-maps
WORKDIR /app
COPY --from=deps /app /app
COPY --from=certs /certs/rds-global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
COPY --chmod=0755 services/api/docker-entrypoint.sh /usr/local/bin/ews-entrypoint
RUN mkdir -p /app/.data /data/objects && chown -R node:node /app/.data /data
USER node
EXPOSE 8080
# Liveness only (never touches the database). ECS and the load balancer define their own checks; this one serves `docker run`.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.API_PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# The entry point assembles DATABASE_URL from DB_* variables (when DATABASE_URL is not set) and then runs the command.
ENTRYPOINT ["/usr/local/bin/ews-entrypoint"]
CMD ["node", "--import", "tsx", "services/api/src/main.ts"]
