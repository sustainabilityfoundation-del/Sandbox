# ADR-0033: SysML Modeler — versioned repository aligned with the Systems Modeling API

Status: Proposed (2026-10-14, SysML agent)

## Context

Brief §4/§10 ask for version-aware persistence, branches, baselines and standards-compliant model
access. Contracts §3 place persistence in PostgreSQL schema `sysml` in `services/sysml`.

## Decision

- Resource model of the OMG Systems Modeling API: projects, commits (immutable change sets of element
  versions), branches (movable heads) and tags (baselines). Per-project commit numbers give a numeric
  revision for platform references.
- Tables: `projects`, `commits` (append-only), `element_versions` (append-only, standard JSON payload),
  `branches`, `branch_elements` (head index), `element_refs` (reference index), `tags`, `outbox`,
  `idempotency_keys` (docs/modules/sysml/semantic-model.md §6).
- Writes are cost-proportional to the change; reads at heads use the index; reads at older commits walk
  the ancestry.
- The API implements an aligned subset of the REST/HTTP PSM plus explicitly marked platform extensions
  (typed transactions, text, validation, revert, diff, impact, events).
- The service re-implements the platform's migration/outbox/idempotency patterns in its own schema
  rather than importing the Requirements service (CR-SYSML-06 proposes a shared package).

## Consequences

- Any commit can be read, diffed and baselined; history is an audit trail with provenance.
- Merge is not implemented in Phase 1 (semantic merge is Phase 5); branches can be created and committed
  to independently.
