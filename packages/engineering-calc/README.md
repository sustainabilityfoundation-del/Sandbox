# @ews/engineering-calc

Deterministic calculation engine for calculation models of the design reasoning layer
([mathematics.md](../../docs/modules/design-reasoning/mathematics.md)). Version 0.3.0 (roadmap R3, result kinds for C11).
Not yet used by a service or the workspace.

```ts
import { evaluateModel, verifyManifest, validateModel, libraryModel } from '@ews/engineering-calc'
import { createIsolatedEvaluator } from '@ews/engineering-calc/node'   // Node only

const model = libraryModel('lib.column.euler-round')
validateModel(model)                                   // [] or problems (grammar, symbols, cycles, dimensions)
const r = evaluateModel(model, {
  F: { value: 12, unit: 'kN' }, E: { value: 210, unit: 'GPa' }, Sy: { value: 600, unit: 'MPa' },
  d: { value: 25, min: 24, max: 26, unit: 'mm' }, L: { value: 600, unit: 'mm' }, K: { value: 1, unit: '-' }, n: { value: 2, unit: '-' },
}, { uncertainty: 'interval' })
r.outputs.P_cr.range         // { kind: 'point' } | { kind: 'bounds', quality: 'exact' | 'enclosure', min, max, sampled? } | { kind: 'sampled-range', … }
r.checks[0].status           // 'satisfied' | 'violated' | 'uncertain'; r.checks[0].statusBasis says what it rests on
r.manifest.limits            // establishesModelValidity: false, establishesRequirementSatisfaction: false
qualifyManifest(r.manifest)  // C11 qualifications to store (any manifest version)
r.basis                      // 'calculated' | 'estimate' (library models are estimates until a person validates them)
verifyManifest(model, r.manifest)                      // { ok, reasons, exactDigestMatch }

const isolated = createIsolatedEvaluator({ timeoutMs: 5000, maxOldGenerationSizeMb: 64 })
await isolated.evaluate(model, inputs, { uncertainty: 'interval' })
await isolated.close()
```

| Capability | Status |
| --- | --- |
| Expression language `ews-expr/1`, dimensional analysis on the SDK unit algebra | Implemented |
| Explicit assignments, constraint checks with margins, validity conditions | Implemented |
| Interval bounds: exact with proven monotonicity (symbolic derivatives + interval enclosures), enclosures otherwise | Implemented (R3) |
| Manifest v3 (`ews-digest/1`, result kinds, limits), verification of v1–v3 with a cross-platform numeric tolerance | Implemented (R3, C11) |
| C11 result kinds (`point`, `sampled-range`, `bounds` exact/enclosure), proven statuses with `statusBasis`, `qualifyManifest` | Implemented (C11) |
| Error taxonomy (`ERROR_TAXONOMY`), operation budget and deadline | Implemented (R3) |
| Worker isolation with memory limits, hard timeout, restart (`./node`) | Implemented (R3); Node only |
| Library: Euler buckling, cantilever and simply supported beams, bolt preload, motor torque/power, screw lead speed/force | Implemented (R3); agent-checked, engineering review required |
| Sensitivity output, 1-D root finding, linear solves, sampling, optimization | Not yet (phase 2–3) |

Dependencies: `@ews/platform-sdk`, `mathjs` 15.2.0 (Apache-2.0).
