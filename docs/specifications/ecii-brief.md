# Engineering Context Discovery & Interface Intelligence (ECII): owner brief

Status: **owner brief, 16 October 2026; authoritative input for the ECII work.** The text below is the owner's brief as issued
(formatting normalised). Coordinator notes at the end map it onto the repository; they do not change it.

## Mission

Architect and implement a new cross-platform capability called Engineering Context & Interface Intelligence (ECII) within Faber,
our AI-native multidisciplinary engineering platform.

The purpose of ECII is to enable Faber to behave more like an experienced systems engineer: understanding the complete engineering
problem, investigating relevant external systems, discovering physical and functional interfaces, identifying missing information,
and establishing a defensible basis for conceptual design.

This capability must integrate with the existing Conceptualize, Requirements Management, SysML, CAD, Project Management, AI
Orchestration, and Design Reasoning systems.

The fundamental requirement is that Faber must not generate detailed engineering solutions solely from the nouns in a user prompt.
It must understand the engineering problem, its context, and the interfaces that constrain the solution.

The immediate demonstration is our existing drill-bit holder example, but the architecture must be completely domain-independent.

## 1. Agent organization

You are the coordinating architecture agent. Spawn a dedicated subagent: **Engineering Context & Interface Intelligence Architect**.
The agent shall own the architecture and initial implementation of ECII.

Before making changes:

1. Read `AGENTS.md`, relevant architecture documentation, and existing agent instructions.
2. Inspect the current Conceptualize, Requirements, SysML, CAD, AI gateway, and project artifact implementations.
3. Identify existing data structures and services that can be reused.
4. Review the current end-to-end engineering demonstration and determine why the drill-bit holder concepts failed to recognize the
   intended host-product integration.
5. Document the gaps before proposing changes.

Do not create parallel implementations of existing capabilities. Coordinate interface changes with the responsible module agents.
The main coordinating agent retains responsibility for architectural consistency. Use an independent branch and pull request. Do not
push directly to main.

## 2. Engineering intent interpretation

Introduce a structured process for interpreting the engineering intent behind a user's request. The AI shall determine:

- What is the engineering objective?
- What product, component, assembly, or system is being designed?
- What problem is the design intended to solve?
- Is the design standalone or intended to integrate with an existing system?
- What existing products or systems are involved?
- What functional relationships exist between them?
- What environmental and operational conditions apply?
- What information must be discovered before meaningful design alternatives can be proposed?
- What assumptions are being made?
- What questions, if any, must be answered by the user?

For example, user request: "Design a drill-bit holder for my cordless drill." Expected interpretation:

- Design object: drill-bit holder.
- Object type: accessory.
- Host system: existing cordless drill.
- Integration relationship: accessory mounts to host.
- Primary functional objective: retain and provide convenient access to drill bits.
- Secondary objective: preserve normal operation of the host tool.
- Required investigation: identify host model, mounting features, geometry, clearances, loads, and operational restrictions.

The AI must recognize that designing a drill-mounted accessory is fundamentally different from designing a standalone drill-bit
storage block. Do not implement this as a collection of product-specific keyword rules. Use structured semantic reasoning with
explicit, inspectable outputs.

## 3. Engineering context graph

Develop a structured representation of the engineering problem and its surrounding context. The graph should support entities such
as: project; engineering problem; design objective; concept; product; host system; subsystem; component; external system;
interface; function; requirement; constraint; operating environment; reference document; reference image; geometry; assumption;
unknown; evidence; verification activity.

Relationships should include: integrates with; mounts to; connects to; constrains; performs function; depends on; interferes with;
is part of; is supported by; is derived from; requires verification.

The context graph shall integrate with the existing unified project information architecture. Do not introduce an independent
database unless there is a compelling technical justification. Support typed entities, stable identifiers, versioning, provenance,
and bidirectional traceability.

## 4. Autonomous engineering investigation

