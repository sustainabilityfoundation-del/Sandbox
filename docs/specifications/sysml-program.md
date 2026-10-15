# Task: Architect and Develop the SysML / MBSE Module

Owner brief, 14 October 2026 (verbatim). Agreed contracts and governance:
[sysml-program-contracts.md](sysml-program-contracts.md). Progress: [sysml-program-progress.md](sysml-program-progress.md).

## 1. Agent delegation

You are the lead architecture coordinator for our multidisciplinary, AI-native engineering platform.

Spawn a new dedicated subagent responsible for the SysML / Model-Based Systems Engineering (MBSE) module.

The new agent shall:

- Own the research, architecture, implementation, testing and documentation of the SysML module.
- Work independently using an isolated Git worktree or equivalent development environment.
- Maintain its own implementation backlog and architectural documentation.
- Coordinate interface definitions with the parent architecture agent.
- Delegate bounded research or implementation tasks to additional agents where supported.
- Report progress, architectural decisions, risks and integration dependencies to the parent agent.

The existing coordinator must retain ownership of the overall platform architecture, shared services and cross-module interface contracts.

Do not allow the SysML agent to make unilateral changes to shared platform architecture.

## 2. Mission

Develop a professional-grade, full-featured SysML modeling environment comparable to the leading commercial MBSE platforms.

The module must support both:

1. Traditional human-driven systems engineering, with graphical modeling, textual modeling, model browsers, tables, matrices, properties, validation and engineering workflows.
2. AI-driven systems engineering, in which an AI agent can create, inspect, modify, query, analyze, validate and elaborate systems models using the same underlying functionality available to human users.

The module must be capable of standalone operation and integration into the main engineering platform.

The long-term objective is a model-based engineering environment suitable for complex multidisciplinary projects, including aerospace, automotive, industrial machinery, robotics, infrastructure and other engineered systems.

## 3. Research industry-leading MBSE tools

Before finalizing the architecture, research the capabilities and workflows of the following platforms:

Primary benchmark: Dassault Systèmes / No Magic

- CATIA Magic / Cameo Systems Modeler
- MagicDraw
- Cameo Enterprise Architecture
- Cameo Simulation Toolkit
- Teamwork Cloud
- Cameo Collaborator

Additional benchmarks

- IBM Engineering Systems Design Rhapsody
- Sparx Systems Enterprise Architect
- PTC Modeler
- Siemens Teamcenter-integrated systems engineering capabilities
- Obeo SysON, including its open-source SysML v2 implementation

Research additional relevant tools where justified.

Use only publicly accessible information, including official vendor documentation, published manuals, technical papers, standards, demonstrations, academic publications and legitimately licensed open-source repositories.

Do not access proprietary source code, bypass licensing, or reproduce copyrighted implementation code.

### Research deliverables

Produce:

- A comprehensive feature comparison matrix.
- A catalog of essential and advanced MBSE capabilities.
- A comparison of modeling workflows and user interfaces.
- An analysis of model persistence and collaboration approaches.
- An assessment of extensibility, scripting, APIs and interoperability.
- A list of common weaknesses and opportunities for improvement.
- A prioritized feature backlog with traceability to research sources.

Distinguish verified capabilities from assumptions.

Pay particular attention to Cameo's model browser, diagrams, relationship matrices, model validation, simulation, collaborative modeling and requirements traceability.

Do not merely replicate Cameo's interface. Identify opportunities to create a more efficient, modern, AI-native engineering experience.

## 4. Standards compliance

SysML v2 shall be the primary modeling standard.

Research and implement against the official OMG specifications:

- SysML v2 Language Specification.
- KerML specification.
- Systems Modeling API and Services specification.
- SysML v1-to-v2 Transformation Specification.

Use the official OMG publications and the Systems Modeling Community reference implementation as primary technical references.

Support SysML v1.7 interoperability, including migration of existing SysML v1 models.

The architecture must provide:

- A standards-aligned semantic model.
- Textual and graphical representations.
- Model parsing and serialization.
- Semantic validation.
- Standard library support.
- Version-aware model persistence.
- Standards-compliant model access APIs.
- Extensible model transformations.

