# Claude Code Task: Architect and Implement the CAD Module

Owner brief, 14 October 2026 (verbatim). Agreed contracts and governance:
[cad-program-contracts.md](cad-program-contracts.md). Progress: [cad-program-progress.md](cad-program-progress.md).

## 1. Mission

Create a new, independently developed Computer-Aided Design (CAD) module within the existing multidisciplinary engineering platform.

Spawn a dedicated CAD development agent responsible for researching, architecting, implementing, testing, and documenting this module.

The existing coordinating agent must remain responsible for overall platform architecture, integration, interface contracts, and supervision. Do not transfer responsibility for the overall project to the CAD agent.

The long-term objective is a professional-grade, full-featured mechanical CAD package comparable in scope and capability to CATIA, SOLIDWORKS, Autodesk Inventor, Siemens NX, and PTC Creo.

The CAD system must support two equally capable interaction modes:

1. Human-directed CAD: Traditional interactive, feature-based parametric modeling using a graphical interface.
2. AI-directed CAD: Complete programmatic control of modeling operations, parameters, geometry, constraints, assemblies, drawings, and associated data through a documented AI-accessible API.

Both interaction modes must operate on the same underlying model and command architecture.

The module must be capable of standalone operation and integration with the existing engineering platform, including the Requirements, SysML, Conceptualize, and AI Interface modules.

Treat this as a long-term engineering software development program, not a simple CAD viewer or demonstration.

---

## 2. Agent Organization

### 2.1 Spawn a dedicated CAD agent

Create a specialized CAD development agent with its own development context and clearly defined ownership boundaries.

The CAD agent shall:

- Own the CAD module's technical architecture and implementation.
- Maintain CAD-specific architecture, requirements, roadmap, and development documentation.
- Research industry-leading CAD functionality.
- Evaluate appropriate open-source geometric modeling technologies.
- Implement the CAD modeling engine, feature system, user interface, APIs, and exchange infrastructure.
- Develop automated tests and regression models.
- Report implementation progress and architectural decisions to the coordinating agent.

The coordinator shall:

- Maintain authority over platform-wide architectural decisions.
- Approve cross-module API contracts.
- Ensure compatibility with existing modules.
- Prevent duplicated functionality across modules.
- Coordinate parallel development.
- Review architectural decisions with significant platform implications.

Use a separate repository if this is consistent with the existing modular architecture. Otherwise, establish an independently buildable and testable module with clear ownership boundaries.

Use a dedicated Git worktree or branch for concurrent agent development. Avoid simultaneous conflicting changes to shared files.

The CAD agent may delegate bounded tasks to specialist subagents, including geometric kernel research, parametric modeling, CAD interoperability, UI development, and testing.

---

## 3. Industry Research

Before committing to the detailed architecture, research the following five leading mechanical CAD systems:

1. Dassault Systèmes CATIA
2. Dassault Systèmes SOLIDWORKS
3. Siemens NX
4. Autodesk Inventor
5. PTC Creo Parametric

Research publicly available information only, including:

- Official product documentation
- Public user manuals
- Published API documentation
- Public feature descriptions
- Educational materials
- Academic publications
- Published engineering papers
- Public demonstrations and tutorials
- Publicly available software architecture information
- Open-source CAD projects

Do not access proprietary source code, restricted technical documentation, confidential materials, or unauthorized resources.

Do not copy proprietary implementations or copyrighted material beyond legally permitted use.

### 3.1 Produce a competitive feature matrix

Compare the five packages across:

- Part modeling
- Sketching and constraint solving
- Feature-based parametric modeling
- Direct modeling
- Surface modeling
- Solid modeling
- Assembly modeling
- Large assembly management
- Configuration and product families
- Top-down design
- Sheet metal
- Weldments and structural members
- Freeform and advanced surfacing
- Multi-body modeling
- Reference geometry
- Geometric dimensioning and tolerancing
- Model-based definition
- 2D engineering drawings
- CAD interoperability
- Design automation
- CAD APIs and scripting
- Revision and dependency management
- Geometry healing and repair
- Performance and scalability

