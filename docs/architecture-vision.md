# Engineering Development Platform — Architecture Vision

Updated: 13 October 2026

Status: proposed architecture and long-term product vision. This document consolidates the direction discussed; it does not assert that the capabilities below are already implemented.

## 1. Purpose

Build an integrated suite for developing complex engineering products, including safety-critical aerospace and automotive systems. Connect requirements, architecture, geometry, mathematics, implementation, analysis, manufacturing and verification through a controlled product definition.

Each discipline tool must remain independently usable, buildable and testable. The integrated platform adds cross-discipline navigation, traceability, configuration control, shared workflows and an AI interface. Users can access individual tools or a subscribed combination through a common application shell.

Existing products such as MATLAB, Simulink, R, Ansys and established CAD/EDA/CAM tools are references for understanding workflows and capability expectations. They are not instructions to copy proprietary code, assets or branding.

## 2. Initial scope and future scope

The initial user-facing modules are Requirements Management, SysML Modelling and Parametric Mechanical CAD. Implement a minimal configuration, traceability and verification foundation alongside them. Other tools belong to the long-term roadmap and should not appear as working features before they are implemented.

Future integration needs should inform concrete interface decisions. Avoid building speculative frameworks or coupling current modules to unimplemented services.

## 3. Long-term capability map

These are capability domains, not a requirement for one repository, application or microservice per row.

| Domain | Intended capabilities |
| --- | --- |
| Requirements management | Structured requirements, attributes, hierarchy, allocation, reviews, baselines, verification methods and bidirectional traceability |
| Systems engineering and SysML | Functional and logical architectures, interfaces, behaviour, states, constraints, allocations and model validation |
| Mechanical CAD | Parametric parts and assemblies, sketches, geometry, drawings, materials, tolerances and model-based definition |
| Mathematics and numerical computing | Equations, symbolic and numerical computation, scripts, notebooks, units, numerical solvers and reusable calculation models |
| Statistics and design exploration | Statistical analysis, design of experiments, optimization, uncertainty propagation, sensitivity analysis and parameter estimation |
| Executable system and control modelling | Block diagrams, state machines, plant models, control design, simulation, co-simulation and potential code generation |
| Electronics and programmable hardware | Schematics, PCB layout, circuit simulation, component libraries, design-rule checks, signal/power integrity and FPGA/HDL development and verification |
| Electrical systems and harnesses | Wiring, connectors and pins, harness topology and routing, electrical loads, network architecture and manufacturing outputs |
| Engineering analysis | Structural, thermal, fluid, electromagnetic and multibody analysis; meshing, materials, solver orchestration and result management |
| Safety and reliability | FHA/HARA, FMEA/FMECA, FMEDA, fault trees, common-cause/dependent-failure analysis, reliability, diagnostic coverage and safety requirements |
| Cybersecurity engineering | Threat modelling, threat analysis and risk assessment, attack trees, security requirements, mitigations and security verification |
| Verification and validation | Plans, procedures, cases, execution records, acceptance criteria, results, coverage, anomalies and configured test articles |
| Software verification | Static analysis, coding standards, unit/integration tests, structural coverage including MC/DC, formal methods and model/code consistency checks |
| Real-time integration and test | Model-, software-, processor- and hardware-in-the-loop workflows, fault injection, data acquisition and communication-bus simulation/analysis |
| CAM and manufacturing engineering | Toolpaths, machining simulation, process planning, manufacturing BOMs, work instructions, tooling and production handoff |
| Inspection and quality | Metrology, inspection plans, tolerance analysis, nonconformance, corrective action and quality records |
| Lifecycle and configuration management | Product structures, BOMs, variants, revisions, baselines, changes, approvals and releases |
| Assurance and certification | Applicable objectives, compliance matrices, review records, evidence packages, assurance arguments and tool-qualification records |
| Project and technical management | Tasks, dependencies, resources, engineering risks, issues, review gates, supplier deliverables and technical maturity |
| Service and sustainment | Maintainability, service documentation, field failures, corrective action and feedback into controlled product changes |

## 4. Layered architecture

### User interfaces