Do not substitute a simplified proprietary graph schema for the SysML semantic model.

A graph or relational database may be used for persistence and indexing, but the stored model must preserve the semantics of SysML and KerML.

Where standards compliance is incomplete, explicitly document the limitations and maintain conformance tests.

## 5. Functional capabilities

Architect the complete functional scope, including the following.

### A. Model structure and architecture

- Model and package hierarchies.
- Part and component definitions and usages.
- Systems, subsystems and assemblies.
- Interfaces, ports and connections.
- Item, information, material and energy flows.
- Attributes, values, units and quantities.
- Specialization, redefinition and variation.
- Allocation relationships.
- Model libraries and reusable patterns.
- System-of-systems architecture.
- Product configurations and variants.

### B. Behavioral modeling

- Activities and action flows.
- State machines and transitions.
- Interactions and sequences.
- Events and triggers.
- Functional decomposition.
- Operational scenarios.
- Control and data flows.
- Concurrent and conditional behavior.
- Timing and event constraints.

### C. Requirements and verification

- Requirement definitions and usages.
- Requirements allocation and satisfaction.
- Verification cases and test relationships.
- Requirement derivation and refinement.
- Traceability matrices.
- Gap and coverage analysis.
- Verification status and evidence.
- Change impact analysis.

The dedicated Requirements Management module shall remain the authoritative owner of managed requirements records.

SysML shall represent and reference requirements through stable, version-aware integration contracts.

Do not create competing authoritative requirements databases.

### D. Parametric and analytical modeling

- Constraints and equations.
- Engineering quantities and units.
- Parametric relationships.
- Expression evaluation.
- Engineering calculations.
- Model-level measures of effectiveness.
- Trade studies.
- Sensitivity analysis.
- Design alternatives.
- Constraint checking.
- Connections to external solvers.

### E. Views and visualization

Provide a professional graphical modeling environment supporting the relevant SysML v2 views and graphical notations.

Also support familiar SysML v1 diagram workflows where practical, including:

- Block Definition Diagrams.
- Internal Block Diagrams.
- Activity Diagrams.
- State Machine Diagrams.
- Sequence Diagrams.
- Requirements Diagrams.
- Parametric Diagrams.
- Package Diagrams.
- Use Case Diagrams.

Do not assume SysML v1 diagrams map directly to SysML v2 notation.

Implement a clear distinction between standard-compliant SysML v2 views and legacy diagram compatibility.

Include:

- Drag-and-drop modeling.
- Contextual toolbars.
- Property inspectors.
- Hierarchical model browsers.
- Search and filtering.
- Dependency matrices.
- Relationship navigation.
- Automatic diagram layout.
- Dynamic model-derived views.
- Saved viewpoints.
- Customizable visual styles.
- Model comparison and change visualization.

Diagrams must be projections of the underlying semantic model, not independent sources of engineering truth.

### F. Model execution and simulation

Research and architect:

- Executable behavioral models.
- State-machine execution.
- Activity simulation.
- Parametric solving.
- Scenario execution.
- Simulation time and event handling.
- Results visualization.
- Integration with external simulation engines.
- Model verification and validation.

Clearly distinguish executable functionality from models that are only descriptive.

## 6. AI-native architecture

Every capability exposed through the human interface must also be accessible through a documented, machine-readable AI tool interface.

The AI must be able to:

- Create and modify model elements.
- Construct system architectures.
- Define interfaces and interactions.
- Generate behavior models.
- Allocate functions to components.
- Link requirements to architecture.
- Create verification cases.
- Build and execute model queries.
- Generate diagrams and viewpoints.
- Detect inconsistencies.
- Suggest alternative architectures.
- Perform impact analysis.
- Propose design changes.
- Compare design alternatives.
- Explain modeling decisions.

All AI operations must use the same validated domain services as human operations.

Do not implement AI functionality through simulated mouse clicks or direct, unvalidated database manipulation.

