# Faber Architecture Directive: Open-Source-First Engineering Platform

Status: **owner directive, 16 October 2026; standing architectural requirement for every agent and module.** The text from
section 1 onwards is the owner's directive as issued. The repository notes at the end map it onto what exists today; they do
not change it.

- Document type: Architecture Brief and Standing Development Directive
- Priority: High; applies to all current and future modules
- Audience: lead architect, coordinating agent, module agents, development agents and code-review agents

## 1. Mission

Faber shall be developed as a commercially viable, proprietary multidisciplinary engineering platform that maximizes the
adoption, integration, improvement, and contribution to established open-source software.

The governing principle is: **Do not recreate mature engineering functionality when a suitable open-source implementation
already exists.**

Faber's competitive differentiation shall come primarily from its unified engineering information model, AI orchestration,
conceptual design capabilities, engineering reasoning, cross-disciplinary integration, and user experience, not from
unnecessarily recreating mathematical solvers, CAD kernels, visualization engines, or other established foundations.

Open-source adoption shall be a mandatory consideration in every architectural and implementation decision.

## 2. Commercial and licensing strategy

Faber shall adopt an open-source-first, commercially sustainable architecture. The following boundaries shall be maintained:

- **Proprietary platform:** AI orchestration, design reasoning, integrated engineering workflows, commercial services, and
  other Faber-owned differentiating capabilities.
- **Open interfaces:** public API specifications, module SDKs, engineering data interchange schemas, solver interfaces, and
  interoperability adapters where appropriate.
- **Open-source foundations:** established mathematical, geometric, simulation, visualization, database, and engineering
  libraries.

Commercial use of open-source software is permitted, subject to applicable license obligations.

### License preference hierarchy

| Category | Licenses | Policy |
| --- | --- | --- |
| Preferred | MIT, BSD, Apache 2.0 | Adopt where technically appropriate |
| Conditional | LGPL, MPL, EPL | Adopt after compliance review |
| Restricted review | GPL, AGPL | Require explicit architecture and licensing approval |
| Commercial | Dual-license, proprietary SDKs | Evaluate commercial terms and cost |
| Prohibited | Unlicensed code, incompatible or unverifiable dependencies | Do not incorporate |

No agent shall assume that using an API, separate process, container, or microservice automatically eliminates copyleft
licensing obligations.

SaaS deployment, desktop distribution, static linking, dynamic linking, and modification of dependencies must be considered
individually.

## 3. Mandatory open-source evaluation

Before implementing any significant new capability, agents shall:

1. Identify existing open-source projects offering comparable functionality.
2. Evaluate at least three credible alternatives where available.
3. Compare functionality, maturity, performance, maintainability, documentation, licensing, and community activity.
4. Assess compatibility with Faber's modular architecture and common engineering information model.
5. Recommend adopting, extending, integrating, or developing functionality internally.
6. Document the decision in an Architecture Decision Record (ADR).

Custom development is justified when suitable existing implementations cannot satisfy essential requirements, present
unacceptable integration or licensing constraints, or prevent necessary product differentiation.

Agents shall not use custom development merely because it is easier to generate new code than understand an existing library.

## 4. Open-source technology assessment

The coordinating architect shall commission evaluations of the following technologies.

| Domain | Initial candidates |
| --- | --- |
| Numerical mathematics | NumPy, SciPy, Eigen |
| Symbolic mathematics | SymPy |
| Mathematical optimization | NLopt, HiGHS, OSQP |
| CAD geometry kernel | Open CASCADE Technology |
| Parametric CAD | FreeCAD, SolveSpace |
| Finite element analysis | CalculiX, Code_Aster, FEniCSx |
| Computational fluid dynamics | OpenFOAM |
| 3D rendering and visualization | three.js, VTK |
| Meshing | Gmsh |
| SysML and model-based engineering | Eclipse SysON, Eclipse Papyrus |
| Requirements management | Eclipse RMF, ReqIF-related libraries |
| Engineering workflow orchestration | Open-source workflow engines |
| Relational database | PostgreSQL |
| Graph data and relationships | Apache AGE, suitable graph libraries |
| API documentation | OpenAPI, AsyncAPI |
| Scientific computing environments | Jupyter, GNU Octave as an optional external engine |

These are research candidates, not preapproved dependencies. Agents shall verify current licenses, compatibility, and technical
suitability before adoption.

