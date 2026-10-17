# ECII augmentation: Context Engineering, AI Grounding and Closed-Loop Design Reasoning (owner brief)

Status: **owner brief, 16 October 2026; augments the [ECII brief](ecii-brief.md), does not replace it.** The text below is the owner's
brief as issued (formatting normalised). Coordinator notes at the end map it onto the repository; they do not change it.

## Directive

Augment the existing Engineering Context & Interface Intelligence (ECII) architecture brief and implementation plan. This is an
extension of the previously issued ECII instructions, not a replacement. The original ECII brief established engineering intent
interpretation, external-system discovery, interface identification, evidence management, and context readiness. This augmentation
defines how that knowledge must be delivered to AI models and used to improve their engineering reasoning.

**Core principle:** engineering context must not merely be stored in Faber. It must actively influence AI generation, tool execution,
evaluation, and subsequent design decisions.

Coordinate this work between the ECII agent, AI Infrastructure agent, Design Reasoning agent, and Conceptualize agent. Assign one
clear owner for each interface. Preserve the existing end-to-end demonstration as the highest implementation priority.

## 1. Introduce an Engineering Context Engineering Layer

Architect a shared service responsible for dynamically constructing task-specific engineering context packages. This layer shall sit
logically between: ECII and the persistent project knowledge; the AI orchestration gateway; individual engineering modules; the
Design Reasoning system. It shall not be implemented as a second AI gateway or an independent engineering database. Its purpose is to
transform the relevant engineering knowledge into an effective, structured input for whichever AI model is executing a task.

Required capabilities: identify the current AI operation and engineering objective; retrieve relevant project artifacts and
relationships; retrieve relevant external evidence already discovered by ECII; resolve relevant host systems and engineering
interfaces; identify applicable requirements and constraints; retrieve previous engineering decisions and assumptions; identify
missing or conflicting information; construct a task-specific context package; deliver the package through the existing AI
orchestration infrastructure; preserve traceability between context, model execution, and generated output.

The context package must be independent of any particular AI provider. Provider adapters may translate it into the formats best
supported by OpenAI, Anthropic, Google, or other models.

## 2. Define a canonical Engineering Context Package

Introduce a typed, versioned data contract. An Engineering Context Package should include, where relevant:

```ts
interface EngineeringContextPackage {
  contextId: string;
  schemaVersion: string;
  projectId: string;
  configurationId?: string;
  task: { operation: string; objective: string; targetArtifactIds: string[]; requestedOutputType: string };
  engineeringIntent: { designObjective: string; systemBoundary?: string; integrationRelationships: string[] };
  relevantSystems: ContextEntityReference[];
  interfaces: EngineeringInterfaceReference[];
  requirements: ContextRequirementReference[];
  constraints: ContextConstraintReference[];
  designDecisions: ContextDecisionReference[];
  evidence: ContextEvidenceReference[];
  assumptions: ContextAssumption[];
  unknowns: ContextUnknown[];
  applicableTools: string[];
  contextReadiness: { state: "exploratory" | "established" | "verified"; blockingIssues: string[] };
  provenance: { sourceArtifactRevisions: string[]; assembledAt: string };
}
```

These are illustrative types. Align them with existing SDK contracts, project artifact models, and revision semantics. Do not
duplicate existing engineering entities. Use stable references to authoritative artifacts rather than copying large quantities of
persistent data into new stores. The context package is an execution snapshot, not a competing source of truth.

## 3. Task-specific context selection

Do not send the entire project database to every model invocation. Implement context selection based on the operation being performed.

- **Concept generation:** prioritize design objectives; functions; host systems; integration relationships; candidate interfaces;
  operational constraints; relevant reference imagery; previous concepts; unresolved architectural decisions.
- **Requirements generation:** prioritize stakeholder needs; design objectives; system boundaries; functional relationships;
  applicable constraints; existing requirements; evidence and assumptions.
- **SysML generation:** prioritize system decomposition; components; functions; ports and interfaces; relationships; requirements
  allocation; relevant architectural decisions.
- **CAD generation:** prioritize verified geometry; interface datums; dimensions and tolerances; coordinate systems; clearances and
  keep-out volumes; selected concept architecture; relevant CAD artifacts.
- **Engineering analysis:** prioritize geometry; materials; loads; boundary conditions; units; assumptions; calculation models;
  applicable requirements.
- **Design review:** prioritize requirements; design decisions; verification evidence; engineering constraints; known risks;
  outstanding assumptions; change history.

Support module-specific context selectors through documented extension interfaces.

## 4. Context relevance, ranking and token budgets

Implement a relevance-selection strategy that considers: (1) direct relationship to the requested engineering task; (2) engineering
importance; (3) source authority; (4) artifact revision and configuration applicability; (5) evidence quality; (6) dependency
relationships; (7) estimated token cost.

Critical interface dimensions and safety-relevant constraints must not be omitted merely because a text-similarity search ranks them
poorly. Prefer structured graph traversal for explicit engineering relationships and semantic retrieval for unstructured documents.
Support configurable context budgets and model-specific limits.

