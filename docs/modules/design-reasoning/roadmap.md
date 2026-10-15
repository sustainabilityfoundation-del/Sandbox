# J. Phased implementation roadmap

Status: Proposed. Index: [README.md](README.md). Delivered as short sprints per the
[development workflow](../../development-workflow.md); each milestone below is one or more sprints with
its own plan, checkpoint and owner walkthrough.

## 1. Milestones

| ID | Milestone | Brief phase | Owner(s) | Depends on |
| --- | --- | --- | --- | --- |
| R0 | Architecture set and proposed ADRs (this set) | — | Reasoning agent | — |
| R1 | **Validation prototype** (brief §14) | bridges 1→2 | Reasoning agent (packages assigned at approval) | R0 approved |
| R2 | **Persistent knowledge in Conceptualize**: CR-C1…C10, C12; SDK 1.6 (CR-S1…S4); basic UI views (function tree, function–means tree, assumptions, decision rationale, evidence ladder) | 1 | Conceptualize agent; coordinator (SDK) | R0 approved; Conceptualize vertical slice |
| R3 | `@ews/engineering-calc` and `@ews/design-reasoning-core` production-ready; calculated evidence verification in Conceptualize (CR-C8) | 1 | Reasoning agent; Conceptualize agent | R1, R2 (partly) |
| R4 | **Reasoning service** (schema `reasoning`, runs, manifests, invocations, drafts, API, events); Context Resolver, template planner, tool orchestrator, evidence evaluator, impact analyzer | 2 | Reasoning agent; coordinator (host registration CR-P2) | R2, R3 |
| R5 | **AI integration**: declarative proposals (CR-A1), headless contribution (CR-A2), proposal card and run panel (CR-A4), inventory (CR-A5); `reasoning.*` tools with a fake provider and the scripted demo | 2 | Coordinator (AI Interface); reasoning agent (contribution) | R4; AI sprint 4 for a real provider |
| R6 | Synchronization and impact notifications (CR-C11, event-driven checks) | 2 | Conceptualize agent; reasoning agent | R4 |
| R7 | **Engine-driven exploration**: model gateway (CR-A3), budgets and plan acceptance, parallel branch runs, sampling-based multiobjective search, Python worker ADR if needed | 3 | Reasoning agent; coordinator | R5, AI backend provider |
| R8 | Analysis integration (replace the test adapter) | 3 | Future Analysis module | Analysis module exists |

## 2. Acceptance criteria

### R1 Validation prototype (brief §14; mechanical actuator)

