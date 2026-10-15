# ADR-0019: Declarative (serializable) service proposals applied by the platform

Status: Proposed (2026-10-14)

## Context

SDK 1.5 `ServiceProposal` (ADR-0015) carries an `apply` closure created by a tool action in the browser; the
workspace keeps it in memory, so a proposal can only be applied in the window that prepared it
(`apps/workspace/src/assistant/serviceProposals.ts`). The Design Reasoning Engine runs server-side and cannot
create closures. The brief requires structured proposals (action, rationale, affected entities, effects,
evidence, assumptions, uncertainty, required approvals) applied through existing authorization and AI action
infrastructure, without silent mutation. ADR-0013 (proposed) anticipates a server-side execution gateway.

## Decision

- Add a **declarative** form of `ServiceProposal` (CR-A1, CR-S4): `operations: ModuleOperation[]`, each naming
  the owning module, its OpenAPI `operationId`, parameters, body, `If-Match`, an idempotency key derived from
  the proposal ID, and optional placeholders for IDs created by earlier operations.
- The platform executor stores declarative proposals as data, previews them with the extended metadata, and
  on **Apply** executes the operations through the module clients it already constructs, with provenance
  headers. Partial completion of multi-module proposals is reported; no global transaction is implied.
- The engine produces only drafts in this form; it never applies them. Modules validate, authorize and record
  history exactly as for user edits.
- Closure-based proposals remain supported; the preview policy (user applies every change) is unchanged.

## Consequences

- Proposals survive reloads and can be applied from any window; they are auditable as data.
- The same descriptors can later be executed by a server-side gateway (ADR-0013) without changing producers.
- Multi-record work should use one atomic module call (Conceptualize batch, CR-C10) to avoid partial states.
- Security: operations are checked against an allowlist of operationIds per module and the user's
  entitlements at Apply time; a draft cannot name arbitrary URLs.
- Alternatives considered: the engine applies on the user's behalf after a confirmation call (rejected: the
  engine would become a writer and a competing execution gateway); keep closures and have reasoning tools
  run in the browser (rejected: excludes server-side runs and phase 3).
