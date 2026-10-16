# ADR-0049: Persisted declarative proposals, server-side Apply gateway and headless contributions

Status: Proposed (2026-10-15, AI connection agent)

Implements [ADR-0042](0042-declarative-service-proposals.md) and integration milestone 1 C9 / C13
([integration-milestone-1.md](../specifications/integration-milestone-1.md) §4). Related: ADR-0047.

## Context

Service proposals carried `apply` closures held in browser memory (R6): a reload lost them and they could be
applied only in the window that prepared them. Some assistant operations depended on a mounted tool view (R5).
Project Management and design reasoning have operations but no tool view (CR-PM-WS-2, CR-A2).

## Decision

1. **Headless contributions.** `registerPlatformModule({ id, name, entitlement?, assistant?, help?, settings? })`
   (SDK 1.8 `PlatformModuleContribution`, apps/workspace/src/platform/platformModules.ts). The assistant reads
   tools and modules through one accessor, `assistantContributions()`; the Help Service and the Settings centre
   list module help and settings like tools'. Operations receive services through `AssistantActionContext.services`.
2. **Declarative proposals (SDK 1.8).** An action may return `DeclarativeProposal`: preview, `operations:
   ModuleOperation[]` (module, OpenAPI operationId, method, path relative to the module base path, body,
   `ifMatch`, idempotency key, `$result[n].field` placeholders) and `expected: ExpectedRevision[]`.
3. **Persistence.** Every proposal shown is stored by `services/assistant` (`assistant.proposals`,
   `schema_version` 1) with project, actor, conversation, key, kind (`declarative`, `twin`, `closure`), preview,
   operations, expected revisions, status and per-operation results. Open proposals reopen in later sessions.
4. **Apply gateway.** For a declarative proposal the assistant service, at Apply: checks identity (only the
   preparer), project scope (C13: the current project must equal the proposal's, and the platform project in each
   operation path must equal it), membership, module entitlements and confirmation; re-validates each operation
   against the module's OpenAPI (so no arbitrary URL can be called); re-reads the expected revisions and refuses a
   stale proposal with an explanation before writing anything; then executes the operations in-process through
   the module API as the person (forwarded identity), in order, with `Idempotency-Key <proposalId>:<index>`.
   A retry resumes after succeeded operations; an applied proposal is never applied again.
5. **Fallbacks.** Twin proposals are applied in the browser with the repository's revision checks and their
   outcome is recorded. Closure proposals are a labelled fallback: applicable only in the preparing window.
6. **Refusals** the access policy makes are shown to the person and sent to the model on its next turn.

## Consequences

- Durable changes still need a person's preview and Apply (autonomy policy unchanged).
- Multi-operation proposals are not one transaction across operations; partial completion is reported and
  resumable. Multi-record changes should use one atomic module operation where the module offers it.
- Modules move to declarative proposals at their own pace; until then their changes stay closure fallbacks.
- Declarative undo (compensating operations) is not defined yet.