When context exceeds the budget: preserve mandatory engineering constraints; preserve critical interfaces; preserve material
uncertainties; summarize lower-priority background information; retain references to omitted evidence; allow targeted follow-up
retrieval through tools. Do not treat a compressed summary as a substitute for authoritative numerical data.

## 5. Grounded AI generation

Modify the AI execution workflow so that engineering operations receive an appropriate context package. The model shall be
instructed to distinguish: verified facts; documented facts; derived information; estimates; assumptions; unknown information.

The AI shall not invent missing engineering specifications and present them as established facts. Where a missing fact materially
affects the design, the model should either: invoke an appropriate research tool; request targeted clarification; or proceed
provisionally with an explicit assumption.

Every significant design decision should identify the engineering context on which it depends. The model should use context to guide
its reasoning without being constrained to reproduce existing designs. Preserve the ability to explore novel architectures between
fixed external interfaces.

## 6. Closed-loop engineering evaluation

Introduce a structured evaluation stage following AI generation. The evaluation stage shall assess whether the output: addresses the
actual engineering objective; respects known host-system interfaces; satisfies mandatory constraints; uses evidence appropriately;
identifies unsupported assumptions; preserves the intended system boundary; is consistent with relevant previous decisions; produces
the requested type of engineering artifact; offers meaningful architectural diversity when alternatives are requested.

Separate deterministic checks from AI-based assessments.

- **Deterministic validation**, for example: required fields are present; units are dimensionally consistent; referenced artifacts
  exist; configuration revisions match; numeric constraints are satisfied where calculable; CAD geometry passes available kernel
  checks.
- **AI-assisted evaluation**, for example: the concept addresses the user's actual objective; the proposed attachment architecture
  is mechanically plausible; the alternatives are genuinely different; the design reasoning is coherent; important operating
  constraints have not been overlooked.

AI evaluation is advisory unless supported by deterministic verification. Do not describe an AI judgment as engineering validation.

## 7. Controlled refinement loop

Support the workflow: Discover → Assemble Context → Generate → Evaluate → Refine → Persist.

When evaluation identifies a deficiency, the system should determine whether to: regenerate the concept; retrieve additional context;
investigate an interface; request clarification; correct a specific artifact; record an unresolved limitation.

Use configurable iteration limits, latency budgets, and cost budgets. Prevent uncontrolled recursive AI calls. Avoid regenerating an
entire design when a localized correction is sufficient. Record evaluation findings and changes between iterations.

## 8. Persistent engineering knowledge and reuse

ECII shall maintain persistent knowledge across interactions. For example, once the user identifies a particular cordless drill model,
the system should retain its identity and the evidence-backed interface definitions in the project. Subsequent operations should
retrieve the relevant information automatically.

Example sequence:

- Request 1: "Design a drill-bit holder for my cordless drill." ECII identifies the host system and investigates mounting interfaces.
- Request 2: "Make the holder removable without tools." The AI retrieves the established host context and explores appropriate
  removable attachment architectures.
- Request 3: "Check interference with the battery." The AI retrieves the selected concept, host geometry, battery clearance
  information, and applicable requirements.
- Request 4: "Generate the CAD model." The AI receives the selected architecture and verified interface geometry rather than relying
  on a previous conversational summary.

Do not require the user to repeatedly restate established engineering facts. Ensure context is configuration-aware and revision-aware.
If a host model or critical interface changes, identify dependent artifacts requiring reassessment.

## 9. Context transparency in the interface

The user should be able to understand what engineering information the AI used. Add a compact Engineering Context inspector accessible
from the AI assistant. For each engineering AI operation, display: objective interpreted by the AI; relevant systems; interfaces
considered; requirements and constraints used; evidence sources; assumptions; missing information; context readiness; model used;
evaluation results.

Provide an expandable view rather than permanently occupying canvas space. Allow the user to correct the AI's interpretation or mark
evidence as inappropriate. Show which artifacts were generated from which context snapshot. Use the existing design system and
capability registry.

## 10. Regression demonstration: drill-bit holder

Use the existing drill-bit holder example as the primary benchmark.

- **Baseline:** execute the original request through the current AI workflow and record the output.
- **Context-enriched run:** execute the same request through ECII and the new Context Engineering Layer.

The enhanced workflow must: (1) recognize that the holder integrates with an existing drill; (2) identify the host system as an
engineering dependency; (3) seek the drill's make and model; (4) investigate available mounting interfaces; (5) retrieve suitable
geometric references where available; (6) distinguish verified and hypothetical interfaces; (7) generate distinct mounting
architectures; (8) evaluate concepts against integration constraints; (9) preserve the context for subsequent requests; (10) make the
context and evidence inspectable in the interface.

The demonstration must not be considered successful merely because the generated text is longer or more detailed. Evaluate whether
the output is more relevant to the actual engineering problem.

## 11. Quantitative evaluation framework

Create a repeatable benchmark suite comparing raw-prompt generation with context-enriched generation. Suggested metrics:

| Metric | Evaluation objective |
| --- | --- |
| Intent recognition | Correctly identifies the engineering problem |
| Integration recognition | Detects relevant host-system relationships |
| Interface grounding | Uses supported interface information |
| Constraint coverage | Addresses applicable engineering constraints |
| Hallucinated specifications | Minimizes unsupported numerical claims |
| Architectural diversity | Generates genuinely distinct solutions |
| Traceability | Links decisions to evidence and requirements |
| Engineering plausibility | Produces technically credible proposals |
| Context reuse | Avoids rediscovery of established facts |
| Efficiency | Tracks tokens, latency and monetary cost |

Use controlled test fixtures for deterministic regression tests. Use blinded human engineering review where subjective quality must be
assessed. Record model versions, prompts, context revisions, outputs, and evaluation criteria so comparisons are reproducible. Do not
claim measured improvements until the benchmark demonstrates them.

## 12. Integration with AI orchestration and cost control

The Context Engineering Layer must work through the existing multi-provider AI gateway. Do not implement a separate provider
connection or billing mechanism. Track: context assembly cost; retrieval cost; model input tokens; model output tokens; evaluation
calls; refinement iterations; total cost per engineering task.

Where appropriate, use lower-cost models for classification, retrieval planning, and context summarization. Reserve higher-capability
models for difficult engineering reasoning and architecture generation. However, do not optimize solely for token cost at the expense
of engineering relevance. The preferred optimization objective is cost per acceptable engineering outcome.

## 13. Security and provenance

Treat retrieved documents, web content, product descriptions, and patent material as untrusted data. Do not permit external documents
to override system instructions or tool permissions. Preserve source provenance and licensing information. Respect project access
controls when assembling context. Prevent information from unrelated projects or customers from entering a context package without
authorization. Keep AI-generated conclusions distinguishable from authoritative source information.

## 14. Implementation priorities

**P0, required for the current prototype:** canonical context package contract; context assembly for Conceptualize; recognition of
host-product integration; relevant interface and constraint retrieval; explicit unknown and assumption handling; context injection
through the existing AI gateway; basic output evaluation; drill-bit holder regression tests; persistent context reuse across follow-up
requests.

**P1, cross-module integration:** context selectors for Requirements, SysML, and CAD; rich evidence retrieval; revision-aware
dependency analysis; context inspector in the assistant UI; automated evaluation and targeted refinement; provider-independent
benchmarking.

**P2, advanced intelligence:** learned context-ranking models; automated multimodal interface extraction; geometric reasoning across
CAD and images; engineering-specific evaluation models; adaptive orchestration based on task difficulty; reuse of validated engineering
knowledge across projects, subject to permissions.

Do not delay P0 to implement P2.

## 15. Required architecture review

Before implementation, the coordinating agent shall determine: (1) whether ECII already includes some of these capabilities; (2) which
existing services should own context assembly; (3) how the context package relates to the current project artifact model; (4) how
context reaches the AI gateway; (5) which module owns output evaluation; (6) how to avoid duplicating the Design Reasoning system;
(7) how the UI exposes context without cluttering the workspace; (8) how performance and cost will be measured; (9) how the
implementation fits the current integration roadmap. Update existing architecture documents, API contracts, agent instructions, and the
backlog accordingly. Do not create redundant services or schemas.

## 16. Acceptance criteria

This augmentation is complete when:

- Engineering AI calls can consume structured context packages.
- Context is assembled dynamically for the current task.
- Context references authoritative, revisioned project information.
- Important assumptions and unknowns are preserved.
- AI outputs can be evaluated against the context.
- Evaluation failures can trigger controlled refinement.
- Context is reused across subsequent requests.
- The user can inspect the engineering basis of AI-generated concepts.
- The drill-bit holder benchmark demonstrates improved relevance against a recorded baseline.
- Existing modules and end-to-end workflows remain functional.

## Final directive

ECII must become the engineering intelligence foundation of Faber, while the Context Engineering Layer becomes the mechanism by which
that intelligence improves AI behavior. The AI model provides general reasoning and generative capability. Faber provides the
engineering knowledge, system relationships, interfaces, constraints, evidence, verification tools, and persistent design history.
This separation is intentional. It allows the platform to improve its engineering capabilities without depending on a single AI model
or provider. Prioritize a working demonstration in which the AI develops meaningful host-specific mounting architectures for the
drill-bit holder, rather than simply generating variations of bit-hole patterns.

---

## Coordinator notes (16 October 2026)

- Related plans: [ECII plan](ecii-plan.md) (increment 1 running), [AI infrastructure plan](ai-infrastructure-plan.md) (increment A
  done; gateway is increment C), Design Reasoning ([design-reasoning-progress.md](design-reasoning-progress.md); runs, budgets,
  change impact and rationale in `packages/design-reasoning-core`), capability registry (ADR-0074), integration audit
  ([integration-audit-2026-10-16.md](../status/integration-audit-2026-10-16.md)).
- The §15 architecture review is run by an architect agent before implementation; its decisions amend the ECII and AI infrastructure
  plans rather than creating a separate service or schema.
- Owner's standing instruction: proceed automatically; owner-level questions are listed but do not block work.