For each capability, identify the relevant industry implementations, functional requirements, user workflows, technical challenges, and proposed implementation priority.

Also investigate open-source systems such as FreeCAD, Open CASCADE Technology, SolveSpace, CadQuery, and other relevant projects.

Research their architecture, available libraries, licensing, extensibility, and limitations.

Deliver a documented comparison and recommended CAD capability roadmap.

---

## 4. Core Architectural Principles

### 4.1 Parametric CAD as the foundation

The CAD module shall implement a history-based, feature-driven parametric modeling system.

The model must maintain:

- Geometric entities and topology
- Sketch geometry and constraints
- Dimensions and expressions
- Design parameters
- Feature definitions
- Feature dependency relationships
- Reference geometry
- Assembly relationships
- Configuration states
- Model regeneration history
- Stable entity identifiers
- Engineering metadata

Changing an upstream dimension or parameter must trigger the appropriate regeneration of dependent features.

Implement a dependency graph with incremental regeneration and robust failure reporting.

### 4.2 Separate geometry from design intent

Architect the system with distinct but interconnected layers:

Geometric kernel: Exact geometric and topological operations.

Parametric feature engine: Features, dependencies, constraints, regeneration, and design history.

Engineering semantic layer: Named interfaces, functional surfaces, design parameters, constraints, and engineering meaning.

Interaction layer: Human graphical interaction, scripting, external API access, and AI control.

Persistence and interoperability layer: Native model serialization, versioning, import/export, and exchange.

Do not embed feature logic exclusively in the graphical interface.

All modeling operations must be accessible through documented programmatic commands.

### 4.3 Native open model representation

Create an openly documented, versioned native CAD data model capable of preserving full parametric design intent.

It must support serialization and reconstruction of:

- Parts and assemblies
- Feature trees
- Sketches and constraints
- Parameters and expressions
- Geometric references
- Dependencies
- Configurations
- Metadata
- Engineering semantics
- External module references

Use open standards wherever practical.

Evaluate STEP AP242, ISO 10303, and relevant open engineering data standards.

Use STEP AP242 as a principal neutral geometry and product-data exchange format, but do not assume it preserves complete proprietary parametric histories.

The native parametric model format must be openly specified and independently implementable.

Avoid making a proprietary binary representation the only authoritative model format.

---

## 5. Geometric Modeling Engine

Research and select a suitable geometric modeling kernel.

Evaluate at least:

- Open CASCADE Technology
- Other legally usable open-source geometric modeling kernels
- The feasibility and cost of implementing missing capabilities independently

Assess:

- Boundary representation (B-rep)
- Exact solid modeling
- Boolean operations
- NURBS curves and surfaces
- Surface trimming
- Fillets and chamfers
- Offsetting and shelling
- Geometric intersections
- Topological naming and persistence
- Numerical tolerances
- Robustness of regeneration
- Large model performance
- Cross-platform compatibility
- Licensing constraints

Prefer proven open-source technologies over developing a geometric kernel from scratch unless there is a compelling technical justification.

Document the selection and its limitations.

---

## 6. Functional CAD Requirements

Implement the following capability families progressively.

### 6.1 Sketching

- 2D sketches on arbitrary planes
- Lines, arcs, circles, ellipses, splines, polygons
- Construction geometry
- Geometric constraints
- Dimensional constraints
- Fully and partially constrained sketches
- Automatic constraint inference
- Constraint conflict detection
- Driven and driving dimensions
- Sketch patterns and transformations
- Projection and conversion of model geometry

### 6.2 Parametric part modeling

- Extrude
- Revolve
- Sweep
- Loft
- Hole features
- Fillet
- Chamfer
- Shell
- Draft
- Rib
- Mirror
- Linear and circular patterns
- Boolean operations
- Multi-body modeling
- Reference planes, axes, and points
- Variables and equations
- Feature suppression
- Feature reordering
- Design configurations

