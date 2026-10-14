# ADR-0004: Revision history and revision-qualified references

Status: Accepted (2026-10-13)

## Context

Released evidence must not silently follow later edits, and references must distinguish an exact
revision from a deliberate latest-working reference (vision §5).

## Decision

- Every committed change appends an immutable `ObjectRevision` snapshot (object or scenario,
  revision, author, time, summary). History is never rewritten.
- Artifacts may carry `references: { id, revision?, role }[]`. With `revision` the reference is
  exact; without it, it deliberately follows the latest working revision. The repository rejects
  references to unknown IDs and to revisions that do not exist.
- Data saved before schema 3 gets one history entry per object at its current revision, marked
  `changedBy: 'import'`. Earlier revisions are not invented.

## Consequences

- Pinned evidence can show exactly what it verified.
- History grows with every change; retention and compaction are not designed yet.