Existing Faber implementations shall not be replaced solely because an open-source alternative exists. Replacement must
demonstrate a meaningful architectural, functional, performance, or maintenance benefit.

## 5. Integration architecture

External libraries and applications shall be accessed through clearly defined interfaces. Each integration shall support,
where appropriate:

- Versioned APIs and stable contracts.
- Replaceable implementation backends.
- Defined input/output schemas and unit systems.
- Explicit error handling and diagnostics.
- Deterministic execution where required.
- Testable integration boundaries.
- Local and cloud execution.
- Provenance, dependency versions, and calculation traceability.
- Security and isolation for externally executed code.

A Faber mathematical operation, for example, should invoke an abstract mathematical service rather than depend directly on a
particular solver throughout the application. The architecture should permit alternative solver implementations without
changing the consuming engineering modules. The same principle shall apply to geometry kernels, simulation engines,
optimization algorithms, and visualization backends.

## 6. Unified engineering information model

Open-source components shall not independently become competing sources of truth for engineering information. Faber's unified
information model shall remain authoritative for:

- Engineering concepts and design intent.
- Requirements and verification relationships.
- SysML system definitions.
- CAD geometry and parametric relationships.
- Mathematical definitions and assumptions.
- Simulation configurations and results.
- Engineering decisions and rationale.
- Configuration, revisions, and provenance.

External tools shall consume and produce engineering artifacts through controlled interfaces. Where possible, standard exchange
formats shall be preferred over proprietary representations. The information model shall support loss-aware import/export and
retain sufficient metadata to identify transformations, assumptions, and limitations.

## 7. Open-source contribution policy

Faber shall be an active participant in the open-source engineering community. Agents shall identify opportunities to
contribute: bug fixes, performance improvements, additional engineering algorithms, interoperability improvements, file-format
support, automated tests, documentation, and general-purpose engineering utilities.

Where practical, upstream contribution shall be preferred to maintaining long-lived private forks.

However, **agents shall not publish code, create public repositories, submit upstream pull requests, or disclose proprietary
architecture without explicit authorization.** All proposed contributions shall undergo licensing, intellectual property,
security, and commercial sensitivity review.

## 8. Software supply chain governance

The coordinating agent shall establish a dependency governance system. Maintain a machine-readable dependency register
identifying:

- Dependency name and upstream repository.
- Version and license.
- Direct and transitive dependencies.
- Modules consuming the dependency.
- Integration and distribution methods.
- License obligations and approval status.
- Known vulnerabilities.
- Upstream maintenance status.
- Available updates.
- Local modifications and upstream contribution status.

Implement automated Software Bill of Materials (SBOM) generation and license checks in CI. Use appropriate software composition
analysis tooling and flag incompatible, unknown, or restricted licenses before merging changes.

License notices, attribution, corresponding-source obligations, and other distribution requirements shall be tracked as release
deliverables.

## 9. Responsibilities of the coordinating agent

The lead coordinating agent shall:

1. Read and adopt this directive as a standing architectural requirement.
2. Update `AGENTS.md` and relevant architecture guidance so every development agent receives the policy.
3. Establish a reusable open-source evaluation template.
4. Create an initial dependency and licensing inventory.
5. Assign each module agent responsibility for reviewing open-source alternatives within its domain.
6. Maintain a centralized register of selected open-source foundations.
7. Identify duplicate functionality being independently implemented by different agents.
8. Coordinate shared libraries and common service interfaces.
9. Maintain licensing and dependency governance.
10. Review architectural compliance before major module implementations are accepted.

### Mandatory instruction for all module agents

> Before designing or coding a new engineering capability, search for established open-source implementations. Prefer
> integration and contribution over recreation. Document the alternatives considered, license implications, integration
> strategy, and rationale for any custom implementation.

This instruction shall be included in agent onboarding, module architecture files, task templates, and code-review guidance.

## 10. Agent-specific assignments

- **CAD agent:** evaluate Open CASCADE, FreeCAD, geometric constraint solvers, meshing libraries, and interoperability
  components. Avoid creating custom geometric kernels or solvers where established alternatives meet requirements.
- **SysML agent:** evaluate existing SysML v2 implementations, modeling frameworks, graph libraries, and visualization
  components. Preserve compatibility with the official SysML v2 specifications and published APIs.