Status (15 October 2026): **technically complete, ready for coordinator review.** Evidence and checkpoint:
[progress file, Phase B](../../specifications/design-reasoning-progress.md#phase-b-validation-prototype-r1-approved-15-october-2026).

All ten demonstrations run as **automated scenario tests** through the proposed APIs (no UI-only
behaviour), using real code where it exists and **clearly named contract-test adapters** otherwise:

| # | Demonstration | Acceptance evidence |
| --- | --- | --- |
| 1 | Functional objective without a solution | Function "Convert motor rotation into linear force" with objective F ≥ 12 kN exists with no Concept; test asserts no implementation can reference it |
| 2 | Several candidate concepts | Ball screw, lead screw, rack and pinion, hydraulic cylinder drafted through `propose_solution_concepts` (scripted candidates, labelled `ai-hypothesis`) |
| 3 | Functions and concepts are separate entities | Different types, keys and endpoints in the Conceptualize contract adapter; invariant tests |
| 4 | Alternatives linked to the same objective | All four `performs` the Function; alternative set has `functionId`; test refuses a member that does not perform it |
| 5 | Assumptions and constraints recorded | ASM (steel E = 210 GPa; pinned ends K = 1), CST (F ≥ 12 kN formalizing REQ-001 at its revision; envelope) |
| 6 | One preliminary relationship evaluated deterministically | Euler buckling CALC model evaluated by `@ews/engineering-calc` with ROD-120 dimensions (pinned revision) and the assumptions; manifest digest stable on replay; dimensional error test (force vs length) refused |
| 7 | Comparison with explicit criteria | Trade study with weighted sum and Pareto; bases shown; preliminary flag set |
| 8 | Decision with supporting evidence | Decision drafted with support = calculated evidence, assumptions, constraints and invalidation conditions; recorded by a reviewer identity |
| 9 | Selected concept linked to an existing artifact | Implementation realizes the ball-screw Concept with refs to `twin:ROD-120`, `cad:CAD-120`, `sysml:SYS-003` (existing sample twin IDs) |
| 10 | Constraint change identifies affected decisions and implementations | Changing CST to F ≥ 120 kN (hypothetical) → ImpactReport: buckling check violated (demonstrated), decision `under-review` (demonstrated), implementation possible; unrelated decision `checked-unaffected` |

Also: unit tests for domain invariants (cycles, endpoint rules, basis promotion refusals), traceability
(requirement → … → artifact both directions) and impact classification; `npm run check` green; a short
written walkthrough. **Not** in R1: UI views, persistence in PostgreSQL for the new entities (owned by
Conceptualize), a model provider.

Proposed R1 placement (to be set in the approval): `packages/engineering-calc`,
`packages/design-reasoning-core` (with `src/adapters/conceptualizeContractAdapter.ts`, an in-memory
implementation of the **proposed** Conceptualize contract, named and documented as a test adapter), and a
scenario test file; `mathjs` 15.2.0 added to the root lockfile; no changes to other packages.

### R2 Persistent knowledge
Functions, constraints, assumptions, typed links, decision extensions, evidence extensions, calculation
models and the graph API pass real-PostgreSQL API tests and the contract test suite on both adapters; the
additive migrations pass fixture tests of the b5e2668 schema; the five questions of user-experience.md §3
other than "different way" are answerable in the Conceptualize UI without AI.

### R3 Calculation engine
Reference cases with independent hand or textbook values (buckling, beam deflection, screw torque, gear
ratio) agree within 1e-9 relative; dimensional analysis test corpus (≥ 50 relations, valid and invalid);
interval vertex results checked against analytic bounds for monotonic cases; worker timeout and AST limits
tested; Conceptualize refuses a tampered manifest.

### R4 Reasoning service
Runs with manifests and invocations persisted; cancel/resume/replay tested; budgets enforced; reads as the
user (unauthorized items omitted); drafts expire on input change; OpenAPI validated against responses.

### R5 AI integration
A fake-provider conversation answers the five questions through registered operations; proposals preview
with basis/evidence/uncertainty and apply through module APIs in another window too (declarative); every
reasoning operation is in the capability inventory and the help manifest.

### R6 Synchronization
Each sync state is produced by a fixture; impact notifications appear after a requirement revision and a
CAD dimension change without any record being edited.

### R7 Engine-driven exploration
The 20 % mass scenario (exploration.md §4) runs with a fake model producing candidates, sequential then
parallel branches, budgets and cancellation, and ends in one bundled draft; reproducibility replay of
deterministic steps matches digests.

## 3. Phase 1 infrastructure budget

Phase 1 (R1–R3) adds: two framework-free packages, one runtime dependency (mathjs), Conceptualize tables and
endpoints. It adds **no** reasoning database, no reasoning service, no queue, no worker pool, no graph or
vector database, no provider integration.

## 4. Risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Conceptualize capacity: the CRs land while its vertical slice is in progress | Delays R2; schema churn | Prioritize P1 CRs; prototype R1 against a contract adapter so the contract is validated before Conceptualize implements it |
| Function vs Concept duplication during migration | Two ways to express a function | Explicit convert operation; UI guidance; new seed uses Functions only |
| Twin remains browser-side | Server-side context and impact incomplete; provenance of twin data is client-attested | CR-P1 labelled route; impact for twin links runs in the browser via `design-reasoning-core` |
| Provenance asserted by the browser (Conceptualize conflict 6) | Weak audit for AI writes | Declarative proposals now; ADR-0013 gateway later; no tamper-proof claims |
| Over-formalization (capture cost kills rationale systems, research note) | Users stop recording | Every new field optional except where invariants need it; AI drafts the structure, users confirm |
| Unit-system divergence | Wrong numbers | Single unit algebra in the SDK; engine and Conceptualize share it; conformance corpus |
| mathjs gaps (no nonlinear solver/optimizer) | Phase 3 needs | Engine-owned 1-D root finder; Python worker ADR in R7 |
| Expression evaluation abuse | DoS or injection | Own AST interpreter, function whitelist, size limits, worker timeouts |
| Model-generated content mistaken for engineering fact | Unsafe decisions | Basis ladder enforced server-side; calculated evidence re-verified; UI badges |
| No Analysis module | Evaluations limited to closed-form calculations | `AnalysisPort` test adapter clearly labelled; R8 when a module exists |
| ADR-0013 changes the registry shape | Rework of contribution | Tool definitions are data served by `/tools`; contribution is a thin adapter |
| MDO architectures unread (research gap) | Phase 3 design may be naive | Read Martins and Ning §13.4–13.6 before R7 |
