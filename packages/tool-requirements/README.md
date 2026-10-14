# @ews/tool-requirements: Requirements Management

Requirements collections, search and filters, lifecycle and reviews, typed traceability and
allocation to twin components, immutable baselines, quality assistance and import/export. The
canonical data lives in the PostgreSQL-backed Requirements API; this package is the UI.

## Run it on its own

```bash
npm install                 # from the repository root
npm run dev:api             # API on :8787 with an embedded PostgreSQL (or EWS_PG=external + Docker Compose)
npm run dev:requirements    # harness on http://localhost:5181 (proxies /api to :8787)
```

Harness options (query string): `?user=ada|rui|eli|rho|nia` (development identity sent as
`X-Dev-User`), `?mode=demo` (explicit in-browser demo adapter; SDK features only). If the API is not
running the harness says so; it never falls back to demo data.

## Use it in the workspace

The workspace registers `requirementsTool` and must provide `services.requirements`
(`createHttpRequirementsService` from `@ews/requirements-client`). See the integration needs in
`docs/specifications/requirements-management-progress.md`.

## Check

```bash
npm run typecheck -w @ews/tool-requirements
npx vitest run packages/tool-requirements
npm run build:harness -w @ews/tool-requirements
```

See [AGENTS.md](./AGENTS.md) for responsibilities, dependencies and rules.

## Planned work

[Requirements navigation and filtering at scale](../../docs/specifications/requirements-navigation-filtering.md)
defines the requested bounded left submenu (default 10 visible requirements), contextual/structured
filters, AI query operations and staged delivery. It extends existing table capabilities and requires
coordinated Platform changes; it is not implemented by the documentation update.