Implement an Engineering Context Discovery workflow that can research external products, systems, interfaces, and relevant prior
art. The system should investigate appropriate sources including: manufacturer websites; product manuals; installation guides;
technical specifications; interface-control documents; manufacturer CAD files; exploded parts diagrams; technical drawings; product
photographs; patent databases; public engineering repositories; existing project documentation; user-provided images, drawings, and
models.

Prefer authoritative primary sources. Use the existing AI tool-execution and provider infrastructure for search and document
retrieval. The research process must be auditable. Every retrieved reference shall retain its source, retrieval date, relevant
identifiers, and relationship to the engineering problem. Respect source licensing, copyright, access permissions, and applicable
usage restrictions. Do not assume that publicly visible content can be freely redistributed or used for model training.

### Research planning

The agent shall first construct a research plan based on the information required to understand the problem. It should distinguish:
(1) information essential before proceeding; (2) information useful for concept generation; (3) information that can be resolved
during detailed engineering; (4) information unlikely to materially affect the design. Avoid unnecessary research that adds latency
without improving the design. Support configurable research depth and budgets.

## 5. Interface discovery and definition

Introduce a first-class Engineering Interface Definition artifact. An interface represents a relationship between two engineering
entities and may be: mechanical; geometric; structural; electrical; electronic; software; data; fluid; thermal; human-machine;
environmental; operational.

An interface definition shall support: participating entities; interface type; functional purpose; geometric features; coordinate
systems; reference datums; dimensions; tolerances; clearances; loads and reactions; connection methods; environmental constraints;
operational constraints; verification requirements; supporting evidence; confidence and verification status.

For mechanical interfaces, support features such as mounting holes, bosses, rails, slots, threads, mating surfaces, alignment
features, and keep-out volumes. Where possible, represent geometry in a form that can eventually be consumed by the CAD module.
Interface definitions must be independent of the module in which they were discovered. An interface discovered during Conceptualize
should be reusable in Requirements, SysML, CAD, and verification.

## 6. Evidence, confidence, and uncertainty

Introduce a rigorous evidence model. Every important engineering fact must distinguish between:

- **Verified:** confirmed by appropriate authoritative evidence or measurement.
- **Documented:** explicitly stated in an identified source but not independently verified.
- **Derived:** calculated or inferred from documented information.
- **Estimated:** approximate value supported by limited evidence.
- **Assumed:** provisional design assumption.
- **Unknown:** information not yet established.
- **Conflicting:** sources disagree or evidence is inconsistent.

Do not treat a model's confidence score as proof of engineering correctness. Record evidence separately from the AI's interpretation
of that evidence. For dimensional information, retain units, tolerances where available, reference datums, and the method used to
obtain the value. Never silently convert an estimated or assumed dimension into a verified dimension. Where conflicting information
exists, retain the conflict and identify the resolution required.

## 7. Reference imagery and spatial context

The discovery workflow shall actively seek useful geometric and visual references for existing products. For a physical host
product, attempt to obtain: front view; side view; rear view where relevant; isometric or three-quarter view; detail views of
candidate interfaces; dimensional drawings or CAD models where available.

Associate all references with the correct product, model, and revision. Do not substitute photographs of a visually similar product
and imply they represent the actual host. If authoritative views are unavailable, mark the missing information explicitly.

Develop an extensible architecture for future image analysis, feature identification, annotation, approximate geometric
reconstruction, and CAD alignment. The initial implementation may rely on manual confirmation of candidate mounting features.

## 8. Context readiness and design maturity

Introduce an Engineering Context Readiness Gate before detailed concept generation. The gate shall evaluate whether the available
information is sufficient for the intended design activity. Support at least three states:

- **Exploratory:** the problem is understood at a high level, but important interfaces or constraints remain unknown. Permit
  provisional concepts with explicit assumptions.
- **Context Established:** the relevant host systems, functional relationships, and candidate interfaces are sufficiently understood
  to propose meaningful solution architectures. Permit host-specific concept development.
