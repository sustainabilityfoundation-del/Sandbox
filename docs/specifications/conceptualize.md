# Conceptualize Module — Implementation Brief

Owner brief, 14 October 2026 (verbatim). Agreed contracts: [conceptualize-contracts.md](conceptualize-contracts.md).
Progress: [conceptualize-progress.md](conceptualize-progress.md).

## Mission

Create a new standalone engineering software module named Conceptualize within the existing multidisciplinary engineering platform.

Conceptualize is an AI-native conceptual engineering environment for creating, exploring, refining, comparing, and evolving engineering ideas before and during their realization as concrete engineering designs.

The fundamental unit of information is a Concept.

A Concept is a persistent, abstract representation of an engineering idea, solution, function, architecture, component, assembly, subsystem, or complete system.

A Concept must not require a CAD model, SysML model, or any other formal engineering artifact to exist.

As a Concept matures, the platform's other engineering modules progressively generate and maintain its concrete implementation.

Core principle: Preserve the distinction between what an engineering solution is intended to achieve and how it is ultimately implemented.

## 1. Agent organization

You are the coordinating architecture agent.

Spawn a dedicated Conceptualize Development Agent responsible for designing and implementing this module.

The new agent must:

- Operate independently within a clearly defined module boundary.
- Review the existing repository architecture and engineering principles before implementation.
- Follow established language, framework, API, database, documentation, and UI conventions.
- Coordinate shared interfaces with the Requirements, SysML, CAD, Analysis, and AI Interface modules.
- Avoid modifying unrelated modules except through approved interface changes.
- Work in an isolated branch or worktree.
- Maintain its own implementation plan and feature backlog.
- Produce automated tests and architecture documentation.
- Submit its implementation for integration review.

The coordinating agent retains responsibility for cross-module consistency, architectural decisions, integration testing, and merging.

Determine whether the module should occupy a separate repository or package based on the existing modularization strategy. It must remain independently buildable, testable, and deployable.

## 2. Fundamental Concept object

Design a strongly typed, extensible, persistent Concept domain model.

Every Concept shall support:

### Identity

- Globally unique identifier
- Human-readable name and description
- Version and revision history
- Ownership, authorship, and provenance
- Creation and modification timestamps
- Lifecycle and maturity status

### Abstraction

- Arbitrary abstraction level
- Component, assembly, subsystem, system, or abstract function classification
- User-defined classifications
- Freeform natural-language descriptions
- Structured attributes when appropriate
- Relationships with other concepts

The classification must not restrict what the Concept can eventually become.

### Design intent

- Purpose and intended functionality
- Problems being solved
- Desired behaviors and capabilities
- Assumptions
- Constraints
- Engineering rationale
- Known uncertainties
- Open questions
- Expected performance characteristics
- Links to applicable requirements

### Concept relationships

Support typed relationships including:

- Contains / part of
- Depends on
- Interfaces with
- Alternative to
- Derived from
- Refines
- Implements
- Conflicts with
- Replaces

Allow many-to-many relationships and relationships between different abstraction levels.

Validate relationship semantics and prevent invalid containment cycles.

## 3. Separation of concept and implementation

This is the most important architectural requirement.

A Concept must remain independent of any particular implementation.

For example:

Concept: "Provide controlled mechanical power transmission"

Possible implementations:

- Gear train
- Belt drive
- Chain drive
- Direct-drive motor

All implementations may satisfy the same underlying Concept.

A Concept can have zero, one, or many candidate implementations.

An implementation may contain references to:

- Requirements records
- SysML elements
- CAD parts and assemblies
- Mathematical models
- Simulation and analysis artifacts
- Engineering calculations
- Verification evidence
- Manufacturing information

An implementation may also realize multiple Concepts.

Create a separate ConceptImplementation domain entity linking abstract Concepts to concrete engineering artifacts.

Never make a CAD file, SysML object, or other discipline-specific artifact the primary identity of a Concept.

Preserve stable Concept identities when implementations are replaced or redesigned.

Use explicit, version-aware links to artifacts in other modules rather than duplicating their authoritative data.

## 4. Concept decomposition and composition

Concepts must support hierarchical and network-based decomposition.

For example:

Aircraft propulsion system

- Energy storage
- Power conversion
- Thrust generation
- Thermal management
- Control and monitoring

Each child is independently a Concept and may be elaborated into additional concepts.

Support:

- Top-down functional decomposition
- Bottom-up composition
- Multiple levels of abstraction
- Shared concepts referenced by multiple parents
- Alternative decomposition structures
- Cross-system dependencies
- Interface definitions between concepts

Do not assume that a conceptual hierarchy must correspond directly to the eventual CAD assembly hierarchy or SysML containment hierarchy.

Concept decomposition and physical implementation structure may differ.

