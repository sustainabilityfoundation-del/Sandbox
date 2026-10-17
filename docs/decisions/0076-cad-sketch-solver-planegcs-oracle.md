# ADR-0076: CAD sketch solver: replaceable interface, planegcs as a development-time oracle only

Status: Proposed (16 October 2026, CAD module agent, sprint C1; extends ADR-0025)
Module: CAD Modeler (`packages/cad-core`)

## Capability and requirements

The 2D sketch constraint solver (ADR-0025) must be correct and replaceable. It decides sketch status, degrees of freedom,
redundant and conflicting constraints, and the profile that is extruded. Required: an independent check of the built-in solver
without adding a runtime dependency or licence obligation; a stable interface so another solver can be put in later. Serves the
CAD brief, sprint C1 item 6 (OSS-11).

## Candidates considered

| Candidate | Upstream (URL) | Version checked | Licence (verified, with source) | Maturity and activity | Fit |
| --- | --- | --- | --- | --- | --- |
| planegcs (FreeCAD Sketcher solver) as WebAssembly, `@salusoft89/planegcs` | github.com/Salusoft89/planegcs | 1.3.0 (npm, modified 2026-10-05) | LGPL-2.0-or-later (npm `license` field of the installed package) | Active wrapper of FreeCAD's solver; all constraints, DoF, conflict and redundancy reports | Excellent as an oracle: independent code, same problem class, synchronous after module load |
| SolveSpace `libslvs` | github.com/solvespace/solvespace | not installed | GPL-3.0 | Mature | Prohibited without explicit approval (strategy §2); no |
| `@salusoft89/planegcs` used at run time | as above | 1.3.0 | LGPL-2.0-or-later | as above | Would add an LGPL runtime dependency, a 0.5 MB WASM and a second WASM load in the kernel worker; needs the compliance review and owner approval of ADR-0021's kind; not needed to meet the requirements |
| Internal solver (damped Gauss–Newton, ADR-0025) | `packages/cad-core/src/sketch/solver.ts` | n/a | project | in production, 19 constraints, DoF by rank, redundancy and conflicts | Meets the requirements; differences from the oracle are recorded below |

## Licence assessment

planegcs is LGPL-2.0-or-later: conditional category (strategy §2). It is added as a **devDependency of `@ews/cad-core` only**,
imported by one test file (`src/sketch/planegcsOracle.test.ts`), and is not part of any build output, bundle, worker or
distribution. No linking in shipped code, no notice obligation arises from tests. Recorded in `docs/dependencies.md` and
`docs/dependencies/policy.json` as dev-only (status reviewed; the register is regenerated with `npm run deps:register`).
Using it at run time would need a new ADR and the owner's approval.

## Integration design

- `SketchSolver` interface (`cad-core/src/sketch/solverPort.ts`): `id` and `solve(sketch, { values }) → SketchSolution`; pure,
  deterministic, mm and degrees. `builtInSketchSolver` wraps the existing solver; `solveSketchFeature` accepts a solver (default
  built-in). No behaviour change.
- Oracle tests: 17 sketches (rectangles, squares, angles, circles and tangents, point-on-circle, midpoint, distances, redundancy,
  conflict) are solved by both solvers from the same seed. Status, remaining degrees of freedom and, for fully constrained sketches,
  every point and radius must agree to 1e-6 mm. planegcs is wrapped behind the same interface in the test.
- Recorded difference: a dimension between two points that are both `fixed` is reported redundant by the built-in solver (fixed is a pair of
  equations) and trivially satisfied by planegcs (fixed is a parameter flag). Both report 0 degrees of freedom. Kept as an explicit test.
- Provenance: the solver `id` is available for diagnostics; solutions are not stored in documents.

## Decision

Integrate as an oracle in tests only; keep the internal solver; expose the interface. A replacement at run time is a later,
separate decision.

## Contribution opportunities

None now (nothing is published without owner authorisation).

## Consequences

- One development dependency (`@salusoft89/planegcs` 1.3.0, exact pin, LGPL-2.0-or-later, dev-only) in `packages/cad-core/package.json` and the lockfile.
  Registered in the dependency register and policy.
- A solver regression now fails against an independent implementation; new constraint types should add an oracle case.
- Risks: planegcs can differ on sign or branch conventions (angles are signed in planegcs, unsigned here); cases are chosen where the seed fixes the branch.
