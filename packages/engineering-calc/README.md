# @ews/engineering-calc

Deterministic calculation engine for calculation models of the design reasoning layer
([mathematics.md](../../docs/modules/design-reasoning/mathematics.md)). Status: **experimental**
(validation prototype R1).

```ts
import { evaluateModel, verifyManifest, validateModel } from '@ews/engineering-calc'

validateModel(model)                       // [] or problems (grammar, undeclared symbols, cycles, dimensions)
const r = evaluateModel(model, {
  F: { value: 12, unit: 'kN', source: { kind: 'binding', ref: { module: 'conceptualize', type: 'constraint', id }, basis: 'user-assertion' } },
  d: { value: 25, unit: 'mm', source: { kind: 'binding', ref: { module: 'twin', id: 'ROD-120', revision: 2 }, property: 'diameter', via: 'client-attested', basis: 'user-assertion' } },
  // …
}, { uncertainty: 'interval-vertices' })
r.outputs.P_cr      // { value, min?, max?, unit: 'kN' }
r.checks            // constraint checks with margin, ratio, status
r.basis             // 'calculated' | 'estimate' (ADR-0043)
verifyManifest(model, r.manifest)          // { ok, reasons }: re-evaluates; refuses fabricated results
```

| Capability | Status |
| --- | --- |
| Expression language `ews-expr/1` (numbers, parameters, `+ - * / ^`, unary minus, whitelisted functions, comparisons) | Implemented |
| Dimensional analysis with the platform unit algebra (SDK `quantities`) | Implemented |
| Explicit assignments in dependency order, constraint checks, validity conditions | Implemented |
| Interval bounds by vertex enumeration (≤ 10 ranged inputs) | Implemented (exact for monotonic relations only) |
| Reproducibility manifest, SHA-256 digests, re-verification | Implemented |
| Worker-thread isolation with timeouts | Not yet (R3/R4: the engine is pure, so the service wraps it) |
| Sensitivity, 1-D root finding, linear solves, sampling, optimization | Not yet (phase 2–3) |

Dependencies: `@ews/platform-sdk`, `mathjs` 15.2.0 (Apache-2.0).
