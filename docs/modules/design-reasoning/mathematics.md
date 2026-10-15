# F. Mathematical model architecture

Status: Proposed. Decision: [ADR-0021](../../decisions/0021-calculation-models-and-math-stack.md).
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

| Level | Method | Phase | Label on results |
| --- | --- | --- | --- |
| Point | nominal values | 1 | `point` |
| Interval bounds | evaluate all 2ⁿ corners of input ranges (n ≤ 10), take min/max per output | 1 | `bounds by vertex enumeration (exact for monotonic relations; may under-estimate otherwise)` |
| Sensitivity | symbolic derivatives at the nominal point | 2 | `local sensitivity` |
| Sampling | Monte Carlo with a recorded seed and distribution per input (uniform within ranges unless specified) | 3 | `sampled (n, seed)` |

Ranges come from quantities (`min`/`max`), tolerances (± on a parameter) and assumption ranges. Interval
inputs preserve conceptual design intent and become bounds for later optimization (Wang 2004, research note).

## 6. Execution results and the reproducibility manifest

```ts
interface CalculationManifest {
  engine: { name: '@ews/engineering-calc'; version: string; mathjs: string; grammar: 'ews-expr/1' }
  model: { id: string; revision: number; digest: string }          // digest of canonical ASTs and parameters
  inputs: { symbol: string; value: number | null; min?: number; max?: number; unit: string
            source: { kind: 'literal' | 'binding'; ref?: DesignRef | ArtifactRef; property?: string; revision?: number; basis: Basis } }[]
  outputs: { symbol: string; value: number; min?: number; max?: number; unit: string }[]
  checks: { relationId: string; satisfied: boolean; lhs: number; rhs: number; margin: number; unit: string }[]
  validity: { satisfied: boolean; violated: string[] }
  uncertainty: 'point' | 'interval-vertices' | 'sampled'; seed?: number
  inputDigest: string; outputDigest: string; evaluatedAt: string; durationMs: number
}
```

- **Deterministic**: IEEE-754 doubles, fixed evaluation order (topological), no randomness except recorded
  seeds, no time or locale dependence; the same engine version and inputs give the same `outputDigest`.
- **Calculated evidence is verified, not trusted** (CR-C8): when a proposal records Evidence with basis
  `calculated`, Conceptualize re-evaluates the manifest with its own copy of `@ews/engineering-calc`
  (same major version) and refuses the write if the digests differ. This prevents a model or a client from
  fabricating "calculated" numbers.
- The basis of the stored evidence is the minimum of `calculated` and its inputs' bases (ADR-0020); a
  validated model with validated assumptions and pinned measured dimensions can support a decision; a
  hypothesis-fed calculation is stored as `estimate`.

## 7. Safety of evaluation

Following the mathjs security guidance: one restricted mathjs instance created by the engine with
`import`, `createUnit`, `reviver`, `evaluate`, `parse` (inside expressions), `simplify`, `derivative` and
`resolve` disabled for expression code; the engine calls `parse` itself and then **evaluates its own
canonical AST** (a small interpreter over the whitelisted node set), so no user expression is ever passed
to mathjs `evaluate`. Expression length ≤ 2000 characters, AST ≤ 500 nodes, n ≤ 10 for vertex enumeration;
evaluation in a `worker_threads` worker with a 2 s default timeout, terminated on timeout or cancellation.

## 8. Solvers and optimization: staged

| Capability | Approach | Phase |
| --- | --- | --- |
| Explicit assignments, constraint checks | engine interpreter | 1 |
| Interval vertices | engine | 1 |
| Linear systems | mathjs `lusolve` | 2 (when a model needs it) |
| One-dimensional root finding (e.g. solve for the diameter that meets a margin) | bracketed bisection/Brent in the engine (a few dozen lines, tested against analytic cases); not a symbolic solver | 2 |
| Polynomial roots | mathjs `polynomialRoot` | 2 |
| Sensitivity | mathjs `derivative` | 2 |
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
