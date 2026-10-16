# ADR-0013: Complete AI coverage through shared semantic operations

Status: Proposed (2026-10-14)

Amended by [ADR-0074](0074-capability-registry-and-toolbars.md) (16 October 2026): the registry clause is implemented as data in the module manifests; unifying UI and AI handlers and scoped autonomy remain held.

Review note (16 October 2026): not accepted. The core decision (a typed registry running UI and AI through the same handlers) is not built; only the coverage inventory exists.

## Context

The owner wants freeform conversations to produce concrete engineering implementations, with AI
able to operate every product capability. The current assistant exposes a subset of operations and
requires proposal previews. ADR-0010 establishes the shared validation/ownership boundary.

## Proposed decision

Extend that boundary into a discoverable typed capability registry spanning queries, view controls,
domain commands, jobs and artifact import/export. UI and AI call the same underlying handlers.
Each module owns its operations; platform execution enforces permissions, revisions and context.
Track complete UI/backend coverage, including explicitly restricted boundaries.

Separate conversational intent and hypotheses from authoritative engineering data. Persist briefs,
source-backed physical interfaces, concepts, selection decisions and revision-pinned results. CAD
and verification remain domain-engine responsibilities, not language-model claims.

See [AI Interface architecture](../modules/ai-interface.md) and its feature/development documents.

## Consequences and limits

- New operations need schemas, effect classes, retry/recovery rules and coverage tests.
- Current AssistantContribution may need an additive migration; do not replace working contracts blindly.
- A server-side gateway is required for production enforcement; browser validation alone is insufficient.
- No arbitrary SQL, private-table, secret or source-code access is implied by complete functional coverage.
- The existing mandatory preview policy remains in effect. Scoped autonomy is a separate future decision.
- This ADR does not implement a provider, research service, CAD kernel or exporter.

Accept or supersede this proposal through the project's architecture review before contract changes.
