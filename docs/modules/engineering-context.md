# Engineering context and interface intelligence (ECII)

Status: **started with increment 1** (engineering intent and clarification; 16 October 2026). Owner brief:
[ecii-brief.md](../specifications/ecii-brief.md). Accepted plan: [ecii-plan.md](../specifications/ecii-plan.md). Progress:
[ecii-progress.md](../specifications/ecii-progress.md). Decision: [ADR-0081](../decisions/0081-ecii-placement-and-interface-ownership.md).
Practice research: [engineering-practice.md](../research/ecii/engineering-practice.md).

ECII is a capability across existing modules, not a new module. It lets the assistant behave like a systems engineer: understand
what is being designed, whether it works with an existing system, which systems are involved, what is not yet known, and what must
be asked or investigated before design alternatives are proposed. It is domain-independent: no engineering noun appears in rules,
schemas, code or instructions (a test enforces this); domain words belong in test fixtures only.

## 1. Architecture

The context graph is a federated view, not a new database:

| Concept | Home | Increment |
| --- | --- | --- |
| Engineering intent | Conceptualize, revisioned type `INT-` | 1 (done) |
| Gaps (missing information, four tiers) | computed from the intent by Conceptualize | 1 (done) |
| Interfaces | Conceptualize `IFC-`, ends are `ArtifactRef`s (option A, [ADR-0081](../decisions/0081-ecii-placement-and-interface-ownership.md)) | 3 |
| Product, host, external system | Projects product elements with a new `origin` (designed, existing, purchased) | 3 |
| Facts with status | Conceptualize | 3 |
| Reference documents and sources | Projects documents plus `document_sources` | 3-4 |
| Research | `ResearchSource` port, fixture adapter first | 4 |
| Readiness gate, architecture-first generation | Conceptualize | 2 |

Operations follow the existing proposal-preview policy: proposals are previewed and applied by a person; reads and calculations run
directly. The model fills in the structure; the code validates it and computes from it. There are no keyword rules.

## 2. Engineering intent (increment 1)

A revisioned Conceptualize record (`INT-001`), immutable per revision, with provenance. The assistant writes it with the basis
`ai-hypothesis`; the service refuses any other assistant basis.

| Field | Meaning |
| --- | --- |
| `designObject`, `role` | what is designed; standalone, accessory, component, modification or system |
| `integration`, `rationale` | `standalone`, `hosted`, `embedded`, `connected`, `replacement` or `undetermined`, and why |
| `externalSystems[]` | name, role, description, optional product element reference, `identified`, `owner` (project, external, shared), `relation` (mounts-to, connects-to, integrates-with, interferes-with) |
| `objectives`, `environment` | plain statements |
| `informationNeeds[]` | `id`, text, `tier` 1-4, subject, `route` (research, ask-user, measure, defer), `state` (open, resolved) |
| `assumptions` | assumption record IDs |
| `questions[]` | text, why, `impact` (blocks, changes-architecture, refines), options, `state` (open, answered, withdrawn), optional `needId` |
| `basis` | `ai-hypothesis` when written by the assistant |

Structure rules (checked by the service, never from words): a standalone design object has no external systems; role `standalone`
cannot combine with an integration mode that involves another system; an identified system has a name or a product element; a
system with a product element is identified; IDs are unique; a question states why and offers at least one option; tier 4 needs are
never routed to research. A system without a product element keeps its description and `identified` false.

### Operations (Conceptualize client and server manifests)

| Operation | Class | Behaviour |
| --- | --- | --- |
| `conceptualize.interpret_intent` | propose | declarative proposal: creates the intent or, with `intentId`, a new revision |
| `conceptualize.read_context` | read | the intent with its assumptions, the project constraints and concepts, open questions and gaps |
| `conceptualize.identify_gaps` | calculate | deterministic gaps in four tiers: essential, concept, detail, immaterial |

API: `/intents` (list, create), `/intents/{id}` (read, revise; by UUID or key), `/intents/{id}/revisions`, `/intents/{id}/gaps`,
`/intents/{id}/context`. Capability entries `conceptualize.context` and `conceptualize.context.gaps`; help page
`conceptualize.context`.

### Gaps

Computed from the structure of one intent revision:

- an `undetermined` integration is an essential gap; a mode that involves another system with none listed is an essential gap;
- each unidentified external system is a gap (essential when the design attaches to it; concept tier when it only has to stay
  clear), routed to the person, with text built from the system's role and the relation, for example "identify host model and
  mounting features";
- each open information need, by tier (1 essential, 2 concept, 3 detail, 4 immaterial) and route;
- research items are open tier 1 needs routed to research only; a standalone intent yields none;
- an essential gap routed to the person is "unasked" until an open question names it (`needId`).

### Assistant behaviour

The instruction lines in `services/assistant/src/wire.ts` ask the model to interpret the intent first, identify gaps, research before
asking, ask targeted impact-ranked questions with reasons and options (continue generically, identify the existing system, upload
photos or CAD, supply measurements), never fabricate interface values, and to proceed on explicit assumptions only for non-essential
gaps.

### Testing and what it proves

PostgreSQL tests cover structure validation, revisioning, basis rules and gaps; the replay scripts `ecii-a.json` and `ecii-d.json`
run through the browser flow `ecii`. They prove structure, gating and plumbing, **not reasoning quality**: whether a model reads a
request well is a live evaluation of Tests A-E against a rubric.

## 3. Architecture-first generation and the readiness gate (increment 2)

Decision record: [ADR-0083](../decisions/0083-architecture-first-and-readiness-criteria.md). Code: `services/conceptualize/src/domain/architecture.ts`
(rules, no model, no keyword rules), `store/architecture.ts`, `http/architectureRoutes.ts`; assistant side
`packages/tool-conceptualize/src/assistantArchitecture.ts`. No migration: the architecture block is part of the Concept's engineering
definition (JSONB, validated by `normalizeDefinition` for the user and the assistant alike).

- **Architecture block** (`definition.architecture`): `level` (`architecture` or `variant`), `parent` (variants name the architecture they vary), `hostInterface`,
  `attachmentPrinciple`, `interfaceGeometry`, `loadPath`, `installationRemoval`, `advantages`, `disadvantages`, `risks`, `assumptions`, `evidenceRequired`.
  An architecture needs the principle, load path, installation and removal, one disadvantage and one item of evidence required. Omitting the block in a
  revision keeps the stored one; `null` removes it. A change is an `architecture` area change, so a CAD handoff built earlier is flagged possibly outdated.
- **`develop_alternatives`** gains `level`, `parentArchitecture` and a per-alternative `architecture`; without `level` it behaves as before. The preview shows the block,
  a "Readiness (advisory)" line and, when unmet, a provisional assumption. After Apply, level architecture reports the diversity result.
- **`assess_diversity`** (`GET /diversity?conceptIds|setId|parentId&minimum`, calculate): token similarity per signature field (host interface, principle,
  geometry, load path, installation), thresholds as data; same principle or mean similarity above the threshold means the same architecture
  ("differs only in parameters" when parameter values differ); variants and unclassified items are listed, not counted.
- **`evaluate_readiness`** (`GET /readiness?intentId&activity&conceptId`, calculate): levels not-established, Exploratory, Context Established, Interfaces
  Verified; criteria are an ordered list of named checks (`READINESS_CRITERIA`, version `readiness-criteria/1`); activities architecture-concepts (Exploratory),
  host-specific-concepts (Context Established), dimensioned-design and cad-handoff (Interfaces Verified). The result has the hook `contextReadiness
  { state, blockingIssues }` for the context package. Output is *provisional* whenever the level is below Interfaces Verified or the gate is unmet.
  Until increment 3 supplies interface and fact records, a design object that works with another system cannot reach Interfaces Verified; one that works
  alone has nothing to verify. **Advisory in Phase 1**: nothing is refused.
- **`create_cad_handoff`**: the package carries `architecture` and `readiness`; unmet items are listed as `provisional-readiness` unresolved entries.
- **Tests**: `domain/architecture.test.ts`, `test/architecture.api.test.ts` (PostgreSQL), `assistantArchitecture.test.ts`, replay scripts `ecii-a` (A6-A8),
  `ecii-d` (D3), `ecii-e-sensor`, `ecii-e-fan` (Test E), `d1-plumbing` (D1-a, D1-b), browser flows `ecii` and `demo-d1`. They prove structure, not reasoning quality.
