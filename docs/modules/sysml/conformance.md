# Standards conformance: supported and unsupported features

Status: living document, maintained with the implementation (last update 15 October 2026, commit
range on `feature/sysml`). **The SysML Modeler makes no SysML v2 conformance claim.** It implements a
documented subset of OMG SysML 2.0 / KerML 1.0 (formal, September 2025; research:
[standards.md](../../research/sysml/standards.md)) and an aligned subset of the Systems Modeling API
and Services 1.0. Every row below is backed by a test; the test is named.

## 1. Measurement against the official corpus

Corpus: `Systems-Modeling/SysML-v2-Release` tag **2026-08** (EPL-2.0), examples and training models
(196 `.sysml` files) and library (58 `.sysml` files). Fetched locally, not committed
(`npm run sysml:library`; measurement `npm run sysml:conformance`, report in
`.data/sysml-release/2026-08/conformance-report.md`).

| Measure | Before parser round 2 | Now |
| --- | --- | --- |
| Example/training files with **no diagnostics** | 28 (14.3%) | 35 (17.9%) |
| Files whose only problems are names missing from the platform library subset | 27 | 55 |
| Parse-clean including those (no syntax/unsupported errors) | 55 (28.1%) | 90 (45.9%) |
| Library files that parse (syntax only) | 18 (31.0%) | 37 (63.8%) |
| Parser crashes | 0 | 0 |

Resolution failures in the official corpus are expected: the models import standard library
packages (ISQ, SI, spatial items, analysis domain libraries …) beyond the platform subset (§4).

## 2. Textual notation: supported constructs

Each row is a case in `packages/sysml-core/src/conformance/cases.ts` that must parse with no
diagnostics, produce the listed metaclasses, validate without errors, and round-trip: text →
model → text → model (semantically equal canonical form, serialization is a fixed point) and model →
API JSON → model.

| Area | Constructs |
| --- | --- |
| Namespaces | `package`, `library package`, nested packages, visibility `public`/`private`/`protected`, `import X::*`, `import X::Y`, `import X::**`, `alias … for …` |
| Comments | `doc /* */`, `comment name about X /* */`, bare `/* */`, notes `//` and `//* */` (ignored), `locale` |
| Names | short names `<'R-1'>`, unrestricted names `'Power unit'`, keywords quoted on output |
| Definitions | `part`, `attribute`, `enum` (with literals), `item`, `port`, `connection`, `interface`, `allocation`, `flow`, `action`, `state`, `constraint`, `requirement`, `calc`, `occurrence`, `metadata`, `use case`, `verification`, `analysis`, `case`, `concern`, `viewpoint`, `view`, `rendering`; `abstract`, `variation` flag; specialization `:>` |
| Usages | the same kinds plus `ref`, `subject`, `return`, `end`, `actor`, `stakeholder`, `objective`; typing `:` / `defined by`, conjugated `~T`, `:>` / `subsets`, `:>>` / `redefines`, `::>` / `references` (names or feature chains), multiplicity `[n]`, `[n..m]`, `[*]`, `ordered`, `nonunique`, `in`/`out`/`inout`, `derived`, `constant`, values `=`, `:=`, `default` |
| Connections | `connect a.p to b.q`, `connection c : T connect …`, `interface i : I connect …`, `flow of T from … to …`, `bind x = y`, `first a then b`, `succession`, `allocate a to b` |
| Behaviour | action parameters, `first x;`, `then x;`, `then action a;`, `perform action`, `perform x.y;`, `exhibit state`, `accept [name :] T [via p]`, states, `entry`/`do`/`exit`, `transition t first s accept T via p if g then s2`, shorthand `accept T then s2;` |
| Requirements | `subject`, `require constraint { }`, `assume constraint { }`, `require c;`, `satisfy R by x`, `not satisfy`, `assert constraint`, `assert not constraint`, `verify r;` in objectives, `frame c;` |
| Views | `view` / `view def` with `expose X::*` / `expose X::**`, `render r;`, `rendering` (structure only) |
| Expressions | integer, decimal, string, boolean, `null`, `*` literals; `+ - * / % ** ^`; comparisons; `and or xor not implies`; `if … ? … else …`; invocation `F(a, b)`; sequences `(a, b, c)`; feature chains; quantities `12 [kg]`, `9.81 [m/s^2]` |
| Metadata | `@T;`, `@T { name = value; }`, `metadata m : T about x;`, prefix `#T` (also after `end`, `ref` …) |