### 6.3 Advanced geometry

- Surface construction and editing
- NURBS surface modeling
- Boundary surfaces
- Surface knitting and trimming
- Freeform surface manipulation
- Direct geometry editing
- Hybrid solid/surface workflows
- Geometry repair
- Imported geometry recognition

### 6.4 Assembly modeling

- Hierarchical assemblies and subassemblies
- Component instances
- Fixed and floating components
- Mates and assembly constraints
- Degrees-of-freedom analysis
- Interference detection
- Clearance analysis
- Exploded views
- Assembly configurations
- In-context modeling
- Top-down assembly design
- External references
- Large assembly loading and visualization
- Component substitution
- Assembly patterns
- Bill of materials generation

### 6.5 Engineering documentation

- 2D drawing generation
- Orthographic and isometric views
- Sections and detail views
- Dimensioning
- Tolerances
- GD&T annotations
- Model-based definition
- Drawing templates
- Parts lists
- Revision information
- Export to common drawing formats

### 6.6 Specialized modeling

Develop extensible capability packages for:

- Sheet metal
- Weldments
- Structural frames
- Routed piping and tubing
- Mechanical routing
- Mechanism and kinematic modeling
- Design tables
- Family-of-parts generation

Keep specialized capabilities modular rather than tightly coupling them to the core modeling engine.

---

## 7. CAD File Interoperability

The CAD module shall aim to open models originating from the ten leading mechanical CAD ecosystems.

Research the appropriate import and export formats for:

1. CATIA
2. SOLIDWORKS
3. Siemens NX
4. Autodesk Inventor
5. PTC Creo
6. Solid Edge
7. Autodesk Fusion
8. Onshape
9. FreeCAD
10. Rhino 3D

The long-term objective is comprehensive interoperability with these ecosystems.

Investigate:

- Native file formats
- STEP AP203/AP214/AP242
- IGES
- Parasolid XT
- ACIS SAT
- JT
- 3D XML
- STL
- OBJ
- 3MF
- DXF/DWG
- Other relevant neutral and vendor-specific formats

### 7.1 Interoperability requirements

The system must distinguish between:

1. Exact solid geometry import
2. Surface geometry import
3. Tessellated geometry import
4. Assembly structure preservation
5. Metadata preservation
6. PMI/GD&T preservation
7. Parametric feature-history preservation

Do not treat these as equivalent.

Where native proprietary formats cannot legally or technically be decoded using available libraries, investigate authorized conversion services, documented vendor APIs, licensed translators, and neutral exchange workflows.

Do not claim universal native-format support without verified implementations.

Produce a compatibility matrix identifying the import capabilities, limitations, dependencies, licensing requirements, and fidelity of each supported format.

Implement automatic format detection and informative diagnostics.

### 7.2 Export

Support standards-based export with STEP AP242 as a primary exchange target.

Also provide commonly used geometry and visualization formats.

Preserve assembly structures, names, units, colors, and metadata where supported by the destination format.

Ensure the native open model format remains the authoritative source for complete parametric design intent.

---

## 8. Human CAD Interface

Develop a modern, professional CAD interface consistent with the existing platform design system.

The interface must support:

- Interactive 3D viewport
- Selection and highlighting
- Orbit, pan, zoom, and fit
- Feature tree
- Assembly tree
- Sketch editing
- Dimension editing
- Feature creation dialogs
- Property inspection
- Contextual toolbars
- Undo and redo
- Keyboard shortcuts
- Multi-selection
- Selection filters
- Visibility controls
- Section views
- Measurement tools
- Model diagnostics
- Multiple document management

Investigate the interaction patterns used by leading CAD packages without copying proprietary interface assets.

Support both browser-based and desktop operation.

The architecture must allow high-performance local execution of geometry-intensive operations.

Evaluate a Rust/C++ native computational core, WebAssembly integration, WebGPU-based visualization, and the existing React-based interface architecture.

