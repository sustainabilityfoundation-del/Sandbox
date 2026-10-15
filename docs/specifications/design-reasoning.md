# Architecture Task: Engineering Design Reasoning Layer

Owner brief, 14 October 2026 (verbatim). Coordinator governance and boundaries:
[design-reasoning-governance.md](design-reasoning-governance.md).

## Mission

Architect an AI-native Engineering Design Reasoning Layer for our multidisciplinary engineering platform.

This layer will allow AI agents and human engineers to understand, explore, evaluate, and evolve engineering designs at multiple levels of abstraction.

It must preserve not only what has been designed, but also:

- What the design is intended to achieve.
- Why particular solutions were selected.
- Which alternatives were considered.
- What assumptions and engineering principles underpin the design.
- How requirements, functions, concepts, and physical implementations relate.
- How engineering decisions should be reconsidered when constraints or evidence change.

The objective is to enable genuine engineering design-space exploration, rather than merely using AI to manipulate CAD, SysML, and requirements data.

Architectural principle: The platform must distinguish the engineering problem, the proposed solution, and the implemented design.

---

## 1. Agent delegation and governance

You are the existing coordinating architecture agent.

Spawn a dedicated Design Reasoning Architecture Agent to lead this work.

The agent shall:

1. Inspect the current repository and architecture documentation.
2. Review the existing Conceptualize, AI Interface, Requirements, SysML, CAD, and Analysis architectures.
3. Identify existing domain models, shared services, interfaces, and architectural constraints.
4. Propose a cohesive design reasoning architecture that extends the existing platform rather than duplicating its functionality.
5. Document architectural decisions and tradeoffs.
6. Define the implementation roadmap.
7. Build a limited architecture-validation prototype after the design has been reviewed.

The coordinating agent retains ownership of cross-module architecture, integration contracts, and approval of architectural decisions.

Use an isolated branch or worktree.

Do not begin a major implementation or refactor until the architecture has been documented and reviewed.

Do not merge into main without coordinating-agent approval.

## 2. Architectural separation

Design the platform around four cooperating capabilities.

### A. Conceptualize Module

Responsible for persistent conceptual engineering knowledge.

Owns:

- Functions and functional intent
- Solution concepts
- Concept alternatives
- Concept decomposition and relationships
- Design intent and rationale
- Concept maturity
- Design decisions and their supporting references
- Links between concepts and implementations

It must remain useful without an AI model being connected.

### B. Design Reasoning Engine

A separate reusable service responsible for engineering reasoning and design exploration.

Capabilities include:

- Retrieving relevant engineering context
- Generating and evaluating hypotheses
- Exploring alternative architectures
- Identifying engineering dependencies
- Evaluating assumptions and constraints
- Planning engineering investigations
- Orchestrating deterministic calculations and simulations
- Performing change impact analysis
- Proposing design modifications
- Explaining recommendations and their supporting evidence

The Reasoning Engine must not own the authoritative Concept, CAD, SysML, or Requirements data.

### C. AI Interface Module

The existing AI Interface provides the general platform-wide AI interaction and tool-control infrastructure.

The Design Reasoning Engine shall use this infrastructure rather than implement a competing AI interface.

Maintain clear separation between:

- AI interaction and model access
- Engineering reasoning orchestration
- Engineering knowledge persistence
- Discipline-specific engineering operations

### D. Engineering Modules

Requirements, SysML, CAD, Analysis, and future modules remain authoritative for their respective engineering artifacts.

All integration must occur through documented, versioned interfaces.

Do not introduce direct cross-module database dependencies.

## 3. Fundamental domain model

Define a typed, extensible domain model with the following first-class entities.

### Function

Represents what an engineering system must accomplish independently of how it is implemented.

Examples:

- Transmit mechanical power
- Convert rotational motion to linear motion
- Dissipate thermal energy
- Maintain structural stability
- Control fluid flow

Functions may have:

- Inputs and outputs
- Desired behaviors
- Performance objectives
- Constraints
- Interfaces
- Parent and child functions
- Relationships to requirements
- Relationships to solution concepts

### Concept

Represents a proposed solution, physical principle, mechanism, or architecture that may realize one or more functions.

Examples:

- Planetary gearbox
- Belt transmission
- Hydraulic actuator
- Heat exchanger
- Composite sandwich structure

A Concept may represent a component, assembly, subsystem, or complete system.

Concepts must not require formal engineering models or geometry to exist.

### ConceptImplementation

