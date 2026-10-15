# ADR-0034: SysML Modeler — typed commands and transactions are the only write path

Status: Proposed (2026-10-14, SysML agent)

## Context

Brief §6 requires structured typed commands, schema discovery, transactions, dry run, previews, undo,
version checks, provenance and validation after modification, shared by human and AI paths (also
ADR-0010, contracts §6).

## Decision

- All modifications are transactions of typed commands (`docs/modules/sysml/ai-commands.md` §2) executed
  by `sysml-core` on a working copy, producing a change set, a diagnostics delta and (on commit) a
  commit with provenance. Command schemas are JSON Schema, served by `GET /commands`.
- Dry run returns the same result without committing. Validation policy `report` (default for people) or
  `reject-new-errors` (default for the assistant).
- Concurrency: element-level optimistic check against the transaction's base commit; non-overlapping
  transactions are rebased on the head, overlapping ones fail with `conflict` naming the elements.
- Undo = compensating commit computed from element versions; refused if later commits changed the same
  elements.
- Applying textual notation is a command that reconciles parsed text with existing elements, preserving
  IDs of matched elements.
- The raw API commit endpoint is validated by the same core (well-formedness, references).

## Consequences

- The UI, the assistant, the local adapter and API clients share one implementation and one set of rules.
- Undo works across sessions and users (it is a commit, not a client-side stack).