Do not force computationally intensive geometric operations into JavaScript solely because the user interface is web-based.

---

## 9. AI-Native CAD Architecture

This is a fundamental requirement, not an optional extension.

Every meaningful CAD operation accessible to a human must have an equivalent machine-accessible operation.

The AI must be capable of:

- Creating new parts and assemblies
- Creating and editing sketches
- Applying geometric constraints
- Creating and modifying features
- Editing dimensions and parameters
- Querying geometric properties
- Selecting and identifying entities
- Navigating assembly structures
- Modifying mates and relationships
- Regenerating models
- Inspecting modeling errors
- Creating engineering drawings
- Importing and exporting models
- Executing design iterations
- Evaluating geometry against engineering requirements

### 9.1 Shared command architecture

Implement a structured CAD command system.

For example:

"create_sketch"

"add_circle"

"apply_constraint"

"set_parameter"

"extrude_profile"

"create_fillet"

"insert_component"

"apply_assembly_mate"

"regenerate_model"

"measure_geometry"

"export_step"

These are illustrative examples, not a fixed or exhaustive API.

Each operation must define:

- Typed inputs
- Preconditions
- Validations
- Expected outputs
- Error responses
- Transaction boundaries
- Undo/redo behavior
- Model version requirements
- Affected entity identifiers

The graphical interface and AI interface must invoke the same authoritative modeling operations.

### 9.2 AI observability

The AI must be able to inspect the model through structured queries rather than relying exclusively on screenshots.

Expose:

- Feature trees
- Parameters
- Sketch constraints
- Geometric entities
- Surface and body properties
- Assembly hierarchy
- Dependency relationships
- Regeneration failures
- Mass properties
- Interference results
- Design metadata

Provide optional viewport images and visual feedback as supplementary context.

### 9.3 Safe and deterministic AI operations

AI-directed modeling must support:

- Preview before commit
- Transactional edits
- Undo/rollback
- Model version checks
- Deterministic command execution
- Validation after regeneration
- Structured error recovery
- Complete operation logs
- User approval for consequential actions

Ensure AI actions do not silently corrupt or overwrite models.

### 9.4 AI design reasoning

Integrate with the existing AI Interface and Conceptualize modules.

The AI must be able to work from an abstract concept toward concrete geometry.

For example:

Concept → Functional interfaces → Design parameters → Parametric features → CAD geometry → Verification.

Maintain traceability between the abstract design intent and its CAD implementation.

Allow the AI to explore alternative geometries while preserving explicitly defined engineering interfaces and constraints.

Do not embed the AI's reasoning exclusively in the CAD module. Use shared platform services and interfaces.

---

## 10. Integration with Other Engineering Modules

Define stable, versioned APIs for integration with:

### Requirements Management

Associate requirements with parts, assemblies, features, parameters, and geometric interfaces.

Support verification and traceability.

### SysML Modeling

Map SysML blocks, parts, ports, interfaces, and relevant constraints to CAD components and assemblies.

Support controlled synchronization without assuming every SysML element maps directly to geometry.

### Conceptualize

Link abstract concepts to one or more CAD realizations.

Preserve concept identity across design iterations.

Support competing design alternatives and progressive elaboration.

### AI Interface

Expose all CAD functionality through discoverable, documented tools and structured APIs.

### Future Engineering Modules

Design extension points for FEA, CFD, thermal analysis, manufacturing, optimization, and other computational engineering capabilities.

Use stable identifiers and explicit ownership of authoritative data to avoid inconsistent duplicated models.

---

## 11. Performance and Scalability

Architect for professional engineering workloads.

The system must eventually support:

- Large parts with extensive feature histories
- Assemblies containing thousands of components
- Efficient geometric regeneration
- Incremental dependency updates
- Partial assembly loading
- Multithreaded computation where appropriate
- Responsive viewport interaction
- GPU-accelerated visualization
- Efficient geometry caching
- Robust model persistence
- Crash recovery

Define performance benchmarks and regression tests.

Use representative models of increasing complexity.

