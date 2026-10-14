# AI Interface: architecture and guiding principles

Status: Proposed (14 October 2026). Existing implementation remains a scripted assistant demo.

Related: [current architecture](../architecture.md#6-ai-vision-6), [ADR-0010](../decisions/0010-ai-through-the-same-command-boundary.md), [features](ai-interface/features.md), [development plan](ai-interface/development-plan.md).

## 1. Product outcome

Allow an engineer to describe an intention in freeform conversation, clarify material uncertainties,
explore alternatives and produce concrete, inspectable engineering artifacts in the platform.
Conversation should span tools without requiring the user to translate their intention into menu
commands. The user can interrupt, correct assumptions, inspect intermediate results and resume later.

The drill-bit holder in the feature document is an illustrative acceptance scenario only. Build
general capabilities for interface acquisition, constraints, concepts, CAD and export. Do not add
drill-, brand- or accessory-specific production entities, commands, workflows or UI. Any such
fixtures belong exclusively in tests or optional demonstrations and must not become default data
or a dependency of the AI module. The requested ten concepts are a per-task user input, not a
hard-coded product limit or default.

Every product capability must be discoverable and operable by AI within the current user's
permissions: buttons, fields, selections, views, domain operations, persistence, analysis, imports,
exports and jobs. This means functional coverage, not arbitrary access to source code, private
memory, database internals or secrets. Developers may separately use coding agents to modify source;
the product assistant changes engineering artifacts through application contracts.

## 2. Guiding principles

1. **One operation boundary.** UI, AI, automation and external clients invoke the same validated
   application operations. Do not maintain a weaker parallel implementation for AI.
2. **Complete capability coverage.** New functionality ships with a typed operation or an explicit
   documented mapping to an existing operation. UI-only navigation/view controls are covered too.
3. **Intent is flexible; contracts are explicit.** Preserve hard requirements, physical interfaces
   and approved constraints. Explore the remaining design space without turning every suggestion
   into a hard requirement.
4. **Engineering data is authoritative.** Conversation summaries and conceptual interpretations are
   derived, revision-aware representations. They do not silently overwrite exact product data.
5. **Evidence precedes precision.** Distinguish measured, manufacturer-specified, inferred, assumed
   and unknown values. Never present image estimates as verified mounting dimensions.
6. **Show the work product.** Expose plans, assumptions, alternatives, diffs and validation outcomes;
   do not require private model reasoning to explain a decision.
7. **Use authorization already given.** Avoid repeated confirmations for authorized reversible work.
   Ask where an answer changes correctness or a new action exceeds the granted scope.
8. **Progress honestly.** Label sketches, approximate geometry, validated models and export-ready
   artifacts distinctly. An attractive picture does not establish fit, strength or manufacturability.
9. **Recover and reproduce.** Pin inputs, preserve originals, make retries safe and provide undo or
   compensating operations appropriate to the action.
10. **Provider independence.** Domain contracts, validation and stored product data must not depend
    on a particular AI provider. Keep provider credentials on the server.

## 3. Components and ownership

| Component | Responsibility |
| --- | --- |
| Conversation workspace | Messages, attachments, linked objects, questions, concept galleries, previews and progress |
| Intent/task coordinator | Resolve goals, maintain the task plan, request missing inputs, sequence bounded operations |
| Design context service | Revision-pinned engineering context, intent summaries, assumptions, decisions and retrieval |
| Capability registry | Discover permitted module operations, schemas, effects, preconditions and implementation status |
| Execution gateway | Authenticate, validate, authorize, pin context, execute, record outcomes and reject stale operations |
| Research adapters | Authorized specifications, images, models and documents; provenance and licensing |
| Engineering workers | Geometry, rendering, simulation, validation and export through owning module engines |
| Artifact/evidence services | Versions, source references, task manifests, checks, generated concepts and outputs |
| Provider adapters | Translate conversation and operation schemas into a model provider's API |

The AI coordinator owns orchestration, not CAD, requirements or SysML algorithms. Each domain module
owns its operations and validators. Platform services own identity, configuration, authorization,
execution records and jobs. Reuse the current package boundaries before creating new repositories.
A later extraction into an independent AI package requires an ADR and compatibility review.

## 4. Command, query and UI contracts

Expose semantic operations rather than DOM selectors or screen coordinates. A toolbar button and
an assistant action invoke the same operation identifier. Fields expose typed read/update operations,
including allowed values, units and validation errors. View operations address a stable view instance;
domain writes address exact objects/revisions. Bulk jobs and headless execution should not require
an open panel or a simulated click.

Proposed capability metadata:

- Stable namespaced ID, schema version, owning module, description and implementation status.
- Input/output schemas, units, constraints, supported artifact types and structured errors.
- Effect class: query, view change, domain mutation, job, export or external action.
- Required permissions/entitlements, preconditions and expected revisions.
- Atomicity boundary, idempotency/retry behaviour, cancellation and recovery semantics.
- UI mappings, supported execution environments and conformance/test evidence.

Discovery is filtered by authorization. Revalidate at execution; do not trust the browser-supplied
operation list, model output or old entitlements. Reads and view controls also require permission.
AI must not write private tables directly. Storage lifecycle functions are exposed by the owning
service with validation, not through generic SQL or arbitrary filesystem access.

Maintain a capability inventory linking every interactive control and backend operation to an
operation contract. Test both discovery and effective execution. Mark secrets, authentication entry
and privileged infrastructure administration as explicitly restricted boundaries, not missing features.

## 5. Conversation, task and engineering records

Keep these records distinct, linked by stable IDs:

| Record | Content |
| --- | --- |
| Conversation | User statements, attachments, clarification answers and links |
| Design brief | Intended use, objectives, preferences, hard requirements and open variables |
| Interface definition | Reference geometry, mounting datums, fasteners, keep-out regions, units and evidence |
| Assumption/evidence | Value/range, provenance, uncertainty, confirmation state and affected artifacts |
| Task plan/run | Steps, dependencies, authorization scope, budgets, progress and execution records |
| Concept | Stable ID, distinct design approach, images, parameters, tradeoffs and unresolved constraints |
| Selection decision | Chosen concept/revision, user feedback and rejected alternatives |
| Engineering artifact | Module-owned exact model, requirement, analysis or export revision |
| Validation report | Checks, input revisions, results, limitations and reviewer decisions |

Persist authoritative records transactionally. Large images/models/results belong in artifact
storage. Retrieval indexes and AI summaries are rebuildable projections with source references and
freshness. Summaries must preserve hard constraints, unresolved questions and decision provenance.
Do not treat an embedding match or model confidence score as engineering evidence.

Capture project, configuration, object and view context when a task begins. Later selection changes
must not redirect an in-flight operation. Re-resolve/revalidate references on execution. On changed
inputs, invalidate dependent concepts, plans or evidence and show the implications before reuse.

## 6. Authorization and execution lifecycle

Proposed lifecycle: understand -> clarify/research -> plan -> generate alternatives -> select ->
implement -> validate -> export -> handoff. Steps may iterate or be skipped when adequate evidence
and authorization already exist. Store progress so interruptions do not restart completed work.

The current implementation requires applying a proposal preview. Preserve that behaviour until an
explicitly reviewed policy change introduces scoped autonomous execution. Future task authorization
should describe permitted operations, target workspace/configuration, resource budgets and approval
points. Authorized reversible edits can proceed within that scope; destructive changes, external
sharing, purchases or release actions require the applicable additional authorization.

Use atomic domain batches and expected revisions. Repeated calls must not duplicate objects or
exports. Multi-module jobs need checkpointed, recoverable steps; do not promise global rollback.
Cancellation stops new operations and reports completed effects. Export to a new artifact by default;
do not overwrite user files implicitly. Record actor, operation, context, result and provenance.

External documents, web pages and imported model metadata are untrusted data, never instructions.
Validate files and isolate executable models/workers. Provider requests include only authorized,
necessary context. Permission revocation must affect queued work and later retrieval as well as UI.

## 7. Research and physical interface acquisition

Identify exact model/variant or establish the intended compatibility family. Prefer authorized CAD
and manufacturer drawings/specifications; use images, manuals and user measurements to fill gaps.
Track source URL/file, retrieval date, revision, license/reuse permission and interpretation.

Define mounting hole centers, thread, engagement limits, datums, accessory envelope, ventilation,
battery removal, controls, grip and other keep-outs relevant to the task. Obtain load/use and material
assumptions when they affect the design. Reference models may be incomplete: explicitly model missing
keep-outs rather than assuming an imported mesh contains every functional interface.

Images can support shape understanding but do not establish hidden geometry, thread identity or
absolute scale without reference measurements. If necessary, ask for model labels, caliper measurements,
scaled photographs or scans. Universal compatibility requires evidence for the defined model family;
it cannot be inferred from one drill. Never fabricate a source or download restricted CAD.

## 8. Concept-to-CAD continuity and export

Generate alternatives from the design brief and known interfaces. Keep concept IDs and underlying
parameters linked to drawings. Prefer geometry-based previews where dimensions/fit matter; conceptual
illustrations remain explicitly non-dimensioned. Selecting a picture does not imply its geometry is
manufacturable. Preserve the selected design's intended features during CAD construction and report
necessary departures.

CAD creation must yield an editable native model with traceable inputs, not only a triangle mesh.
Validate geometric integrity, mounting fit, keep-out clearance and relevant printing constraints before
export. Where analysis is unavailable, label limitations rather than declaring structural adequacy.

STL is a derived output and does not preserve native parametric history or a reliable unit declaration.
Record millimetres/other intended units, mesh tolerance, orientation, selected model revision and checks
in an export manifest. Keep the native CAD and export together. A 3MF export can be evaluated later;
record its exact specification/version before claiming support.

## 9. Standards and conformance

Use versioned schemas and documented APIs. Evaluate OpenAPI for HTTP interfaces and MCP for external
AI capability discovery; neither replaces domain authorization or validation. Reuse the platform's
standards strategy: ReqIF for requirements exchange, SysML v2/API for systems modelling, STEP AP242
for product exchange and FMI/SSP when executable simulation is added.

For each integration, record exact version/profile, supported subset, direction, limitations and
conformance/interoperability evidence. Never describe the current prototype as standards-compliant
based only on a schema, generated text or a successful file parse.

## 10. Current implementation boundary

Existing code: `apps/workspace/src/assistant/`, `packages/platform-sdk/src/contract/assistant.ts` and
module assistant contributions. It provides captured context, tool descriptions, scripted proposals,
revision/ownership validation and preview application. `RemoteAssistantService` is an adapter for an
application backend; that does not establish an implemented provider backend.

Implemented since: a capability inventory and coverage view ([coverage](ai-interface/coverage.md)).

Not implemented by this document: complete capability coverage, research connectors, persistent task
orchestration, concept generation, real CAD kernel operations, geometric verification or STL export.
Implementation follows the [short-sprint development plan](ai-interface/development-plan.md).