## 5. Concept exploration and alternative generation

Implement a structured concept exploration capability.

Users and AI agents must be able to:

1. Create an initial idea using natural language.
2. Elaborate the idea through discussion.
3. Identify missing information and assumptions.
4. Generate multiple solution alternatives.
5. Decompose alternatives into functional elements.
6. Compare candidate solutions.
7. Perform preliminary feasibility assessments.
8. Select promising candidates for further development.
9. Retain rejected alternatives and their rationale.
10. Revisit previous alternatives when constraints change.

Support branching concept development.

A single parent Concept may have multiple alternative solution architectures.

Alternative branches must not overwrite each other.

Maintain explicit design-decision records describing why an alternative was accepted, rejected, or deferred.

Provide extensible multicriteria trade-study functionality covering performance, mass, cost, complexity, manufacturability, risk, and user-defined criteria.

Allow uncertainty ranges, qualitative assessments, and incomplete information.

Do not present AI-generated engineering estimates as verified facts.

## 6. AI-native conceptual reasoning

Integrate Conceptualize with the platform's existing AI Interface architecture.

The AI must be able to discover, read, create, modify, compare, and navigate Concepts through typed APIs.

AI interaction must support both freeform exploration and structured engineering operations.

Example user instruction:

"Develop three alternative concepts for a compact mechanical actuator capable of delivering 500 N of linear force within a 100 mm envelope."

The AI should be able to:

- Interpret the design objective.
- Create a parent Concept.
- Identify important engineering constraints.
- Propose alternative solutions.
- Explain underlying operating principles.
- Create concept hierarchies.
- Identify interfaces and dependencies.
- Generate preliminary mathematical models.
- Compare advantages and disadvantages.
- Recommend further engineering investigations.
- Request creation of formal artifacts in other modules.

### Abstract reasoning representation

Provide a structured semantic representation of design intent that the AI can query and manipulate.

This representation should accommodate:

- Functions
- Behaviors
- Physical principles
- Intended effects
- Inputs and outputs
- Constraints
- Interfaces
- Assumptions
- Relationships
- Candidate solution mechanisms

Do not attempt to represent every possible engineering idea using a rigid predefined taxonomy.

Use a hybrid model combining structured domain entities, extensible semantic relationships, and unstructured explanatory content.

If embeddings or semantic search are introduced, treat them as retrieval mechanisms rather than authoritative engineering records.

Every AI-generated mutation must use validated module APIs, with authorization, provenance, and auditable change history.

Use approval gates for consequential changes to established engineering baselines.

## 7. Integration with engineering modules

Implement bidirectional integration through documented, versioned APIs and domain events.

### Requirements Management

A Concept can satisfy, derive, refine, or propose requirements.

The AI should identify missing requirements and potential conflicts.

Requirements remain authoritative in the Requirements module.

Conceptualize may propose new requirements but must not silently establish approved requirements.

### SysML Modeling

Conceptual architectures may be progressively formalized into SysML structures.

Support mappings between Concepts and relevant SysML model elements, including parts, actions, ports, interfaces, and relationships as appropriate to the platform's supported SysML version.

Conceptualize must not force early commitment to a SysML structure.

Changes to the SysML implementation should be traceable back to the originating Concepts.

### CAD

A Concept may eventually be realized by one or more CAD parts or assemblies.

Support links between Concepts and CAD artifacts.

The AI should be able to initiate CAD generation through the existing CAD module's supported API.

Conceptualize must not implement its own production CAD kernel.

A Concept can remain valid even when its CAD implementation is deleted or replaced.

### Analysis and Simulation

Concepts may have associated analytical models, preliminary calculations, simulations, and feasibility studies.

Results should inform concept evaluation and refinement.

Distinguish preliminary estimates from validated analytical results.

Preserve assumptions, input parameters, units, model revisions, and evidence provenance.

### Cross-module synchronization

Define explicit synchronization rules.

Changes in a concrete implementation must not automatically overwrite the original conceptual design intent.

Instead, identify relevant changes and produce impact notifications, suggested updates, or user-approved synchronization operations.

Support stale-link detection, broken-reference handling, and cross-module change impact analysis.

## 8. Progressive formalization

Implement a mechanism allowing Concepts to mature progressively.

Suggested lifecycle:

1. Idea
2. Exploring
3. Defined
4. Evaluated
5. Selected
6. Engineering development
7. Implemented
8. Verified
9. Superseded or archived

Do not make this a mandatory linear sequence.

Concepts may be revised, branched, reopened, or developed concurrently.

Track maturity separately from implementation status and verification status.

A Concept may be well-defined but not implemented, or implemented experimentally without being fully evaluated.

Provide maturity assessments based on available evidence, unresolved uncertainties, and engineering completeness.