- Browser and desktop interfaces should use the same domain semantics and command contracts.
- A common shell provides project navigation, module discovery, cross-module links and AI interaction.
- Each module can expose its own standalone interface.
- Desktop/offline support is a target. Define synchronization, conflict handling and supported offline workflows before promising full parity.
- Long-running geometry, simulation and verification jobs execute in suitable workers rather than blocking the interface.

### Module services and engines

- Each module owns its domain model, validation, commands, queries and persistence boundary.
- Other modules integrate through documented APIs and revision-qualified references, never through private database tables.
- Computational engines should be separable from presentation and, where practical, usable headlessly.
- Local execution, browser execution and remote workers may differ by workload. Record technology choices in architecture decision records rather than embedding unverified assumptions here.

### Shared platform services

| Service | Responsibility |
| --- | --- |
| Identity, authorization and entitlements | Users, projects, roles, module access and service-side permission enforcement |
| Product and configuration registry | Product identities, configurations, variants, revision references and released baselines |
| Traceability | Typed relationships between revision-specific engineering artifacts, link validation and impact traversal |
| Change and release workflows | Change proposals, review states, approvals, dependency checks and controlled release |
| Engineering records and evidence | Provenance, review records, test evidence, reproducibility manifests and retention |
| Jobs and execution | Scheduling, cancellation, isolation, execution environments and computational resource control |
| Integration and interchange | External-tool adapters, versioned import/export and validation of exchanged data |
| Search and projections | Derived indexes and cross-module views, with source revision and freshness recorded |

Shared services provide coordination without absorbing every module's domain logic.

### Storage and integration

- Use relational persistence for structured records, relationships and transactions where appropriate; use artifact storage for large models, meshes, binaries, datasets and results.
- Storage can initially be shared infrastructure with clear logical ownership. Independent deployment does not require immediate database-per-service complexity.
- Publish committed changes through reliable event delivery, such as a transactional outbox. Consumers must handle retries and duplicate delivery.
- Derived search/graph projections must be rebuildable from authoritative records.
- Cross-module operations need explicit consistency rules. Use atomic local transactions and recoverable coordinated workflows; do not imply a global transaction where none exists.

## 5. Authoritative engineering definition

There is one controlled product definition assembled from authoritative module-owned artifacts, not one universal object containing every discipline's data.

Define common contracts for:

- Stable artifact identity, artifact type, owning module and immutable revision identity.
- Product configurations and baselines that pin exact artifact revisions.
- Units, dimensions, tolerances, uncertainty and coordinate/reference frames.
- Typed relationship semantics: for example satisfies, verifies, allocates, derives-from and depends-on.
- Parameter ownership, permitted update direction and conflict resolution.
- Provenance, authorship, timestamps, status and review records.
- API/schema versions and compatibility/migration behaviour.

References must distinguish an exact revision from a deliberate latest-working reference. Released evidence must not silently follow later edits. Relationship meaning and applicable revision ranges must be explicit.

Never convert an assumption into a requirement or a simulation prediction into verified product performance without the corresponding review and evidence.

## 6. AI architecture

The AI interface maintains derived interpretations of the product: design intent, summaries, candidate architectures, assumptions and exploration history. These interpretations support reasoning but do not override the engineering records.

1. Retrieve authorized, relevant artifacts with their revisions and provenance.
2. Identify hard requirements, interface contracts, assumptions and open design variables.
3. Propose alternatives within those constraints.
4. Validate proposed changes through domain commands and relevant analyses.
5. Present affected artifacts, constraint violations, assumptions and evidence.
6. Apply changes within the user's authorized scope, using controlled transactions or change workflows.
7. Preserve an audit record and invalidate or refresh affected derived interpretations.

User actions, AI actions and automation must use the same validation and permission boundaries. AI-generated code or models are proposals until the relevant checks pass. Use provider-independent adapters so model selection does not become a domain dependency. Record model/tool versions and execution provenance where needed for reproducibility.

## 7. Safety-critical development and assurance

Support applicable aerospace and automotive development processes through configurable objective sets and evidence workflows. Select standards, editions and project applicability explicitly; do not hard-code one assurance process across all products.