- **Requirements agent:** evaluate existing requirements-management frameworks, ReqIF implementations, traceability mechanisms,
  and validation libraries.
- **Mathematics and simulation agents:** prefer mature numerical, symbolic, optimization, and simulation engines. Implement
  solver-neutral interfaces with explicit unit handling and result provenance.
- **Conceptualize and AI agents:** investigate reusable open-source reasoning, search, graph, visualization, and orchestration
  infrastructure while preserving Faber's proprietary design reasoning and cross-module intelligence.
- **UI agent:** prefer established open-source UI components, editors, visualization frameworks, icon libraries, and
  accessibility tooling. Avoid unnecessary custom controls.
- **Infrastructure agent:** establish dependency scanning, license compliance, SBOM generation, secure package management, and
  reproducible builds.

## 11. Implementation sequence

**Phase 1: architecture and policy.** Review the existing repository and dependencies. Establish licensing rules and approval
procedures. Update `AGENTS.md` and module instructions. Publish the open-source evaluation template. Produce the initial
integration assessment.

**Phase 2: module assessments.** Assign open-source research to each module agent. Identify current duplicated or unnecessarily
custom functionality. Recommend integrations and reusable shared components. Create ADRs and prioritized backlog entries.

**Phase 3: controlled integration.** Integrate approved libraries through stable interfaces. Introduce automated compliance and
regression testing. Benchmark functionality and performance. Preserve existing working demonstrations.

**Phase 4: ecosystem development.** Publish approved interfaces and SDKs. Establish upstream contribution workflows. Encourage
third-party extensions. Evaluate opportunities for university and research collaboration.

## 12. Immediate execution instructions

The coordinating agent shall begin by reviewing the existing Faber architecture and reporting:

1. Which current components already depend on open-source software.
2. Which components are being unnecessarily developed from scratch.
3. Which open-source projects offer the greatest immediate development advantage.
4. Any material licensing or intellectual property risks.
5. The recommended target architecture and migration priorities.
6. The documentation and agent instruction changes required.

Create tracked backlog tasks for the approved improvements.

**Do not interrupt the primary development objective:** demonstrating a complete AI-driven engineering workflow from
conceptualization through requirements, systems modeling, mathematical reasoning, and CAD output. Open-source integration work
shall support and accelerate that objective rather than delay it through unnecessary refactoring.

## 13. Acceptance criteria

This architecture directive is considered implemented when:

- All active agents receive the open-source-first instruction.
- New engineering capabilities require documented build-versus-integrate decisions.
- A central dependency and license register exists.
- CI identifies unreviewed or incompatible dependencies.
- Shared integration interfaces are documented.
- Open-source opportunities are incorporated into module backlogs.
- Proprietary commercial boundaries are preserved.
- The end-to-end engineering demonstration remains the primary delivery priority.

**Final governing principle:** Faber shall build its commercial advantage by integrating, orchestrating, and extending the
world's best engineering technologies, not by unnecessarily reproducing them.

---

## Repository notes (coordinator, 16 October 2026)

These notes connect the directive to the repository. They are not part of the directive and do not change it.

- **Primary objective unchanged.** [Demonstration D1](../specifications/demo-ai-engineering.md) stays the delivery priority
  (section 12). Open-source work is scheduled so that it does not block D1 or the module-registration migration in progress.
- **Existing records this directive builds on.** The human-readable dependency list with licences is
  [docs/dependencies.md](../dependencies.md); the machine-readable register required by section 8 does not exist yet. The OCCT
  kernel decision is [ADR-0021](../decisions/0021-cad-geometric-kernel-occt-wasm.md) (held for the owner on LGPL-2.1 suitability, section 2
  "Conditional"); its licence notice ships as `apps/workspace/public/THIRD_PARTY_NOTICES.txt`. Development-assurance limits
  remain in [ADR-0070](../decisions/0070-development-assurance-boundaries.md).
- **Relation to existing rules.** "Preserve compatibility with the official SysML v2 specifications" (section 10) is a design
  goal; the AGENTS.md rule against *claiming* SysML v2 compliance in UI or docs still applies. Section 7's ban on publishing,
  public repositories and upstream pull requests without explicit authorization applies to every agent.
- **Status of the directive's tasks** (evaluation template, register, SBOM and licence checks in CI, module assessments, the
  section 12 report) is tracked in [docs/status/coordinator.md](../status/coordinator.md).