## 9. User interface

Create a Conceptualize module accessible through the existing platform navigation.

Follow existing React, styling, component, and application conventions.

The module should provide:

### Concept Explorer

- Searchable and filterable concept hierarchy
- Graph and tree navigation
- Expandable concept details
- Relationship navigation
- Concept creation and editing
- Lifecycle and maturity indicators

### Concept Workspace

- Natural-language design description
- Design intent and constraints
- Open questions
- Linked requirements
- Candidate implementations
- Engineering evidence
- Revision and decision history

### Alternative Explorer

- Side-by-side concept comparison
- Trade-study criteria and scoring
- Alternative branching
- Selected and rejected alternatives
- Decision rationale

### AI Collaboration

- Context-aware AI interaction
- Ability to create and elaborate Concepts conversationally
- Suggested next steps
- Explicit review of AI-generated changes
- Visibility into AI assumptions and evidence

### Engineering Integration

- Links to related CAD and SysML elements
- Requirements traceability
- Analysis results
- Implementation maturity
- Cross-module change notifications

Provide both graphical and structured views of concept relationships.

Avoid building a second general-purpose CAD editor or SysML modeling environment inside Conceptualize.

## 10. Persistence and APIs

Use the platform's established relational database architecture.

Design a normalized schema supporting:

- Concepts
- Concept revisions
- Typed relationships
- Concept alternatives
- Concept implementations
- Cross-module artifact references
- Design decisions
- Trade studies
- Assumptions
- Evidence and provenance
- Lifecycle events

Use stable identifiers and version-aware references.

Provide documented CRUD, relationship-management, exploration, comparison, and integration APIs.

Use OpenAPI for HTTP contracts where appropriate.

Define domain events for concept creation, revision, implementation linking, selection, and supersession.

Ensure transactional integrity and concurrency handling.

Provide schema migrations and automated tests.

## 11. Engineering rigor and safety

The module must distinguish:

- User assertions
- AI hypotheses
- Engineering assumptions
- Preliminary estimates
- Verified engineering evidence
- Approved design decisions

AI-generated statements must not be silently promoted into validated engineering facts.

Provide source attribution and traceability wherever available.

Use dimensional consistency and unit-aware data structures for numerical engineering properties.

Avoid fabricated calculations, performance claims, and verification evidence.

Preserve historical design rationale when Concepts evolve.

## 12. Architecture documentation

Create or update the relevant architecture documents so that all future agents understand Conceptualize's responsibilities and boundaries.

Document:

- Module purpose and guiding principles
- Domain model
- Concept versus implementation distinction
- Data ownership
- Database schema
- Public APIs
- Domain events
- AI interaction contracts
- Cross-module traceability
- Lifecycle semantics
- UI architecture
- Extension mechanisms
- Testing strategy

Update root-level agent instructions and module registry documentation as required.

Future agents working on Requirements, SysML, CAD, or Analysis must be directed to integrate with Conceptualize through its public contracts rather than bypassing its domain model.

## 13. Implementation and acceptance criteria

First inspect the existing repository, architecture documentation, and implementation conventions.

Then prepare a concise implementation plan with milestones and identify any significant architectural conflicts.

Proceed with implementation using the existing technology stack.

Deliver a working vertical slice demonstrating:

1. Creation of a Concept from natural language.
2. Persistence and retrieval of that Concept.
3. Decomposition into child Concepts.
4. Generation of multiple alternative solutions.
5. Comparison and selection of alternatives.
6. Linking a Concept to a mock or real engineering artifact through the documented integration contract.
7. Preservation of Concept identity when the implementation changes.
8. Traceability of AI-generated modifications.
9. Visualization of the Concept hierarchy and alternatives.
10. Successful automated unit, integration, and API contract tests.

Use real module APIs where available. Where dependent modules are incomplete, implement clearly identified contract-compliant test adapters rather than tightly coupled placeholders.

Do not claim production integration where only a mock exists.

After completing the vertical slice, continue with the remaining approved functionality in prioritized milestones, rather than stopping at documentation or mockups.

## 14. Delivery

The Conceptualize Development Agent shall provide:

- Working module implementation
- Database migrations
- API definitions
- UI components
- Integration contracts
- Automated tests
- Architecture documentation
- Example Concepts and demonstrations
- Outstanding technical risks
- Prioritized feature backlog

The coordinating agent shall review architecture compatibility, test results, and integration readiness before merging.

Commit the implementation to its feature branch and prepare it for integration into the main platform.

Final guiding principle:

Conceptualize should become the persistent intellectual representation of an engineering design — preserving what is being imagined, why it matters, what alternatives exist, and how the idea evolves — while the other engineering modules provide its progressively more precise and verifiable physical and functional realization.
