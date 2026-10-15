# Project Management & Unified Engineering Data: brief (owner's text, verbatim)

Received 15 October 2026. Agreed contracts and governance: [project-management-contracts.md](project-management-contracts.md).
Progress: [project-management-progress.md](project-management-progress.md).

---

Claude Agent Brief — Project Management & Unified Engineering Data

Mission

Spawn a dedicated software engineering agent to architect and implement a fully functional Project Management module for the multidisciplinary engineering platform.

The existing agent shall remain the overall architecture coordinator. The new agent shall own the Project Management module, working independently while coordinating shared interfaces and data contracts with the other module agents.

The goal is to evolve the platform from a collection of demonstration modules into a persistent, integrated engineering environment where users can create an entirely new project, develop an engineering product from first principles, save their work, and return to it later with all project information intact.

This must be a production-oriented implementation, not another demonstration environment.

1. Project creation and lifecycle

Implement a complete project lifecycle including:

- Create a new blank project.
- Create a project from a configurable template.
- Open, close, rename, duplicate, archive, restore, and delete projects.
- Save project data automatically and on explicit user command.
- Display recently opened projects.
- Search, sort, and filter projects.
- Support project ownership and multiple contributors.
- Configure project settings, metadata, units, conventions, and engineering standards.
- Support project descriptions, objectives, scope, milestones, and lifecycle status.

Create a New Project wizard allowing users to specify a project name, description, engineering disciplines, unit system, project template, and initial configuration.

A blank project must genuinely start with no engineering artifacts. Do not automatically populate it with demonstration data.

2. Unified project information model

Architect a canonical project information model that is shared across the platform.

The project is the top-level entity, containing references to all engineering artifacts and their relationships.

The initial information model shall support:

- Projects and project metadata
- Product and system breakdown structures
- Components, parts, and assemblies
- Concepts and alternative design solutions
- Requirements and requirement hierarchies
- SysML models and model elements
- CAD models, geometry, and configurations
- Engineering analyses and simulation results
- Design decisions, assumptions, and rationale
- Verification and validation evidence
- Engineering documents and attachments
- Tasks, issues, risks, and milestones
- Relationships and traceability between artifacts

Each engineering artifact must have a stable, globally unique identifier, a defined type, ownership, creation and modification metadata, lifecycle state, and version information.

Do not implement separate, incompatible project data structures for individual modules.

Define shared entity identities and relationships while allowing each specialized module to own its domain-specific data and storage.

3. Integration with engineering modules

Integrate the project model with the existing and planned modules:

Conceptualize: Concepts are project artifacts that can represent a component, assembly, subsystem, or entire product. Concepts may evolve into multiple candidate engineering implementations.

Design Reasoning: Preserve assumptions, alternatives, trade studies, decisions, rejected options, and the rationale behind engineering choices.

Requirements Management: Requirements belong to projects and can be allocated to system elements, concepts, CAD components, verification activities, and other requirements.

SysML: SysML models shall reference shared project entities and maintain traceability with requirements, concepts, and implementation artifacts.

CAD: Parts, assemblies, drawings, configurations, and imported models shall be stored as project artifacts with stable references to the unified product structure.

AI Interface: All project creation, navigation, configuration, artifact management, and lifecycle operations shall be accessible through documented, permission-controlled APIs and AI tools.

The architecture must allow additional engineering modules to be introduced without redesigning the project model.

Modules may be installed, enabled, or disabled according to the user's subscription without corrupting project information or deleting artifacts belonging to unavailable modules.

4. Project persistence and storage

Implement reliable persistent storage using the existing platform architecture and technology stack wherever appropriate.

Use a relational database for structured project information, identities, metadata, and relationships. Use suitable object storage for large binary artifacts such as CAD files, analysis results, and attachments.

Implement:

- Transactional project and artifact creation
- Automatic saving and recovery
- Durable persistence across application restarts
- Referential integrity
- Schema migrations
- Version history and audit records
- Project backup and restoration
- Project export and import
- Integrity checks for missing or inconsistent artifact references

Investigate an open, documented project interchange package containing structured metadata, relationships, and associated artifacts.

The format must be versioned and designed for long-term portability, including import into another compatible installation.

Do not rely on an opaque proprietary database export as the only means of project portability.

5. Engineering product structure

A project must be capable of representing a product at multiple levels of abstraction and decomposition.

For example:

Project → Product → System → Subsystem → Assembly → Part

However, this hierarchy must not constrain how engineers work.

A concept may represent an entire system before a formal breakdown exists. A requirement may apply across several components. A SysML element may correspond to several physical parts, or a single part may implement multiple functions.

Support multiple views of the same underlying engineering information, including:

- Product breakdown structure
- Functional architecture
- Requirements hierarchy
- Physical assembly structure
- Concept hierarchy
- Verification structure
- Artifact and document browser