### AI transaction requirements

Provide:

- Structured, typed commands.
- Schema discovery.
- Model introspection.
- Transactional modifications.
- Dry-run capability.
- Change previews.
- Undo and rollback.
- Version checks and concurrency control.
- Provenance and audit logging.
- Human approval for consequential changes.
- Semantic validation after modification.

The AI must be able to explain what it changed, why it changed it, and which engineering artifacts are affected.

## 7. Integration with Conceptualize and design reasoning

The Conceptualize module maintains abstract concepts and the associated design reasoning layer.

SysML provides formal system definitions, architecture, behavior and relationships.

These representations must be connected without forcing premature design commitment.

A concept may map to:

- An entire system.
- A subsystem.
- An assembly.
- A component.
- A function.
- An interface.
- Multiple alternative SysML architectures.

A single concept may have several competing candidate implementations.

The architecture shall support:

- Concept-to-model traceability.
- Progressive formalization.
- Alternative system architectures.
- Design rationale and assumptions.
- Unresolved engineering decisions.
- Trade-study results.
- Model maturity and confidence.
- Bidirectional impact analysis.

An AI agent must be able to elaborate a concept into a formal SysML architecture while preserving the original design intent and recording assumptions.

Do not embed the entire design reasoning layer inside SysML.

## 8. Cross-module integration

The SysML module must integrate with:

### Requirements Management

- Requirement synchronization.
- Satisfaction and verification relationships.
- Coverage and impact analysis.
- ReqIF-compatible interchange through the requirements module.

### CAD

- Mapping SysML parts to CAD parts and assemblies.
- Interface and connection traceability.
- Mass properties and physical attributes.
- Configuration consistency.
- Bidirectional change notification.
- Links between functional and physical architectures.

### Conceptualize

- Abstract-to-formal model mappings.
- Alternative architectures.
- Design rationale and decisions.

### Future simulation and analysis modules

- Solver integration.
- Model parameter exchange.
- Analysis cases.
- Verification results.
- Simulation provenance.

Use explicit, versioned APIs and events rather than direct cross-module database access.

Support the ability to install, deploy, license and run SysML independently of the other modules.

## 9. Technical architecture

Evaluate and recommend an architecture compatible with the existing platform technology decisions.

Prefer reuse of the platform's existing:

- Rust backend infrastructure, where applicable.
- React/TypeScript frontend.
- Shared API conventions.
- Authentication and authorization services.
- Event and messaging infrastructure.
- Database and persistence conventions.
- Documentation and help systems.

Do not introduce a new technology stack without a documented justification.

Investigate existing open-source SysML v2 parsers, semantic libraries, reference implementations and graphical modeling frameworks before building equivalents.

Evaluate the maturity, licensing, conformance and maintenance risks of each candidate dependency.

The proposed architecture should separate:

1. SysML/KerML semantic core.
2. Parsing, serialization and interchange.
3. Model repository and persistence.
4. Query and validation services.
5. Modeling commands and transactions.
6. Graphical and textual editors.
7. Simulation and analysis services.
8. AI tool interface.
9. Cross-module integration adapters.
10. Collaboration, versioning and security.

Design for large models containing hundreds of thousands of elements and relationships, with a credible scaling path to larger industrial models.

Include lazy loading, incremental updates, indexing and efficient model queries.

## 10. Collaboration and lifecycle management

Research Cameo Teamwork Cloud and comparable collaborative modeling environments.

Architect support for:

- Multi-user projects.
- Concurrent model editing.
- Branches and baselines.
- Model versioning.
- Semantic diff and merge.
- Conflict resolution.
- Access control.
- Audit history.
- Model review and approval.
- Change notifications.
- Model publication.
- Offline and online workflows.

Do not rely exclusively on text-file diffs to reconcile semantic model changes.

## 11. Model exchange and interoperability

Support open engineering data exchange.

Prioritize:

- Native SysML v2 textual syntax.
- OMG Systems Modeling API and Services.
- Standards-aligned SysML v2 model serialization.
- SysML v1 XMI import/export where feasible.
- SysML v1-to-v2 transformation.
- ReqIF integration through Requirements Management.
- Document and report export.
- Machine-readable model queries.

