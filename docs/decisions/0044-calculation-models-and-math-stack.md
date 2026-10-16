# ADR-0044: Calculation models in Conceptualize; a deterministic calculation engine on mathjs and the platform unit algebra

Status: Proposed (2026-10-14)

Note (16 October 2026, factual, no status change): mathjs 15.2.0 (Apache-2.0) is already adopted as a runtime dependency of
`@ews/engineering-calc` for expression parsing only, and is recorded with its transitive dependencies in
[docs/dependencies.md](../dependencies.md); `services/conceptualize` consumes the engine (CR-C8).

## Context

The brief (§6) requires typed quantities, units and dimensions, symbolic expressions, algebraic constraints,
parameter relationships, uncertainty, separation of model definitions from execution results, reproducibility,
and execution through computational services rather than the AI; it forbids building a new symbolic engine if
a library suffices. Conceptualize implements its own unit parser with dimension vectors and records calculations
as evidence text. The platform roadmap places a Mathematics module in phase 3; none exists.

## Decision

- **Definitions**: `CalculationModel` records (parameters with units and roles, relations as assignments,
  constraints and objectives, assumptions, validity, basis, sources) are Conceptualize data until a Mathematics
  module exists; then ownership moves by ADR and Conceptualize keeps references.
- **Engine**: new framework-free package `@ews/engineering-calc` using **mathjs 15.2.0** (Apache-2.0) for
  parsing to a canonical AST, simplification and derivatives, linear and polynomial solvers. Evaluation uses the
  engine's own interpreter over a whitelisted AST in a worker with limits; mathjs `evaluate` is never called on
  user expressions; mathjs units are not used.
- **Units**: one unit algebra for the platform, Conceptualize's parser promoted to the SDK (`quantities`).
  Dimensional analysis on the AST at write time and execution time.
- **Results**: executions produce a reproducibility manifest (engine and library versions, model revision and
  digest, inputs with sources and bases, outputs, checks, digests). Stored as Evidence with basis `calculated`
  (or lower by input basis); Conceptualize **re-evaluates** manifests before accepting them.
- **Staging**: phase 1 explicit assignments, constraint checks and interval bounds (R3: exact where monotonicity is proven by symbolic derivatives, sound enclosures otherwise; worker isolation with resource limits; manifest version 2 verified with a numeric tolerance across platforms; a library of agent-checked relations awaiting engineering review); phase 2 sensitivity,
  1-D root finding, linear/polynomial solves; phase 3 sampling-based multiobjective search and, if needed, an
  external Python worker (SciPy, OpenMDAO, SymPy) behind the same port, by a separate ADR.

## Consequences

- Numbers stored as calculated are reproducible and cannot be fabricated by a client or model.
- One new runtime dependency (mathjs, plus nine MIT dependencies); record in docs/dependencies.md on adoption.
- No general nonlinear solving or optimization until phase 3.
- Alternatives considered: js-quantities / UnitMath (units only; we have units); nerdamer 2.0.0 (released within
  two weeks); Algebrite (inactive); SymPy worker now (adds a Python runtime before it is needed); mathjs units
  (second unit system that could disagree with stored data).