Represents the relationship between a Concept and its concrete engineering realization.

May reference:

- SysML elements
- CAD models
- Analysis models
- Mathematical models
- Manufacturing artifacts
- Verification records

Support many-to-many mappings between concepts and implementations.

### DesignDecision

Represents a documented engineering choice.

Must capture:

- Decision question
- Alternatives considered
- Selection and rationale
- Supporting evidence
- Assumptions
- Constraints
- Approval status
- Author and provenance
- Affected engineering artifacts
- Conditions that could invalidate the decision

### Assumption

A separately identifiable, traceable engineering assumption.

Assumptions must support validation status, scope, provenance, and dependencies.

### Evidence

A reference to engineering evidence, including calculations, simulations, tests, standards, and other authoritative sources.

Evidence must retain provenance, version, applicability, and validation status.

### Constraint

Represents an engineering limitation or condition.

Constraints may be qualitative, logical, mathematical, dimensional, or interface-related.

Do not duplicate authoritative Requirements records. Define how conceptual constraints relate to formal requirements.

### Alternative

Represents a candidate solution within a design exploration.

Alternatives may contain complete concept architectures rather than individual concepts.

Support branching, comparison, selection, rejection, and later reconsideration.

### DesignExploration

Represents a structured engineering investigation.

Contains:

- Design question
- Objectives
- Applicable constraints
- Candidate alternatives
- Evaluation criteria
- Engineering investigations
- Results
- Decisions
- Unresolved uncertainties

Distinguish the durable design knowledge from temporary AI execution state.

## 4. Knowledge representation

Design a hybrid engineering knowledge representation combining:

1. Strongly typed relational domain entities.
2. Typed semantic relationships.
3. Natural-language engineering explanations.
4. Mathematical expressions and constraints.
5. References to authoritative engineering artifacts.
6. Optional semantic embeddings for retrieval.

Use the existing relational database architecture as the initial authoritative store.

A dedicated graph database must not be introduced unless there is a demonstrated technical need.

Provide a graph-oriented query and traversal API independent of the underlying persistence technology.

Define relationship types including:

- Performs
- Realizes
- Decomposes into
- Depends on
- Constrains
- Interfaces with
- Alternative to
- Derived from
- Supported by
- Contradicted by
- Implemented by
- Verified by
- Selected through
- Invalidated by

Relationships must support provenance, versioning, and appropriate validation rules.

Avoid forcing all engineering knowledge into a rigid ontology.

Provide extension mechanisms for discipline-specific concepts and relationships.

## 5. Reasoning Engine architecture

Design the Reasoning Engine as an orchestrated, tool-using service.

Its architecture should include the following capabilities.

### Context Resolver

Given a design question, identify relevant:

- Functions
- Concepts
- Requirements
- Constraints
- Interfaces
- Decisions
- Assumptions
- Engineering models
- Analysis results
- Supporting evidence

Retrieve only the necessary project context.

Support graph traversal, structured filtering, and semantic retrieval.

Use version-aware references and record which information was used for each reasoning operation.

### Reasoning Planner

Translate engineering questions into structured investigation plans.

Examples:

- Identify alternative physical principles.
- Determine feasibility.
- Compare competing concepts.
- Investigate requirement changes.
- Identify engineering tradeoffs.
- Assess implementation impacts.

Plans must explicitly identify unknowns, assumptions, required tools, and expected evidence.

### Engineering Tool Orchestrator

Invoke existing module APIs and deterministic engineering tools.

Examples:

- Mathematical solvers
- Unit-aware calculations
- CAD operations
- SysML model queries
- Requirements traceability queries
- Simulation services
- Optimization algorithms

The LLM should interpret, plan, and explain.

Deterministic tools should perform numerical calculations and engineering evaluations wherever possible.

### Evidence Evaluator

Distinguish:

- Hypotheses
- Assumptions
- Qualitative assessments
- Preliminary estimates
- Calculated results
- Verified results
- Approved engineering decisions

Do not allow an AI assertion to become verified engineering evidence without an appropriate validation process.

### Change Impact Analyzer

Identify the potential consequences of changes to:

- Requirements
- Functions
- Concepts
- Interfaces
- Parameters
- CAD models
- Analysis results
- Assumptions

Traverse dependencies and identify affected engineering artifacts and decisions.

Distinguish possible impacts from demonstrated impacts.

### Proposal and Approval Service

Produce structured proposed changes rather than silently mutating authoritative engineering data.

Proposals must contain:

- Proposed action
- Engineering rationale
- Affected entities
- Expected effects
- Supporting evidence
- Assumptions
- Uncertainty
- Required approvals

Use the existing platform authorization and AI action infrastructure.

## 6. Mathematical reasoning architecture

Define how mathematical engineering knowledge is represented and evaluated.

Support:

- Typed physical quantities
- Units and dimensions
- Symbolic expressions
- Algebraic constraints
- Parameter relationships
- Calculation dependencies
- Optimization objectives
- Uncertainty and tolerance
- Model assumptions

Separate mathematical model definitions from execution results.

Ensure dimensional consistency and reproducibility.

The AI must be able to propose mathematical models, but their execution and validation must occur through appropriate computational services.

Do not build a new symbolic mathematics engine if an existing library can provide the required capabilities.

Research suitable open-source technologies and recommend an implementation compatible with the existing stack.

## 7. Conceptual-to-formal engineering transition

Define progressive formalization workflows.

Example:

Function:
Transmit mechanical power

Candidate Concept:
Planetary gearbox

Refined Concept:
Three-stage planetary gearbox

Formal Model:
SysML structure and behavior

Physical Implementation:
CAD assembly

Engineering Evaluation:
Torque, efficiency, mass, thermal and structural analyses

Verification:
Requirements verification evidence

The transition must not require a linear workflow.

Concepts and implementations may evolve concurrently.

Changes to the physical implementation must not silently rewrite the original design intent.

Define explicit synchronization, conflict resolution, traceability, and impact analysis behavior.

## 8. Design-space exploration

Architect support for iterative engineering exploration.

A user should eventually be able to request:

"Explore alternative architectures that reduce the mass of this assembly by 20% while preserving its required stiffness and load capacity."

The system should be able to:

1. Retrieve the original functional intent.
2. Identify the applicable constraints.
3. Identify which design characteristics are fixed and which may vary.
4. Generate alternative solution concepts.
5. Build structured exploration branches.
6. Generate preliminary models.
7. Invoke appropriate engineering evaluations.
8. Compare results against objectives.
9. Identify infeasible alternatives.
10. Recommend promising alternatives.
11. Preserve the reasoning and evidence.
12. Propose changes for human review.

Design the architecture to support parallel exploration agents in the future.

Provide resource budgets, cancellation, checkpointing, and reproducibility mechanisms for long-running investigations.

Do not implement unrestricted autonomous modification of approved engineering baselines.

## 9. Persistent engineering reasoning

Do not treat the LLM conversation history as the authoritative engineering knowledge base.

Persist engineering knowledge as structured, independently queryable entities.

Store reasoning outcomes including:

- Hypotheses
- Alternatives
- Assumptions
- Engineering conclusions
- Decision rationale
- Evidence references
- Unresolved questions
- Rejected solutions
- Identified risks

Keep ephemeral LLM execution traces separate from durable engineering knowledge.

Do not require storage of private model chain-of-thought.

Instead, preserve concise, explicit engineering justifications, tool inputs, calculations, and evidence that can be independently reviewed.

Provide mechanisms for updating or invalidating conclusions when underlying information changes.

## 10. AI and agent integration

Use the existing AI Interface architecture.

Define typed tools for operations such as:

- create_function
- create_concept
- decompose_function
- propose_solution_concepts
- create_design_exploration
- compare_alternatives
- retrieve_design_context
- evaluate_constraint
- execute_engineering_analysis
- assess_change_impact
- propose_design_change
- record_design_decision
- retrieve_design_rationale

These are illustrative operations; refine them during architecture design.

All tools must expose documented input/output schemas.

Support authorization, validation, auditing, idempotency where appropriate, and error handling.

Design for model-provider independence.

The architecture must not depend on Claude-specific model behavior or prompt formats.

## 11. UI integration

Define the user experience for interacting with the reasoning layer.

The Conceptualize UI should provide:

- Function and Concept exploration
- Alternative solution trees
- Concept relationships
- Design intent and assumptions
- Design decision history
- Engineering evidence
- Trade-study comparisons
- Concept-to-implementation traceability

The existing AI Interface should provide conversational interaction and execution of reasoning workflows.

Provide an explainable view of the AI's proposed actions and supporting evidence.

The user should be able to ask:

"Why was this design selected?"

"What alternatives were rejected?"

"What would happen if this requirement changed?"

"Which assumptions support this architecture?"

"Find a completely different way to perform this function."

Define the API interactions and UI components needed to answer these questions.