These should be different views or projections of connected project information, not independently maintained copies of the product definition.

6. Project Management user interface

Develop a coherent Project Management interface integrated into the existing application.

Include:

Project Home: Dashboard of recent projects, project creation, search, templates, and project status.

Project Overview: Description, lifecycle status, contributors, progress, milestones, and activity history.

Project Explorer: Navigable hierarchy of project artifacts, with search, filtering, contextual menus, and cross-module navigation.

Artifact Inspector: Common metadata, relationships, versions, history, and links to the artifact's owning engineering module.

Project Settings: Units, standards, conventions, module configuration, access permissions, and project metadata.

Project Activity: Recent changes, decisions, tasks, warnings, and outstanding engineering work.

Use the existing design system and navigation architecture. Avoid building a disconnected second interface.

7. Collaboration and engineering configuration management

Provide an extensible foundation for collaborative engineering.

Support users, roles, project membership, and permission enforcement.

Implement artifact revisions, project-level change history, and clear distinction between working state and formally released engineering baselines.

Design for future capabilities such as:

- Engineering change requests and change orders
- Formal approval workflows
- Configuration baselines
- Branching and alternative design configurations
- Comparison between revisions
- Multi-user conflict resolution
- Release and verification gates

Prioritize reliable artifact versioning and baselines before attempting sophisticated concurrent editing.

8. AI-native project operations

The AI must be able to perform the same authorized project operations available to a human user.

Provide typed APIs or tools allowing the AI to:

- Create and configure projects.
- Create and modify project artifacts.
- Navigate and query project structures.
- Find relationships and dependencies.
- Retrieve project context and design history.
- Create tasks and engineering issues.
- Propose changes to engineering artifacts.
- Save and retrieve design alternatives.
- Explain why a particular engineering decision was made.
- Identify potentially inconsistent engineering information.

All AI changes must pass through the same validation, authorization, persistence, and audit mechanisms as human changes.

The AI must not directly manipulate database tables as a shortcut around domain APIs.

Support dry-run and preview operations for consequential changes, with explicit confirmation for destructive actions.

9. Testing and demonstration

The existing example projects are useful and must be preserved as fixtures or templates.

However, the primary acceptance test must start with a completely empty database and a blank project.

Demonstrate the following workflow:

1. Create a new project named "Example Engineering Product".
2. Save it and reopen it.
3. Create a product and initial concept.
4. Add requirements through the Requirements module.
5. Create SysML elements and connect them to requirements.
6. Add a CAD part or assembly through the CAD module.
7. Link the CAD artifact to the shared product structure.
8. Record an engineering decision and its rationale.
9. Create a task and associate it with an engineering artifact.
10. Close the application and restart it.
11. Reopen the project and verify that every artifact, relationship, configuration, and decision remains intact.
12. Modify an artifact and verify revision history and audit behavior.
13. Export the project, import it into a clean environment, and verify its integrity.
14. Test behavior when one engineering module is unavailable.

Use real module integrations where implemented. Where modules are incomplete, use documented contract-test adapters and explicitly report which acceptance steps remain unverified.

10. Architecture and implementation requirements

Before coding:

1. Inspect the existing repository and architecture documentation.
2. Identify existing project, artifact, persistence, and API implementations.
3. Identify overlaps or conflicts with other module responsibilities.
4. Propose a module architecture and canonical project data contracts.
5. Review shared-interface changes with the coordinating agent.
6. Produce a phased implementation plan.

Prefer an independent Project Management module with clearly defined APIs and minimal coupling to the engineering modules.

Do not unnecessarily rewrite existing modules or introduce a new technology stack without justification.

Document database schemas, entity relationships, API contracts, lifecycle transitions, persistence guarantees, and integration points.

Use automated tests, schema validation, and continuous integration.

11. Agent coordination and deliverables

The coordinating agent retains authority over platform-wide architecture and shared contracts.

The Project Management agent owns implementation within its assigned module and shall work on an isolated branch or worktree.

Required deliverables:

- Project Management architecture document
- Unified project information model and relationship definitions
- Project and artifact API specifications
- Database schema and migrations
- Functional project creation and management UI
- Durable project and artifact persistence
- Cross-module integration adapters
- AI-accessible project operations
- Automated integration and persistence tests
- User help and developer documentation
- Demonstration of the blank-project acceptance workflow

Create backlog items for functionality that cannot be completed in the initial implementation. Clearly distinguish implemented functionality from planned capability.

Definition of done: A user can create a genuinely blank project, populate it through the engineering modules, close the application, reopen the project, and continue engineering work without losing data, identity, traceability, or design history.

Begin by inspecting the repository and producing the architecture and implementation plan. Then proceed with implementation in coordinated phases, seeking coordinator approval for shared-contract changes rather than independently altering other modules.
