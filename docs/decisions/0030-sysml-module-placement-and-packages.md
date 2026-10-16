# ADR-0030: SysML Modeler — placement, packages and tool identity

Status: Accepted (16 October 2026, coordinator, after review against main 186db1c; amendments recorded below)

## Context

The brief (docs/specifications/sysml-program.md §15) asks whether the MBSE module should live in its own
repository or as an isolated module, favouring independent development and deployment. Contracts §1 and
§3 already fix the tool ID `sysml-modeler`, entitlement `tool:sysml`, and suggest four packages.

## Decision

- Keep the module in this monorepo (ADR-0001) as four packages with one-directional dependencies:
  `@ews/sysml-core` (framework-free; no React, no Node-only APIs) ← `@ews/sysml-service`
  (services/sysml, Fastify plugin, schema `sysml`) and `@ews/sysml-client` (browser) ←
  `@ews/tool-sysml-modeler` (UI, assistant, help, harness).
- The tool imports only `@ews/platform-sdk`, `@ews/design-system`, `@ews/sysml-client` and
  `@ews/sysml-core` (types and pure functions for projections and text). It never imports another
  tool or the illustrative `tool-sysml`.
- The illustrative `tool-sysml` stayed registered and unchanged when this ADR was accepted. **Amended by [ADR-0076](0076-retire-illustrative-tools-system-model.md) (16 October 2026): it is retired from the interface (no longer registered); its package, twin data (SysML elements, `represents` links) and the ID `sysml` are kept, and no data migration is decided.** The tool shown to users is now named "System Model" (ID `sysml-modeler` unchanged).
- The SDK now offers a read-only `PlatformServices.sysml` (SDK 1.8); the tool still builds its own
  client through `createSysmlModelerTool({ mode, baseUrl, devUser, storage, client })`, which the
  workspace registers.

## Consequences

- Independent deployment: the service is a plugin with its own schema and OpenAPI; the tool runs
  standalone in its harness with the local adapter (no server) or the API.
- Extraction to a separate repository later needs only a published SDK and a compatibility manifest.
- `boundaries.test.ts` needs entries for the new packages (CR-SYSML-04).

## Alternatives considered

- Separate repository now: rejected; platform contracts still change daily.
- Extending `tool-sysml`: rejected by contracts §1 (keep the illustrative tool working unchanged).

## Amendments on acceptance

- Retirement of `tool-sysml` from the interface: done by ADR-0076. Migration of its twin data is not decided (the data is kept).
- `PlatformServices.sysml` exists (SDK 1.8, read-only); the factory signature is `createSysmlModelerTool({ mode, baseUrl, devUser, storage, client })` (`packages/tool-sysml-modeler/src/index.ts:31`).
