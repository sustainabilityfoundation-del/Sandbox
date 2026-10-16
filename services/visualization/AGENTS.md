# AGENTS.md: @ews/visualization-service

Image generation for concept visuals (PostgreSQL schema `visualization`) and the `/api/visualization/v1` plugin
hosted by `@ews/api`. Owner: the AI connection agent. Contracts:
[concept-visualization-contracts.md](../../docs/specifications/concept-visualization-contracts.md) §1, §3.
Types shared with clients: `@ews/visualization-client`.

## Rules

- Only this package reads or writes schema `visualization`. Migrations are append-only.
- Bytes live in the Project Management blob store passed in by the host (`BlobPort`); this package stores asset
  references only and never deletes bytes.
- Credentials: read only at run time through the host's `ImageAccessPort.credential()`; never stored, logged,
  returned or put in an error message. Adapters receive only the prompt, options and reference images.
- No placeholder images: when no adapter is usable, job creation is refused (409 `generation-unavailable`) and no
  job is created. The fake adapter is test-only (`testOnly: true`); the registry refuses it in production, and its
  output is a labelled SVG flagged `testAsset`.
- Idempotency: the job key is derived from the request (see `idempotencyKey`); never add a code path that creates
  a second job for the same key or re-runs an interrupted job automatically (it may have been charged).
- Generated images are illustrations, never evidence, geometry or verification (ADR-0070).

## Tests

- Unit: `services/visualization/src/**/*.test.ts` (`npm test`).
- Database: `services/visualization/test/*.test.ts` (`npm run req:test:db`). They use the fake adapter and a
  stubbed `fetch` for the OpenAI adapter; they never call a real provider.
