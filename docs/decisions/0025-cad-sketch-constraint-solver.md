# ADR-0025: In-house numerical sketch constraint solver for Phase 1

Status: Proposed (2026-10-14, CAD agent). Number provisional.

## Context

Phase 1 needs constrained 2D profiles with a real solver: geometric and dimensional constraints,
fully/under/over-constrained status, conflict detection and driven dimensions (brief §6.1).
Candidates: FreeCAD planegcs (LGPL, WASM port `@salusoft89/planegcs`), SolveSpace libslvs (GPL-3,
needs approval), D-Cubed (proprietary), or a solver of our own.

## Decision

- Phase 1 uses a solver in `@ews/cad-core` (TypeScript, MIT like the rest of the repository): residual
  equations per constraint, damped Gauss–Newton / Levenberg–Marquardt on all point coordinates and
  radii, finite-difference Jacobian, warm start from the drawn (seed) geometry, deterministic iteration.
- Analysis after solving: Jacobian rank by Gaussian elimination with tolerance gives the remaining
  degrees of freedom; the null space marks which points are still free; dependent rows identify
  redundant constraints; non-convergence triggers conflict isolation (constraints whose removal makes
  the system solvable). Status values: `fully-constrained`, `under-constrained`, `over-constrained`
  (redundant but consistent), `conflicting`, `failed`.
- Driven (reference) dimensions are measured after solving and never enter the system.
- The solver sits behind a small interface so planegcs can be evaluated as a drop-in alternative in
  Phase 2 (graph decomposition, more entity types, performance on large sketches).

## Consequences

- No licence approval needed for Phase 1; behaviour is fully tested in our suite.
- Dense numerical methods scale to a few hundred unknowns per sketch, enough for Phase 1; large
  sketches need decomposition (Phase 2 backlog).