- **Interfaces Verified:** critical interface information is verified to the level required for detailed engineering. Permit
  dimensioned, CAD-ready development, subject to other engineering checks.

Readiness must be evaluated against the intended downstream activity, not a single global completeness percentage. Avoid
unnecessarily blocking creative exploration. However, prevent the AI from presenting speculative concepts as validated engineering
solutions.

## 9. Intelligent clarification policy

The AI should investigate autonomously before asking the user for information that may already be available. Ask clarifying
questions when missing information materially changes the design or prevents useful progress. Questions should be: targeted;
minimal; technically relevant; prioritized by impact; accompanied by a clear explanation of why the information matters.

Example: "Which make and model of cordless drill are you using? I can explore generic mounting concepts, but the exact model is
needed to identify usable attachment features and mounting dimensions."

Where appropriate, allow the user to choose between: continue with generic exploratory concepts; identify the host product; upload
photographs or CAD geometry; supply measurements. The AI shall not fabricate interface specifications merely to avoid asking a
question.

## 10. Architecture-first concept generation

Modify the Conceptualize workflow so that the AI explores distinct solution architectures before variations within an architecture.
For an accessory mounted to a cordless drill, possible architectures might include: reusing an existing accessory mounting fastener;
clamping around a suitable housing feature; attaching to an existing rail or slot; integrating with a removable accessory bracket;
using a custom replacement housing component. These are hypothetical alternatives, not claims that the features exist on a
particular drill.

Each architecture shall identify: intended host interface; attachment principle; required interface geometry; load path;
installation and removal method; expected advantages; principal disadvantages; technical risks; unverified assumptions; evidence
required to proceed.

Only after defining the architecture should the system explore parameters such as bit-hole number, spacing, orientation, material,
and local shape. Introduce a diversity assessment to prevent minor dimensional or cosmetic variations from being presented as
fundamentally different concepts.

## 11. Integration with Design Reasoning

Connect ECII to the existing Design Reasoning layer. The reasoning system should preserve: why a particular host interface was
selected; which alternatives were considered; which constraints influenced the decision; what evidence supports the decision; what
assumptions remain; why an alternative was rejected; what new information would cause reconsideration.

Research findings and interface discoveries should be reusable across subsequent design iterations. The system should not repeatedly
rediscover information already established in the project. When a key assumption changes, identify affected concepts, requirements,
models, and decisions.

## 12. Integration with other modules

- **Conceptualize:** consume engineering context and interface definitions before generating detailed concepts. Preserve
  relationships between each concept and the interfaces it depends upon.
- **Requirements Management:** derive candidate interface and integration requirements. Do not automatically promote AI-generated
  requirements to approved requirements. Support traceability to the source engineering problem and supporting evidence.
- **SysML:** map appropriate entities and relationships to the project's SysML architecture. Support interface blocks, ports,
  connections, and relevant requirements relationships as appropriate to the implemented SysML version. Do not create a competing
  systems-modeling representation.
- **CAD:** expose verified geometry, coordinate systems, interface features, and keep-out volumes through documented APIs. Allow
  conceptual geometry to remain approximate until verified.
- **AI Orchestration:** provide tools for context discovery, research, evidence retrieval, interface analysis, and readiness
  assessment. Permit multiple AI models to collaborate where useful, while avoiding unnecessary calls.
- **Project Management:** track unresolved interface information, research tasks, verification activities, and external
  dependencies as project artifacts.

## 13. AI tool contracts

Define explicit machine-readable tools, with schemas and permission boundaries, for operations such as: `interpret_engineering_intent`;
`discover_external_systems`; `create_research_plan`; `search_engineering_sources`; `retrieve_reference_document`;
`extract_interface_candidates`; `create_interface_definition`; `assess_evidence`; `identify_information_gaps`;
`evaluate_context_readiness`; `generate_solution_architectures`; `evaluate_architecture_diversity`; `request_user_clarification`.

