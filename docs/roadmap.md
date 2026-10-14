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
| SysML modelling (subset: parts, requirement usages, connections, satisfy; not SysML v2 compliant) | Experimental |
| Parametric mechanical CAD (mock geometry, no CAD kernel) | Experimental |
| Shared identities, `represents` links, explicit cross-tool mapping | Implemented |
| Module ownership and delegation, enforced in the repository | Implemented |
| Typed relationship validation | Implemented |
| Revision history and exact revision references | Implemented |
| Baselines and comparison with the working model | Implemented (minimal) |
| Change impact (links, dependent and referencing artifacts, baselines) | Implemented (minimal) |
| Recorded verification (requirement revision, configured article, procedure/run) | Implemented (minimal) |
| End-to-end cross-module workflow | Implemented (test: `apps/workspace/src/platform/platform.test.ts`) |
| AI assistant through the same command boundary | Experimental (scripted demo; no provider) |
| Subscriptions and entitlements | Prototype only (client side) |

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