Do not duplicate the existing module navigation or AI chat architecture.

## 12. Research and architectural benchmarking

Research established engineering and systems design approaches relevant to the architecture.

Include:

- Function–behavior–structure modeling
- Function–means modeling
- Axiomatic design
- Design Structure Matrices
- Model-Based Systems Engineering
- SysML v2
- Engineering design rationale and decision records
- Knowledge-based engineering
- Constraint-based design
- Multidisciplinary design optimization
- Ontology-based engineering knowledge representation

Use authoritative technical publications, textbooks, and standards where available.

Identify which ideas are useful and which would introduce unnecessary complexity.

Do not attempt to implement every methodology.

The objective is a practical, extensible engineering reasoning architecture.

## 13. Architecture deliverables

Produce the following architecture documentation using repository conventions:

A. Architecture overview — Responsibilities, boundaries, major services, and data flows.

B. Domain model — Entities, relationships, invariants, lifecycle semantics, and ownership.

C. Knowledge representation — Relational schema, graph traversal, semantic retrieval, and extension strategy.

D. Reasoning orchestration — Context retrieval, planning, tool execution, evidence evaluation, and proposal generation.

E. Integration architecture — APIs, domain events, contracts, and data ownership across modules.

F. Mathematical model architecture — Expression representation, units, solvers, validation, and evidence.

G. Design exploration architecture — Branching, alternatives, trade studies, iterative evaluation, and convergence criteria.

H. Security and governance — Authorization, provenance, auditability, approval workflows, and model independence.

I. Architecture decision records — Document important tradeoffs and alternatives.

J. Phased implementation roadmap — Dependencies, milestones, acceptance criteria, and risks.

Include Mermaid architecture and sequence diagrams where useful.

Update root architecture indexes and agent instructions so future module agents understand the reasoning layer.

## 14. Architecture validation prototype

After the architecture is reviewed, implement a limited proof of concept.

Use a mechanical actuator as the demonstration problem.

The prototype shall demonstrate:

1. Define a functional objective independently of a solution.
2. Generate several candidate solution concepts.
3. Represent functions and concepts as separate entities.
4. Link alternatives to the same functional objective.
5. Record assumptions and constraints.
6. Evaluate one preliminary mathematical relationship through a deterministic tool.
7. Compare candidate solutions using explicit criteria.
8. Record a design decision with supporting evidence.
9. Link a selected concept to a mock or existing CAD/SysML artifact.
10. Demonstrate that changing a constraint identifies potentially affected decisions and implementations.

The demonstration must use the proposed architecture and APIs rather than hardcoded UI-only behavior.

Use real module integrations where available and clearly identified contract test adapters otherwise.

Include automated tests for domain invariants, traceability, and change impact analysis.

## 15. Implementation roadmap

Organize subsequent implementation into three phases.

Phase 1 — Persistent engineering knowledge

- Function and Concept domain model
- Typed relationships
- Alternatives and decisions
- Evidence and assumptions
- Cross-module references
- Basic Conceptualize UI

Phase 2 — Tool-assisted reasoning

- Context Resolver
- Reasoning Planner
- Mathematical tool orchestration
- Engineering evidence evaluation
- Change impact analysis
- AI-generated proposals

Phase 3 — AI-driven design exploration

- Automated alternative generation
- Iterative analysis
- Multiobjective optimization
- Parallel exploration agents
- Design-space learning
- Supervised engineering optimization

The architecture must anticipate all three phases, but avoid unnecessary infrastructure in Phase 1.

## 16. Execution instructions

Begin by inspecting the repository.

Report:

- Existing architecture relevant to this task
- Proposed module and service boundaries
- Major architectural decisions
- Conflicts with existing designs
- Recommended domain model
- Proposed documentation locations
- Implementation milestones

Then produce the architecture documentation and decision records.

The coordinating agent must review and approve the architecture before major implementation begins.

After approval, build the limited architecture-validation prototype.

Do not replace existing module implementations, introduce unnecessary dependencies, or restructure the repository without a documented justification.

Commit architecture documents and approved prototype code to the dedicated feature branch.

Do not merge into main until integration review is complete.

Ultimate design objective:

Create an engineering platform that understands the functional intent behind a design, explores multiple possible realizations, uses formal engineering tools to evaluate them, and preserves the knowledge and rationale generated throughout the design process.

The system must enable AI to reason about engineering solutions without forcing premature commitment to a specific geometry, architecture, or implementation.