These names are illustrative; align them with existing project conventions. Tools shall return structured results, not only
free-form narrative text. Use idempotent operations where appropriate and retain an auditable execution history. The AI must not have
unrestricted direct database mutation access.

## 14. User interface

Integrate ECII into the existing focused-canvas interface. Provide a compact Engineering Context workspace or panel showing:
identified host systems; context graph or relationship summary; reference imagery; relevant documents; candidate interfaces; verified
information; assumptions and unknowns; research activity; context readiness; questions requiring user input.

The user should be able to inspect and correct the AI's understanding. Allow the user to confirm or reject proposed relationships and
interface features. Provide clear visual distinction between verified information and assumptions. Follow the established interface
design principles: dense, professional, consistent, and unobtrusive. Show planned but unimplemented functions as disabled controls
with informative tooltips.

## 15. Engineering standards and reference practices

Research publicly accessible guidance from relevant sources, including: NASA Systems Engineering Handbook; NASA interface management
guidance; INCOSE systems engineering practices; ISO/IEC/IEEE 15288; ISO/IEC/IEEE 29148; relevant SysML interface modeling practices.
Use these sources to inform the architecture, especially interface management, requirements traceability, configuration control,
and verification. Do not reproduce proprietary standards content without authorization. The initial architecture must remain
suitable for later integration with aerospace and other safety-critical development assurance frameworks. Do not implement a complete
standards-compliance system as part of this task.

## 16. Prototype regression test: drill-bit holder

Use the existing drill-bit holder example as the primary regression test.

**Test A: host integration.** Input: "Design a drill-bit holder that attaches to my cordless drill." Expected behavior:
(1) recognize an accessory-to-host relationship; (2) identify that the drill model is not yet specified; (3) determine that the host
geometry is relevant; (4) attempt appropriate research using available information; (5) ask for the drill model if needed;
(6) identify potential mounting architectures; (7) explain which require host-specific verification; (8) avoid generating only
different drill-bit hole patterns.

**Test B: identified host.** Provide a specific cordless drill model and a controlled fixture containing manufacturer documentation
and reference images. Expected behavior: (1) identify the correct host product; (2) retrieve relevant references; (3) present front,
side, and isometric views where available; (4) identify documented mounting features; (5) record supporting evidence; (6) produce
at least three meaningfully distinct mounting concepts where technically plausible; (7) clearly distinguish verified features from
speculative options; (8) link each concept to its proposed host interface.

**Test C: missing dimensions.** Provide product images but no authoritative mounting dimensions. Expected behavior: recognize
candidate attachment features; mark dimensions as unknown or estimated; request measurements or geometry when needed; avoid
inventing exact hole positions or spacings; permit exploratory concepts with explicit assumptions.

**Test D: standalone product.** Input: "Design a freestanding drill-bit organizer for my workbench." Expected behavior: recognize
that no drill-mounted interface is required; avoid unnecessary host-product research; develop appropriate standalone concepts.

**Test E: generalization.** Repeat the workflow using at least two unrelated engineering integration problems, such as a sensor
bracket mounted to an existing industrial machine, or a cooling accessory integrated into an electronic enclosure. The architecture
must demonstrate that its behavior is not specific to drills.

## 17. Implementation strategy

**Phase 1: architecture and immediate prototype.** Implement: structured engineering intent interpretation; integration relationship
detection; context artifact schema; basic interface definition schema; evidence and uncertainty tracking; research planning; user
clarification workflow; context readiness assessment; architecture-first concept generation; drill-bit holder regression tests.
Reuse existing search, file, AI, and artifact services wherever possible.

**Phase 2: rich discovery.** Automated reference retrieval; document and drawing analysis; reference-image management; interface
feature extraction; improved evidence reconciliation; context graph visualization; cross-module interface propagation.

**Phase 3: advanced engineering intelligence.** Architect for future capabilities including: geometry extraction from engineering
drawings; automated CAD interface reconstruction; visual identification of mounting features; multi-view geometry consistency;
assembly and interference reasoning; retrieval from engineering knowledge bases; reusable interface libraries; design change impact
analysis. Do not allow Phase 3 ambitions to delay the immediate end-to-end demonstration.

