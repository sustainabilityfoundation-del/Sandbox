# ADR-0030: SysML Modeler — placement, packages and tool identity

Status: Proposed (2026-10-14, SysML agent; needs coordinator acceptance)

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
- The illustrative tool stays unchanged; replacement is a later coordinator decision (contracts §1).
- Until the SDK offers a SysML service (CR-SYSML-01), the tool package exports a factory
  `createSysmlModelerTool({ mode, devUser })` that builds its client; the workspace registers it.

## Consequences

- Independent deployment: the service is a plugin with its own schema and OpenAPI; the tool runs
  standalone in its harness with the local adapter (no server) or the API.
- Extraction to a separate repository later needs only a published SDK and a compatibility manifest.
- `boundaries.test.ts` needs entries for the new packages (CR-SYSML-04).

## Alternatives considered

- Separate repository now: rejected; platform contracts still change daily.
- Extending `tool-sysml`: rejected by contracts §1 (keep the illustrative tool working unchanged).
