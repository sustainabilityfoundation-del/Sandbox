# CX-002: Generated API reference pages from OpenAPI

Goal: generate concise Markdown reference pages for every hosted service from its OpenAPI document, so agents do not
write duplicate API documentation.

Paths you may change: `scripts/gen-api-reference.mjs` (new), `docs/reference/` (new, generated output and a README),
root `package.json` (one script `docs:api`), `docs/codex/README.md` (status row).

Requirements:
- Obtain each OpenAPI document without running servers: each service package builds its OpenAPI object in code (look
  for `openapi` in `services/*/src`); import those builders with `tsx`, or start the API host in-process the way the
  database tests do (`services/api/test`) if a builder is not exported. Do not modify services.
- One page per service: title, base path, operations grouped by tag (method, path, operationId, summary, request body
  and response schema names), with a header line "Generated from OpenAPI by scripts/gen-api-reference.mjs; do not edit".
- Deterministic output (sorted), so regenerating without API changes produces no diff.

Acceptance: `npm run docs:api` runs twice with no diff the second time; `npm run check` passes.
