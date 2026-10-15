# F. Mathematical model architecture

Status: Proposed. Decision: [ADR-0044](../../decisions/0044-calculation-models-and-math-stack.md).
Research: [research note, mathematics libraries](../../research/design-reasoning/research-note.md#mathematics-libraries-brief-6).
Index: [README.md](README.md).

## 1. Separation

| Concern | Record | Owner |
| --- | --- | --- |
| Model definition: parameters, units, relations, assumptions, validity | `CalculationModel` (revisioned) | Conceptualize (CR-C8) |
| Execution: bound inputs, outputs, checks, engine versions | `ToolInvocation` (operational) and, when kept, calculated `Evidence` with a manifest | Engine (invocation); Conceptualize (evidence) |
| Computation | `@ews/engineering-calc` (pure, deterministic) | Platform library (new package) |
| Unit and dimension algebra | SDK `quantities` (promoted from Conceptualize `units.ts`, CR-S2) | SDK |

The AI may **propose** a model (as an `ai-hypothesis` CalculationModel draft). Its execution and
validation always go through the calculation engine; a model-generated number is never stored as a
calculated result.

## 2. CalculationModel

```ts
interface CalculationModel {
  id: string; key: string /* CALC-001 */; revision: number
  name: string; description: string
  grammar: 'ews-expr/1'                          // expression language version (§3)
  parameters: {
    symbol: string                                // identifier, e.g. 'P_cr', 'E', 'd'
    name: string
    role: 'input' | 'output' | 'constant' | 'design-variable'
    unit: string                                  // platform unit grammar; '-' dimensionless
    value?: number; min?: number; max?: number    // constants, defaults, bounds of design variables
    defaultBinding?: { ref: DesignRef | ArtifactRef; property: string }
  }[]
  relations: {
    id: string
    kind: 'assignment' | 'constraint' | 'objective'
    expression: string                            // e.g. 'P_cr = pi^2 * E * I / (K * L)^2'
    ast: unknown                                  // canonical JSON AST produced by the engine at write time
    operator?: '<=' | '<' | '=' | '>=' | '>'      // for constraints (lhs op rhs)
    direction?: 'minimize' | 'maximize'           // for objectives
    description?: string
  }[]
  assumptions: DesignRef[]                        // Assumption records (e.g. pinned-pinned ends, linear elastic)
  validity: { text: string; conditions?: string[] } // e.g. 'slenderness KL/r ≥ 100' as constraint expressions
  basis: 'user-assertion' | 'ai-hypothesis' | 'evidence'   // 'evidence' when a reviewer validated the model (source cited)
  sources: ArtifactRef[]                          // textbook, standard, company method (external refs)
  validationStatus: 'unvalidated' | 'validated' | 'deprecated'
}
```

Write-time validation (Conceptualize, using `@ews/engineering-calc`, CR-C8): grammar parses; every symbol
is a declared parameter; assignments define each output exactly once and form an acyclic dependency
graph; **dimensional consistency** of every relation (§4); constraint operands have equal dimensions;
objectives are scalar; no forbidden functions (§7). The canonical AST is stored with the text so that
evaluation does not depend on re-parsing behaviour across library versions.

Example (prototype, actuator rod buckling):

| Symbol | Role | Unit |
| --- | --- | --- |
| `F` | input (bound to constraint CST-001's bound, formalizing REQ-001) | kN |
| `E` | input (bound to assumption ASM-002, steel modulus) | GPa |
| `d` | input (bound to twin ROD-120 `diameter`, pinned revision) | mm |
| `L` | input (bound to twin ROD-120 `effectiveLength`) | mm |
| `K` | input (bound to assumption ASM-001, end fixity) | - |
| `n` | constant (design factor) | - |
| `I` | output: `I = pi * d^4 / 64` | mm^4 |
| `P_cr` | output: `P_cr = pi^2 * E * I / (K * L)^2` | kN |
| — | constraint: `P_cr >= n * F` | — |

## 3. Expression representation

- **Language `ews-expr/1`**: a documented subset of the mathjs expression syntax: numbers, identifiers,
  `+ - * / ^`, unary minus, parentheses, comparison operators in constraints, and a whitelist of
  functions (`sqrt, abs, min, max, exp, log, log10, sin, cos, tan, asin, acos, atan, atan2, pi, e`).
  No assignment chains, no function definitions, no matrices, no strings, no units inside expressions:
  **units belong to parameters**, which keeps dimensional analysis explicit and avoids mathjs's
  implicit-multiplication precedence trap for unit expressions.
- **Canonical AST**: mathjs `parse()` output converted to a small JSON node set (`num`, `sym`, `op`,
  `fn`, `paren` dropped) with a version tag; this JSON is stored and used for evaluation and analysis.
- **Symbolic operations** used: `simplify` (display), `derivative` (sensitivity ∂output/∂input for
  phase 2), `rationalize` (display). No equation solving beyond explicit assignments in phase 1.

## 4. Units and dimensions

- One unit system for the platform: the SDK `quantities` module (Conceptualize's parser: SI base and
  derived units with prefixes, products, quotients, powers, °C/°F as absolute values only, currencies as
  separate dimensions). mathjs `Unit` objects are **not** used and not stored.
- **Evaluation**: every bound input is converted to SI base magnitude (`convert(value, unit, SI)` via
  `factor`/`offset`), the AST is evaluated on plain numbers, outputs are converted back to their declared
  units.
- **Dimensional analysis** walks the AST with the `Dims` algebra: `+ -` and comparisons require equal
  dimensions; `* /` add/subtract exponents; `^` requires a dimensionless constant exponent (rational
  exponents allowed: `sqrt` halves, and must give integer exponents); transcendental functions require
  dimensionless arguments and return dimensionless; `min`/`max` require equal dimensions. A relation whose
  dimensions do not match is refused at write time with the dimension names (`length` vs `force`).
- Temperatures with offsets are refused inside expressions (use K), consistent with the existing parser
  and the mathjs documentation's warning about offset temperatures in arithmetic.

## 5. Uncertainty and tolerance

Implemented in R3 (`@ews/engineering-calc` 0.2.0). Ranges come from quantities (`min`/`max`),
tolerances (± on a parameter) and assumption ranges. Interval inputs preserve conceptual design intent and
become bounds for later optimization (Wang 2004, research note).

| Mode | Method | Result quality | Phase |
| --- | --- | --- | --- |
| `point` | nominal values | point | 1 |
| `interval` | For each output, constraint margin and validity condition: inline the assignments so the expression depends on inputs only, differentiate it symbolically for each ranged input, and enclose each derivative over the input box with interval arithmetic. If every derivative has a proven sign, the expression is monotonic in each input and its range is attained at two corners | **exact** (`bounds.quality = 'exact'`) | R3 |
| `interval`, not proven monotonic | Natural interval extension of the expression (sound enclosure), plus the values actually attained at the 2ⁿ vertices (n ≤ 10) and the nominal point as an inner bound | **enclosure**: the true range lies between `bounds.inner` and `[min, max]`; the output carries a note naming the inputs without proven monotonicity | R3 |
| `interval-vertices` | v1 method (R1): vertex enumeration of the whole model | not proven; kept only to verify v1 manifests | R1 |
| Sensitivity | symbolic derivatives at the nominal point (the derivative code exists; not yet exposed) | local sensitivity | 2 |
| Sampling | Monte Carlo with a recorded seed | sampled (n, seed) | 3 |

Honesty rules:

- A constraint is **satisfied** only when its margin's lower bound is proven non-negative over the whole box,
  **violated** only when its upper bound is proven negative, and **uncertain** otherwise. With an enclosure the
  engine may report "uncertain" for a constraint that holds in truth (example in `interval.test.ts`: y = x(1 − x) ≤ 0.3);
  it never reports "satisfied" without proof.
- Validity conditions not proven for the whole range are listed in `validity.uncertain` and the result is not
  marked valid.
- Piecewise functions (`abs`, `min`, `max`, `atan2`) are not differentiated: relations using them get enclosures.
- Floating-point rounding is not directed: bounds are exact up to floating-point accuracy, not rigorous to the
  last bit. Division by a range containing zero gives an unbounded enclosure; `sqrt`/`log` of ranges that cross
  their domain boundary are refused as `domain-error`.

## 6. Execution results and the reproducibility manifest

Manifest version 2 (R3); version 1 (R1) is still verified.

```ts
interface CalculationManifest {
  manifestVersion?: 2                 // absent in v1
  digestSpec?: 'ews-digest/1'
  engine: { name: '@ews/engineering-calc'; version: string; mathjs: string; grammar: 'ews-expr/1' }
  model: { id: string; revision: number; digest: string }          // digest of canonical ASTs and parameters
  inputs: { symbol: string; value: number | null; min?: number; max?: number; unit: string
            source: { kind: 'literal' | 'binding'; ref?: DesignRef | ArtifactRef; property?: string; revision?: number; via?: string; basis: Basis } }[]
  outputs: { symbol: string; value: number; unit: string; min?: number; max?: number
             bounds?: { min: number; max: number; quality: 'exact' | 'enclosure' | 'vertices'; inner?: { min: number; max: number }; note?: string } }[]
  checks: { relationId: string; text: string; op: string; lhs: number; rhs: number; unit: string; margin: number; marginRatio?: number
            satisfied: boolean; status: 'satisfied' | 'violated' | 'uncertain'; marginBounds?: Bounds }[]
  validity: { satisfied: boolean; violated: string[]; uncertain?: string[] }
  uncertainty: 'point' | 'interval' | 'interval-vertices'
  basis: 'calculated' | 'estimate'
  inputDigest: string; outputDigest: string; evaluatedAt: string; durationMs: number; operations?: number
}
```

- **Deterministic**: IEEE-754 doubles, fixed evaluation order (topological), no randomness, no time or locale
  dependence in results (`evaluatedAt`, `durationMs`, `operations` are outside every digest).
- **Digest spec `ews-digest/1`**: canonical JSON (keys sorted recursively, no whitespace, `-0` written as `0`,
  non-finite numbers refused) hashed with SHA-256 (own implementation, identical in Node and browsers).
  `inputDigest` covers the model digest, the inputs exactly as given and the mode, so it is stable across
  platforms. `outputDigest` covers computed numbers rounded to 12 significant digits; it matches on the same
  runtime and almost always across runtimes, but a last-bit difference of a `Math` function at a rounding
  boundary could change it.
- **Verification across platforms** therefore does not rely on `outputDigest`: `verifyManifest` re-evaluates and
  compares every output, bound and check value with a relative tolerance of 1e-10 (cross-engine `Math`
  differences are around 1e-16), statuses and the basis exactly, and the model and input digests exactly. It
  reports `exactDigestMatch` for information. A fabricated output (tested at 1e-6 relative) fails.
- **Versioning**: `manifestVersion` and `digestSpec` name the format; `SUPPORTED_MANIFEST_VERSIONS` lists what
  the engine verifies. A stored v1 manifest produced by the R1 engine is kept as a test fixture
  (`src/__fixtures__/manifest-v1.json`) and must keep verifying (ADR-0009 spirit). Changing the digest inputs
  needs a new manifest version, never a silent change.
- **Calculated evidence is verified, not trusted** (CR-C8): Conceptualize re-runs `verifyManifest` before it
  accepts evidence with basis `calculated`. This prevents a model or a client from fabricating "calculated" numbers.
- The basis of the stored evidence is `calculated` only for a person-authored or validated model whose inputs
  are not AI hypotheses; otherwise `estimate` (ADR-0043).

## 7. Safety of evaluation

- **Parsing only**: one mathjs instance created from `parseDependencies` alone (no `evaluate`, `import`,
  `createUnit`). The parse tree is converted into the whitelisted canonical AST; the engine evaluates its own
  AST, so no user expression reaches mathjs evaluation.
- **Static limits**: expression ≤ 2000 characters, AST ≤ 500 nodes per relation, ≤ 10 ranged inputs for vertex
  inner bounds, inlined or differentiated expressions ≤ 20 000 nodes (else `limit` or enclosure).
- **Cooperative budget** (main entry, Node and browser): every evaluation has an operation budget (default
  5 000 000 AST operations, `resource-limit`) and a deadline (default 2 s, `timeout`). The worst case inside the
  static limits (one 500-node non-monotonic expression over 10 ranged inputs) takes about 50 ms.
- **Hard isolation** (`@ews/engineering-calc/node`, Node only, for services): `createIsolatedEvaluator` runs
  evaluations in a `worker_threads` worker with V8 `resourceLimits` (default 64 MB old generation, 16 MB young
  generation, 4 MB stack) and a hard wall-clock timeout (default 5 s) after which the worker is terminated and
  replaced. The worker's cooperative deadline is set to 80 % of the hard timeout so that ordinary overruns end
  with a clean `timeout` and keep the worker. Start-up (TypeScript loader in development, mathjs) is excluded
  from the evaluation timeout by a ready handshake and has its own limit (default 30 s). A worker out of memory
  maps to `resource-limit`. From TypeScript sources the worker is started with `--import tsx`; a bundled service
  passes `execArgv: []` and its built worker URL.

### 7a. Error taxonomy

Every failure is a `CalcError` with a code from `ERROR_TAXONOMY` (`errors.ts`), plain-data serializable
(`toJSON`/`fromJSON`) so that it crosses the worker boundary unchanged.

| Code | Meaning | Retryable | Who fixes it | Tool error code |
| --- | --- | --- | --- | --- |
| `grammar` | Syntax outside `ews-expr/1` | no | model author | `invalid-input` |
| `model` | Inconsistent definition (undeclared symbol, missing or cyclic assignments; mixed problems) | no | model author | `invalid-input` |
| `unit-error` | Unknown, unsupported or inconsistent units | no | model author | `unit-error` |
| `input` | Missing, unknown, non-finite input; value outside its own range | no | caller | `invalid-input` |
| `domain-error` | Inputs outside a relation's mathematical domain | no | caller | `domain-error` |
| `limit` | Static size limit exceeded | no | model author | `resource-limit` |
| `timeout` | Time budget exceeded (cooperative or hard) | yes | operator | `timeout` |
| `resource-limit` | Operation budget or worker memory exceeded | yes | operator | `resource-limit` |
| `unsupported-version` | Manifest or grammar version not supported | no | engine maintainer | `not-implemented` |
| `internal` | Engine defect or worker failure | no | engine maintainer | `internal` |

When all problems of a model share one code, that code is reported; mixed problems report `model` with every
problem in `details.problems`. Domain warnings (outside the validity conditions) are warnings, not errors.


## 8. Solvers and optimization: staged

| Capability | Approach | Phase |
| --- | --- | --- |
| Explicit assignments, constraint checks | engine interpreter | 1 |
| Interval bounds: exact with proven monotonicity, enclosures otherwise | engine (R3) | 1 |
| Linear systems | mathjs `lusolve` | 2 (when a model needs it) |
| One-dimensional root finding (e.g. solve for the diameter that meets a margin) | bracketed bisection/Brent in the engine (a few dozen lines, tested against analytic cases); not a symbolic solver | 2 |
| Polynomial roots | mathjs `polynomialRoot` | 2 |
| Sensitivity | the engine's symbolic derivatives (implemented in R3 for monotonicity proofs; not yet exposed as a result) | 2 |
| Multiobjective search over design variables (Pareto) | grid or Latin-hypercube sampling of design variables with deterministic seeds, dominance filter | 3 |
| Gradient-based / MDO / nonlinear systems | external **Python worker** (SciPy, OpenMDAO, optionally SymPy/Pint) behind the same `CalculationEngine` port, as a job; introduced by its own ADR when a demonstrated need exists | 3 |

The port keeps the manifest format, so evidence produced by a future worker is indistinguishable in
shape and equally re-verifiable (by re-running the job).

## 9. Technology recommendation

**Adopt mathjs 15.2.0** (Apache-2.0, released 2026-04-07; all runtime dependencies MIT) in the new
`@ews/engineering-calc` package, for parsing to an AST, symbolic simplification and derivatives, and
linear and polynomial solvers. **Keep the platform's own unit algebra** (Conceptualize's parser, promoted to
the SDK) as the single source of truth for units and dimensions; do not use mathjs units.

Rationale: TypeScript types and Node/browser support fit the stack; it is the most mature and actively
maintained option (regular releases through 2026); Apache-2.0 matches existing dependencies; it covers
every phase 1–2 need; its gaps (nonlinear solving, optimization) are phase 3 needs better met by
established numerical libraries in a worker than by any JavaScript CAS. Using our unit algebra avoids two
unit systems disagreeing.

Rejected: js-quantities and UnitMath (units only, low maintenance or adoption; we already have units);
nerdamer 2.0.0 (released 2026-10-02, within the two-week rule; 1.x is from 2021); Algebrite (inactive since
2021, no types); a SymPy worker now (adds Python runtime and process management to phase 1 for
capabilities not yet needed; kept as the phase 3 option); Pyodide (MPL-2.0, heavy, no benefit over a
server worker); glpk.js (GPL-3.0).

Dependency record (on adoption, appended to `docs/dependencies.md` by the package owner):
`mathjs 15.2.0, Apache-2.0, used by engineering-calc, github.com/josdejong/mathjs`.

Update (R3, 15 October 2026): the engine uses mathjs **only to parse**. Symbolic derivatives (for the
monotonicity proofs of §5) are computed by the engine on its own small AST, which keeps the mathjs instance
limited to the parser; mathjs `simplify`, `derivative` and the solvers remain available for later phases.

## 10. Library of engineering relations (R3)

`ENGINEERING_LIBRARY` (`packages/engineering-calc/src/library.ts`) holds reviewed-by-test relations, each a
calculation model definition with validity conditions, assumptions, limitations, source citations and reference
cases:

| ID | Relation | Validity conditions |
| --- | --- | --- |
| `lib.column.euler-round` | Euler buckling of a solid round column, P_cr = π²EI/(KL)², with the Euler–Johnson transition slenderness | λ ≥ λ₁ = √(2π²E/Sy) |
| `lib.beam.cantilever-end-load-rect` | Cantilever with an end load: δ = FL³/(3EI), σ = 6FL/(bh²) | L ≥ 10h; δ ≤ 0.1L |
| `lib.beam.simply-supported-center-load-rect` | Simply supported, central load: δ = FL³/(48EI), σ = 3FL/(2bh²) | L ≥ 10h; δ ≤ 0.1L |
| `lib.fastener.bolt-preload-torque` | Nut-factor method F_i = T/(Kd); A_t = π/4 (d − 0.9382P)²; σ_i ≤ proof strength | 0.1 ≤ K ≤ 0.35; P ≤ 0.2d |
| `lib.drive.motor-torque-power` | ω = 2πn, P = Tω, P_in = P/η; P ≤ rated power | 0 < η ≤ 1 |
| `lib.drive.screw-lead-speed-force` | v = n·l, F = 2πηT/l; F ≥ required thrust | 0 < η ≤ 1 |

Review status, stated in every entry: **agent-checked, engineering review required**. Each reference case is
recomputed in `library.test.ts` from an independently written closed form in SI units (agreement better than
1e-12 relative) and against the stated expected values. The definitions carry `basis: 'ai-hypothesis'` and
`validationStatus: 'unvalidated'`, so their results are `estimate` until a person validates the model in
Conceptualize; after validation they give `calculated` results. The citations (Timoshenko and Gere; Shigley;
Roark; Gere and Goodno; ISO 898-1; VDI 2230; IEC 60034-1; ISO 3408-1; Hibbeler) name where these standard
relations are given; they were **not consulted in this session** and no text is copied from them.

## 11. Performance (R3, measured on the development machine)

| Operation | Measured | Test threshold |
| --- | --- | --- |
| Compile a model (parse, dimensions, ordering, digest) | ≈ 3.2 ms | < 20 ms |
| Point evaluation of a compiled model | ≈ 0.28 ms | < 2 ms |
| Exact interval evaluation, 5 ranged inputs | ≈ 0.9 ms | < 20 ms |
| Manifest verification | ≈ 3.1 ms | < 20 ms |
| Worst case inside the static limits (500-node non-monotonic expression, 10 ranged inputs) | ≈ 53 ms, 0.49 M operations | < 2000 ms |

Thresholds are several times the measurements so that the tests catch order-of-magnitude regressions, not
machine variation (`perf.test.ts`). Worker start-up from TypeScript sources takes seconds under load and is
excluded from evaluation time (§7).
