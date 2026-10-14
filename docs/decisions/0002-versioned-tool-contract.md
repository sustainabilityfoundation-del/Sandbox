# ADR-0002: Versioned tool contract and PlatformHost

Status: Accepted (2026-10-13)

## Context

Modules integrate through documented APIs, never private storage (vision §4), and must be usable
without the complete suite (§11).

## Decision

Tools are defined against `@ews/platform-sdk` (semver; currently 1.1.0). A tool declares
`sdkVersion` as a caret range and the registry refuses incompatible tools. Tools reach data only
through `ToolApi` and hooks backed by a `PlatformHost`, implemented by the workspace and by a mock
host in each harness. Contract changes are recorded in `packages/platform-sdk/CHANGELOG.md` with a
migration note.

## Consequences

- Additive changes (1.1.0: revisions, baselines, references) do not break tools built for 1.0.
- Every contract change is validated against all tools (`npm run check`, harnesses).