Research compatibility with Cameo, Rhapsody, Enterprise Architect and other leading platforms.

Document precisely which import/export capabilities are standards-based and which require proprietary vendor interfaces.

Do not claim universal compatibility without verified round-trip testing.

## 12. Documentation and help

Implement documentation consistent with the platform's established help architecture.

Include:

- User manuals.
- Modeling tutorials.
- API reference documentation.
- Developer architecture documentation.
- SysML language references.
- AI command documentation.
- Worked engineering examples.
- Context-sensitive help.
- Troubleshooting guides.

The main application help menu must automatically discover and expose the SysML module's help documentation when the module is installed.

## 13. Testing and quality

Implement automated tests covering:

- SysML syntax and semantics.
- Parser and serializer correctness.
- Standards conformance.
- Model validation.
- Referential integrity.
- Cross-module relationships.
- Transaction safety.
- Concurrent editing.
- Import/export round trips.
- AI-generated modifications.
- Diagram/model synchronization.
- Large-model performance.
- Permissions and security.

Use official reference examples and conformance resources wherever legally and technically available.

Create representative engineering examples, including a multidisciplinary system containing mechanical, electrical, software and control components.

## 14. Implementation strategy

Do not attempt to implement the entire commercial feature set in one uncontrolled development pass.

First produce:

1. Research and competitive analysis.
2. Formal functional requirements.
3. Architecture Decision Records.
4. Semantic model and persistence architecture.
5. API and integration contracts.
6. User-interface architecture.
7. AI command architecture.
8. Phased implementation roadmap.
9. Risk register.
10. Test and standards-conformance strategy.

Then proceed through incremental vertical slices:

Phase 1 — Foundation
SysML v2 semantic model, repository, parsing, API and basic validation.

Phase 2 — Modeling environment
Textual editor, model browser, graphical views and property editing.

Phase 3 — Engineering integration
Requirements, Conceptualize, CAD relationships and traceability.

Phase 4 — Advanced modeling
Behavior, parametrics, queries, analysis and model execution.

Phase 5 — Enterprise capabilities
Collaboration, branching, semantic merge, security and large-model performance.

Phase 6 — AI-native engineering
Advanced autonomous modeling, architecture generation, impact analysis and iterative design exploration.

AI access to core model operations must be established in Phase 1 rather than deferred entirely to Phase 6.

Each phase must produce tested, usable functionality.

## 15. Repository and agent workflow

Inspect the existing repository structure and architectural conventions.

Recommend whether SysML should reside in a dedicated repository or a clearly isolated module within the existing repository.

Favor independent development and deployment without sacrificing integration consistency.

Create or update the relevant architecture, requirements, interface, testing and backlog documents.

The dedicated SysML agent must:

- Maintain an implementation backlog.
- Record architectural decisions.
- Use feature branches or isolated worktrees.
- Run tests before integration.
- Submit changes through the established review process.
- Avoid breaking shared APIs.
- Coordinate changes to cross-module contracts.
- Keep documentation synchronized with implementation.

The parent coordinator remains responsible for reviewing and accepting integration changes.

## 16. Initial execution instructions

Begin immediately.

1. Spawn the dedicated SysML agent.
2. Inspect the current project architecture and repository.
3. Research the official OMG standards and leading MBSE products.
4. Produce the feature comparison and capability inventory.
5. Develop the proposed architecture and integration contracts.
6. Identify reusable open-source implementations.
7. Create the implementation backlog and phase milestones.
8. Present major architectural decisions to the coordinator.
9. Begin implementing the approved foundational vertical slice.

Do not stop after producing a high-level design.

Continue through implementation, testing and documentation within the approved architecture and available execution environment.

Do not claim that functionality is complete unless it has been implemented and verified.

Success criterion: The resulting SysML module must be a credible foundation for a professional, standards-aligned, AI-native MBSE product, rather than merely a graphical diagram editor.