---

## 12. Quality, Testing, and Validation

Establish automated tests for:

- Geometric kernel operations
- Constraint solving
- Parametric regeneration
- Feature dependencies
- Topological reference stability
- Assembly constraints
- File import/export
- Geometry round-trip fidelity
- Numerical tolerances
- Undo/redo
- AI command execution
- Model serialization
- Cross-platform consistency
- Performance regression

Create a reusable CAD benchmark model library.

For import/export testing, use publicly available or appropriately licensed test models.

Validate geometry numerically and topologically, not only visually.

---

## 13. Development Roadmap

Do not attempt to implement all capabilities simultaneously.

Develop an incremental roadmap with demonstrable milestones.

### Phase 0 — Research and architecture

- Competitive research
- Feature matrix
- Geometric kernel evaluation
- Native data model specification
- API architecture
- Licensing review
- Development roadmap
- Performance targets

### Phase 1 — Functional parametric CAD foundation

Deliver a working system capable of:

- Creating a part
- Sketching constrained 2D profiles
- Creating extrusions and revolutions
- Editing dimensions
- Regenerating feature dependencies
- Saving and reopening parametric models
- Displaying geometry in a 3D viewport
- Exporting STEP
- Executing the same operations through the AI API

### Phase 2 — Professional part modeling

Expand feature modeling, robust topology handling, patterns, reference geometry, and parameter expressions.

### Phase 3 — Assembly modeling

Implement components, hierarchy, mates, assembly regeneration, and interference detection.

### Phase 4 — Advanced modeling and drawings

Implement surfacing, direct modeling, specialized features, and engineering drawings.

### Phase 5 — Expanded interoperability

Develop and validate import/export support across the target CAD ecosystems.

### Phase 6 — Professional scalability

Improve large-assembly performance, advanced configuration management, reliability, and specialized modeling capabilities.

These phases may be refined after research.

Maintain a traceable feature backlog and distinguish implemented, partially implemented, experimental, and planned functionality.

---

## 14. Documentation Deliverables

Create and maintain:

- CAD architecture specification
- CAD requirements specification
- Competitive research report
- Geometric kernel selection report
- CAD native format specification
- API specification
- Interoperability compatibility matrix
- AI command specification
- Testing and validation strategy
- Development roadmap
- Feature backlog
- Agent development instructions
- Integration contracts
- User help documentation

Use the repository's existing documentation conventions and architecture-decision-record process.

Document all APIs in machine-readable form where practical, using OpenAPI, JSON Schema, or appropriate equivalent technologies.

The platform's help system must expose CAD documentation contextually.

---

## 15. Immediate Execution Instructions

1. Inspect the existing repository, architecture documentation, agent configuration, and module conventions.
2. Spawn the dedicated CAD development agent.
3. Establish module ownership and an isolated development workspace.
4. Research the five specified leading CAD packages using public sources only.
5. Research suitable open-source geometric modeling technologies.
6. Produce the competitive feature matrix and interoperability assessment.
7. Recommend the technical architecture and native model representation.
8. Define the cross-module interfaces with the existing engineering platform.
9. Create the detailed requirements, development roadmap, and prioritized backlog.
10. Implement the Phase 1 vertical slice, including a usable human modeling workflow and equivalent AI-driven workflow.
11. Develop automated tests demonstrating parametric regeneration, serialization, and STEP export.
12. Integrate the module with the existing application through its established extension architecture.
13. Report the completed work, test results, unresolved risks, and recommended next tasks.

Do not stop after producing research documents or architectural diagrams.

Proceed to implementation after documenting the architectural decisions, unless a significant architectural conflict or licensing issue requires coordinator approval.

Do not invent functionality or claim completion of capabilities that have not been implemented and tested.

The intended outcome is a maintainable, extensible, professional-grade CAD system that can grow toward the functional breadth of CATIA, SOLIDWORKS, NX, Inventor, and Creo, while offering an open parametric model representation and genuinely first-class AI control.
