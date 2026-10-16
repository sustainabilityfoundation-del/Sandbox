# Roadmap

Updated: 13 October 2026

Delivery priorities, following the proposed sequence in the
[architecture vision §10](architecture-vision.md#10-proposed-delivery-sequence). This is a priority
order, not a delivery commitment. The in-app "About this platform" dialog
(`apps/workspace/src/platform/capabilities.ts`) shows the same status and must be kept in step.

## Delivery through short sprints

Each phase is delivered through small usable increments, following the
[development workflow](development-workflow.md). Plan each sprint with explicit acceptance
criteria using the [sprint template](sprints/template.md). Keep `main` runnable and provide an
exact committed checkpoint, verification results and an owner walkthrough at sprint end.
Owner feedback informs subsequent priorities; pending review is not recorded as acceptance.
This is a development policy, not a claim that automated CI enforcement is already configured.

## Phase 1: Foundation and initial modules (current)

Exit condition: Requirements, SysML and CAD; shared identities, minimal baselines and traceability,
validated commands and recorded verification; one end-to-end cross-module workflow.

| Item | Status |
| --- | --- |
| Requirements management (statements, rationale, status, allocation, history) | Implemented |
| Help system: Help menu, Help Centre, F1, tutorials, API reference, assistant access (Requirements documented; SysML and CAD pending) | Implemented (sprint 005) |
| Requirements service: PostgreSQL API, collections, attributes, reviews, requirement baselines, quality checks, ReqIF exchange | Implemented (sprint 001; see [progress](specifications/requirements-management-progress.md)) |
| Conceptualize: concepts, decomposition, alternatives, trade studies, decisions, evidence, implementations | Implemented (see [progress](specifications/conceptualize-progress.md)) |
| System Model: SysML v2 textual subset, versioned repository, validation, views, requirement links | Experimental (Phase 1 and first Phase 2 slice; [conformance](modules/sysml/conformance.md)) |
| SysML modelling, illustrative tool (subset: parts, requirement usages, connections, satisfy; not SysML v2 compliant) | Retired from the interface ([ADR-0077](decisions/0077-retire-illustrative-tools-system-model.md)); package and data kept |
| CAD Modeler: Open CASCADE kernel, sketches with constraints, extrude, revolve, regeneration, STEP export | Experimental (Phase 1; [CAD roadmap](modules/cad/roadmap.md)) |
| Mechanical CAD, mock tool (mock geometry kept for existing workflows) | Retired from the interface (ADR-0077, amends ADR-0027 phase 4); package and data kept |
| Design reasoning layer: architecture and proposed ADRs 0039–0046 | Proposed; libraries integrated: validation prototype (R1) and calculation engine (R3) in `packages/design-reasoning-core`, `packages/engineering-calc`; actuator and new-project scenarios tested against the real Conceptualize and Requirements APIs (`npm run reasoning:test:db`), calculation storage steps adapter-backed until CR-C8; no service or UI yet |
| AI connection: provider-neutral backend, own OpenAI account (API key, or Sign in with ChatGPT when run locally), Settings centre with server-enforced AI access policy | Integrated and tested against a fake provider; live provider not verified ([brief](specifications/ai-connection.md)) |
| Shared identities, `represents` links, explicit cross-tool mapping | Implemented |
| Module ownership and delegation, enforced in the repository | Implemented |
| Typed relationship validation | Implemented |
| Revision history and exact revision references | Implemented |
| Baselines and comparison with the working model | Implemented (minimal) |
| Change impact (links, dependent and referencing artifacts, baselines) | Implemented (minimal) |
| Recorded verification (requirement revision, configured article, procedure/run) | Implemented (minimal) |
| End-to-end cross-module workflow | Implemented (test: `apps/workspace/src/platform/platform.test.ts`) |
| AI assistant through the same command boundary | Experimental (labelled demo planner by default; real model when the user connects an account); headless operation boundary in progress ([milestone 1](specifications/integration-milestone-1.md) C9) |
| Subscriptions and entitlements | Prototype only (client side) |
| One durable engineering project across the real modules | In progress ([integration milestone 1](specifications/integration-milestone-1.md)) |

Remaining in Phase 1:

- AI capability inventory and shared operation coverage for initial tools, followed by authenticated
  provider integration and durable design briefs/tasks. See the proposed
  [AI development plan](modules/ai-interface/development-plan.md). Research, concept galleries and
  real CAD/STL workflows depend on later implementations; the current assistant stays experimental.

- Server-side repository and authorization (see open decisions).
- Requirement hierarchy and reviews; baselines cannot be released or locked yet.

## Phase 2: Assurance foundation (planned)

Expand verification and validation (plans, procedures, cases, coverage, anomalies), changes and
releases, safety and reliability, cybersecurity and evidence workflows. Exit: change impact and
evidence invalidation on a pinned configuration.

### Deferred epic E-ASSURE: Standards-aware development assurance and safety engineering

Status: **Deferred** (recorded 15 October 2026). Not a prerequisite for the current demonstration
([D1](specifications/demo-ai-engineering.md)) or [integration milestone 1](specifications/integration-milestone-1.md).
Architecture boundaries: [ADR-0070](decisions/0070-development-assurance-boundaries.md); vision
[§7](architecture-vision.md#7-safety-critical-development-and-assurance). This section is the single backlog entry
for the epic; other documents link here.

Intent: a common engineering and assurance foundation with selectable, versioned **industry profiles** layered
over the platform. Candidate profiles for future evaluation (not interchangeable, and not claims of compliance;
exact editions, applicability and obligations need review against authoritative, appropriately licensed texts):

| Domain | Candidate standards |
| --- | --- |
| Aviation | ARP4754A/B; companion ARP4761 safety assessment; interfaces to software and electronic-hardware assurance workflows |
| General functional safety | IEC 61508 |
| Automotive | ISO 26262; ISO 21448 (SOTIF) |
| Railway | EN 50126, EN 50129, EN 50716 (legacy project support as needed) |
| Medical devices | ISO 14971; IEC 62304 |
| Machinery | ISO 12100; ISO 13849; IEC 62061 |
| Process industries | IEC 61511 |
| Nuclear instrumentation and control | IEC 61513 and supporting standards |
| Space | Relevant ECSS engineering, safety and product-assurance standards |
| Cross-industry | ISO/IEC/IEEE 15288 (lifecycle processes); ISO/IEC/IEEE 15026 (assurance cases) |
| Cybersecurity (future) | Sector frameworks such as ISO/SAE 21434 |

Future capabilities:

| # | Capability | Builds on (existing contracts) |
| --- | --- | --- |
| A1 | Safety assessment and risk-control traceability | Typed, revision-pinned relationships (ADR-0004, milestone C3); Conceptualize assumptions and decisions |
| A2 | Validation and verification planning, execution and evidence | Verification records pinned to requirement revision and configuration (ADR-0007); evidence qualifications (C11) |
| A3 | Assurance cases, objective-compliance matrices, certification deliverables | Project baselines and export packages (C6, ADR-0064) |
| A4 | Standards applicability, tailoring, reviewed cross-standard mappings | Settings framework for project-scoped profile selection (ADR-0048); profiles as versioned data |
| A5 | Configuration-specific evidence reuse and change-impact assessment | Exact revision references, baselines, possible vs demonstrated impact (ADR-0046) |
| A6 | Lifecycle feedback from operational incidents, maintenance and field changes | Project registry and artifact registry (ADR-0060–0062) |

Out of scope until the epic is scheduled: certification dashboards, rules engines, profile content, standards
research beyond this list, and any universal conversion between DAL, ASIL, SIL, Performance Level or medical
software safety classes.

## Phase 3: Executable engineering (planned)

Mathematics, statistics, control and system modelling, analysis integration. Exit: reproducible runs
linked to requirements and exact input revisions.

## Phase 4: Implementation and integration (planned)

Electronics, harnesses, programmable hardware, software verification, real-time test integration.

## Phase 5: Production and lifecycle (planned)

CAM, manufacturing, quality, project management extensions and sustainment.

None of the Phase 2–5 domains appears as a working tool. They are listed as "Planned, not
available" in the capabilities dialog only.

## Open decisions

Tracked in [decisions/README.md](decisions/README.md#open-decisions).