The platform must support:

- Bidirectional traceability from requirements and hazards to design, implementation, verification and evidence.
- Review independence where the applicable process requires it, with role separation and approval records.
- Versioned safety analyses linked to the configurations they assess.
- Reproducible analysis/test runs recording inputs, tool versions, settings, execution environments and results.
- Change-impact analysis and explicit marking of stale or potentially invalid evidence.
- Controlled release, anomaly tracking, audit history and recovery.
- Interoperation with established tools when a capability is not yet available internally.

Supporting a safety-critical workflow does not automatically qualify the platform or establish product compliance. Qualification needs depend on intended tool use, reliance on its outputs and the applicable assurance process. Treat qualification baselines and evidence as a distinct roadmap item. Clearly separate exploratory AI functions from functions relied upon for certification credit.

## 8. Module repositories and agent development

The intended direction is independently developable modules, potentially in separate repositories, plus a platform shell and a small shared-contracts package. Confirm repository topology against release and integration needs before migration.

- Each module owns a versioned API/schema, tests, documentation and standalone execution path.
- Share contracts and necessary utilities; avoid a shared library that becomes the entire product.
- Contract changes need compatibility review and consumer tests.
- Give parallel agents bounded tasks, file ownership, acceptance criteria and isolated worktrees where appropriate.
- Assign an integration owner for shared changes and cross-module verification.
- Keep AGENTS.md/CLAUDE.md concise. Link to module specifications and decisions rather than copying the full vision into each instruction file.

## 9. Original implementation and dependencies

Develop from public specifications, authorized documentation, research and observed behaviour. Do not copy proprietary code, shaders, restricted assets, branding or confidential implementation material. Public accessibility alone does not establish reuse permission.

Use established libraries and external solvers when licensing permits the intended use and distribution. Record provenance, versions and licenses; preserve attribution. Do not cosmetically rewrite restricted code to disguise its origin. Do not claim a formal clean-room process without evidence that the process meets that description.

## 10. Proposed delivery sequence

| Phase | Scope and exit condition |
| --- | --- |
| Foundation and initial modules | Requirements, SysML and CAD; shared identities, minimal baselines/traceability, validated commands and recorded verification. Demonstrate one end-to-end cross-module workflow. |
| Assurance foundation | Expand V&V, changes/releases, safety/reliability, cybersecurity and evidence workflows. Demonstrate change impact and evidence invalidation on a pinned configuration. |
| Executable engineering | Mathematics, statistics, control/system modelling and analysis integration. Demonstrate reproducible runs linked to requirements and exact input revisions. |
| Implementation and integration | Electronics, harnesses, programmable hardware, software verification and real-time test integrations. Demonstrate traceable implementation and integration results. |
| Production and lifecycle | CAM, manufacturing, quality, project-management extensions and sustainment. Demonstrate a controlled design-to-production handoff and feedback loop. |

This sequence is a proposed priority order, not a delivery commitment. External adapters can enable useful workflows before equivalent internal tools exist.

## 11. Architecture acceptance principles

- A module remains usable without installing the complete suite.
- A baseline identifies the exact engineering definition assessed or released.
- A test result identifies the requirement revision, configured article and procedure/run that produced it.
- Changes expose affected dependencies and stale evidence.
- Equivalent user and AI commands enforce equivalent domain rules.
- Interchange failures are visible; data is not silently discarded.
- Numerical and geometry correctness use independent references and representative cases.
- The interface labels implemented, experimental and planned capabilities honestly.

## 12. Documentation placement

This consolidated document can initially live at `docs/architecture-vision.md`.

As the project grows, maintain `docs/product-vision.md` for outcomes and capabilities, `docs/architecture.md` for approved architecture, `docs/roadmap.md` for delivery priorities, `docs/modules/<module>.md` for module specifications, and `docs/decisions/` for architecture decision records. Keep one authoritative location for each decision and link between documents.

Open decisions include technology stack confirmation, repository topology, local/cloud execution boundaries, offline synchronization, detailed shared schemas, standards applicability and qualification strategy. Resolve these through focused decisions rather than inferring them from this vision.