## 18. Documentation and deliverables

Produce or update architecture documents covering: (1) Engineering Context & Interface Intelligence architecture; (2) context graph
and entity schema; (3) interface definition data model; (4) evidence and provenance model; (5) research workflow; (6) context
readiness framework; (7) concept generation integration; (8) cross-module API contracts; (9) UI interaction specification; (10) test
strategy and regression fixtures; (11) implementation roadmap and deferred backlog.

Use existing project documentation conventions and locations. Create Architecture Decision Records for major new architectural
choices. Do not create redundant documentation if existing architecture files can be extended cleanly.

## 19. Acceptance criteria

The implementation is acceptable when:

- The AI correctly recognizes whether a proposed product integrates with another system.
- It identifies external systems and the interfaces relevant to the design.
- It can research appropriate technical references through available tools.
- It records evidence and clearly identifies unknown information.
- It does not invent precise mounting dimensions.
- It asks useful questions when essential information is unavailable.
- It generates distinct integration architectures before dimensional variations.
- It retains context and interface information as reusable project artifacts.
- It integrates with the existing Conceptualize and Design Reasoning systems.
- It supports future Requirements, SysML, and CAD integration.
- The drill-bit holder regression tests pass.
- The architecture generalizes to unrelated engineering domains.
- Existing end-to-end prototype functionality remains operational.

## 20. Execution instructions

Begin by reviewing the repository and reporting: (1) the current architecture and relevant components; (2) the root cause of the
existing drill-bit holder behavior; (3) the proposed ECII architecture; (4) existing infrastructure that can be reused; (5) required
schema and API changes; (6) agent ownership and coordination; (7) the smallest implementation capable of demonstrating improved
engineering reasoning; (8) risks and dependencies.

Then implement the approved architecture incrementally, using focused commits and tests. Do not wait for an unnecessarily elaborate
platform before improving the drill-bit holder demonstration. Preserve the existing primary project objective: demonstrate an
AI-driven engineering workflow from initial problem definition through conceptualization, requirements, systems modeling, and CAD
output.

**Final architectural directive.** Faber shall treat engineering conceptualization as an evidence-informed process of understanding
problems, identifying systems and interfaces, exploring solution architectures, and progressively developing validated designs. The
AI must be able to recognize when a new design depends on an existing product, investigate that product, discover its interfaces,
and use the resulting engineering context to generate relevant concepts. The goal is not simply to make the AI more creative. It is
to make its creativity technically relevant to the actual engineering problem.

---

## Coordinator notes (16 October 2026)

- **Branching.** The owner withdrew the general "do not push to main" rule earlier the same day; this brief repeats it. Until the
  owner says otherwise, ECII work runs on its own branch and merges to main after review and a green integration run, like other
  work; a pull request is opened by the owner if wanted (no GitHub CLI here).
- **Reuse first.** Conceptualize already holds concepts, typed statements (intent, assumptions, questions with basis and
  provenance), functions, design constraints, assumptions with validation history, evidence, decisions and visual definitions
  ([conceptualize-contracts.md](conceptualize-contracts.md)); the Design Reasoning layer
  ([design-reasoning-progress.md](design-reasoning-progress.md), ADR-0039 to 0046, held) holds knowledge, calculations and change
  impact; Project Management holds the artifact registry, documents and blobs (ADR-0060 to 0068). The context graph and interface
  definitions extend these; no independent database without a recorded justification.
- **Rules that still apply.** Open-source first (evaluation template for new libraries), capability-complete toolbars (every new
  ECII command registered, planned ones shown muted), ADR-0070 development-assurance boundaries (no standard-specific gates in
  generic modules), the proposal-preview policy for AI writes, and the owner rule that automated runs never use the owner's AI
  account. Web research by the product at run time goes through the AI infrastructure gateway and its metering once available.