## 3. Not supported yet (reported as `SYSML-SYNTAX-UNSUPPORTED`, never dropped silently)

`send`, `message`, `event`, `snapshot`, `timeslice`, `individual`, `variant` members, `filter`,
control nodes (`decide`, `merge`, `fork`, `join`), loops and `assign`, `include use case`,
`dependency`, `language`/`rep` textual representations, `after`/`at`/`when` triggers, `crosses`,
`meta`. Also not parsed (syntax errors): `new` constructor expressions, `as`/`meta` casts, `->`
invocation, `@` classification operators, multiplicities written before `end` features, named
invocation arguments, `then` after an unsupported member. Cases: `cases.ts` (`supported: false`).

## 4. Abstract syntax: simplifications and deviations (stated explicitly)

| Topic | This implementation | Specification |
| --- | --- | --- |
| Operator and invocation arguments | Owned argument expressions via `ParameterMembership` | Arguments are values of owned input parameters (feature values) |
| Feature chains in expressions | `FeatureReferenceExpression` owning a chain `Feature` | `FeatureChainExpression` |
| Flow ends | Connector ends with reference subsetting; payload as `PayloadFeature` | `FlowEnd` with redefinitions of `sourceOutput`/`targetInput` |
| `satisfy R by x` | Subject parameter with a feature value referencing `x` | Binding connector between subject and `x` |
| Transitions | Source as a non-owning membership, trigger accept action, owned succession | Same structure; guard and effect partly (effect `do` not parsed) |
| Implicit specializations | Not created (e.g. a part definition does not implicitly specialize `Parts::Part`) | Required by the library semantics |
| Model library | Platform subset written for this module (`library/text.ts`): Base, ScalarValues, Parts, Items, Ports, Connections, Interfaces, Allocations, Actions, States, Constraints, Requirements, Calculations, Quantities, MeasurementReferences, ISQ subset, SI subset, EWS metadata. Library IDs follow the KerML §9.1 name-based UUID scheme | The OMG standard library |
| Derived properties | Computed on demand; added to API JSON only with `?derived=true` | API "full" level |
| Unknown metaclasses (JSON import) | Preserved opaquely, reported as `SYSML-UNSUPPORTED-METACLASS` | n/a |
| Import visibility default | `private` | (to confirm against KerML 1.0 formal text) |

## 5. Validation rules

Implemented in `packages/sysml-core/src/validation/validate.ts` (17 rules), each tested in
`core.test.ts`: SYSML-REF-DANGLING, SYSML-OWNERSHIP, SYSML-TYPING-KIND, SYSML-SPECIALIZATION-KIND,
SYSML-SPECIALIZATION-CYCLE, SYSML-MULTIPLICITY, SYSML-DUPLICATE-NAME, SYSML-REDEFINITION-TARGET,
SYSML-UNIT-DIMENSION, SYSML-UNIT-MISSING, SYSML-CONNECTOR-ENDS, SYSML-SATISFY-TARGET,
SYSML-TRANSITION-STATES, SYSML-COMPOSITION-CYCLE, SYSML-MANAGED-REQUIREMENT, SYSML-CONSTRAINT-FALSE,
SYSML-UNSUPPORTED-METACLASS. They approximate (not reproduce) specification constraints; most KerML
and SysML `validate…` constraints are not checked.

## 6. Systems Modeling API alignment

Aligned (paths, verbs, JSON shapes): projects (GET/POST, GET by id), branches (GET/POST, GET by id),
tags (GET/POST), commits (GET/POST with `change` data versions, GET by id, changes), elements at a
commit (paged with `page[size]`/`page[after]` and `Link`), element by id, element relationships
(`direction`), roots, diff (`baseCommitId`), query results (subset of `Query`). Tested in
`services/sysml/test/sysml.api.test.ts`.

Deviations: no `PUT`/`DELETE` of projects, branches, tags; no merge; no saved queries
(`/queries`); no `projectUsage`; no `/meta/datatypes`; query constraints limited to `@type`, `@id`,
`declaredName`, `name`, `qualifiedName`, `owner` with `=`, `contains`, `kindOf`; data version
payloads must be complete elements; commits record extra provenance fields (`number`, `actor`,
`source`, `summary`). Platform extensions are marked `x-ews-alignment: platform extension` in OpenAPI.

## 7. SysML v1 interoperability

Not implemented: SysML v1.7 XMI import/export and the v1-to-v2 transformation are Phase 5 (brief
§11). No compatibility with Cameo, Rhapsody or Enterprise Architect files is claimed.
