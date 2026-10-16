# ADR-0038: SysML Modeler — AI access through assistant actions and service proposals

Status: Accepted (16 October 2026, coordinator, after review against main 186db1c; amendments recorded below)

## Context

Brief §6 and §14: AI access to core model operations from Phase 1, through the same validated
services; contracts §6: actions `sysml-modeler.*`, mutations through service proposals (SDK 1.5).

## Decision

- The tool contributes read actions (schema discovery, queries, element reads, validation, impact,
  commit explanation, relationship matrix, coverage, behavior) returning data, and six proposing actions (`propose_commands`, `propose_text`, `create_project`,
  `satisfy_requirement`, `link_product_element`, `link_requirement`) returning proposals. Proposals are built from a **dry run** of the same transaction the UI
  would submit; the preview lists each change and the diagnostics it introduces; Apply commits with
  `source: assistant` provenance (conversation, proposal, message), `baseCommitId` from preparation and
  policy `reject-new-errors`; Undo reverts the commit.
- The demo planner is labelled demo and only plans calls to these actions.
- Capability inventory entries for every toolbar item and action are appended to
  `apps/workspace/src/platform/installedCapabilities.ts`.

## Consequences

- The assistant cannot do anything a user with the same role cannot do; server-side checks apply.
- Autonomous (unapproved) modification is not offered; Phase 6 may revisit within the platform policy.

## Amendments on acceptance

- Six proposing actions and more read actions (matrix, coverage, behavior) than the two and the read list originally named.
- The inventory is in `apps/workspace/src/platform/installedCapabilities.ts`.
