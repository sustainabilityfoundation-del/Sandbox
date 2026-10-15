# ADR-0023: Change impact distinguishes possible from demonstrated; invalidation is flagged, never silent

Status: Proposed (2026-10-14)

## Context

The brief requires change impact analysis across requirements, functions, concepts, interfaces, parameters,
CAD, analyses and assumptions, distinguishing possible from demonstrated impacts, mechanisms to update or
invalidate conclusions when information changes, and explicit synchronization between concepts and
implementations without silently rewriting design intent. The platform already has minimal twin change impact
(`changeImpact` in model-service), Requirements impact (`GET …/impact`), and Conceptualize stale/broken link
detection in the client.

## Decision

- Impact analysis (in `@ews/design-reasoning-core`) traverses typed links with per-type propagation rules and
  classifies each reached item as **possible** (reachable by a dependency path), **demonstrated** (a
  deterministic check fails: re-evaluated calculation, constraint bound, pinned-revision difference, decision
  invalidation condition) or **checked-unaffected** (the check passes). Paths and evidence are reported.
- Decisions declare **invalidation conditions**; when one fires, the result is a proposed **review flag**
  (`under-review`), applied by the user and cleared or converted to `invalidated` by a reviewer. Rationale and
  outcomes are never edited; supersession creates a new decision.
- Implementations record the concept revision they realize; synchronization states (`in-sync`,
  `implementation-ahead`, `intent-ahead`, `diverged`, `broken`) are derived; resolutions (re-pin, deviation,
  realization request, revise intent) are explicit actions.
- Event-driven checks are shallow (depth 2) notifications; deep analysis is a requested run. Hypothetical
  changes are analysed without writes.

## Consequences

- Users see why something may be affected and whether it is shown to be; nothing changes behind their back.
- Demonstration is only as broad as the deterministic checks available; without models, many impacts stay
  "possible", which is honest.
- Twin-side impact must run where the twin is (browser) until it moves server-side.
- Alternatives considered: automatic invalidation of decisions (rejected: silent change of approved records);
  only possible impacts (rejected: floods users and ignores available calculations).
