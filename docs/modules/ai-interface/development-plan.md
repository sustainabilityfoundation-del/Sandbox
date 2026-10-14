# AI Interface: Claude development plan

Status: Proposed. Follow [development workflow](../../development-workflow.md) and the
[sprint template](../../sprints/template.md). Scope each sprint to one usable demonstrated outcome.

## Instructions before implementation

Read root and package AGENTS.md, [AI architecture](../ai-interface.md), [features](features.md),
[current architecture](../../architecture.md), ADR-0010 and the actual assistant/SDK code. Preserve
working functionality. No independent AI implementations of domain behaviour or direct storage access.
Contract additions require versioning, migration notes and consumer verification. Do not extract
packages or change the current preview policy without a reviewed design decision.

The drill-bit holder is demonstration/test content only. Implement general-purpose interface
acquisition, constraint management, concept exploration, CAD and export operations. Keep any
drill-specific fixtures in tests or optional demos, never in production domain schemas, commands,
UI or default project data. Counts and dimensions are task parameters, not hard-coded constants.

## Sprint sequence

| Sprint | Usable increment | Exit evidence |
| --- | --- | --- |
| 1 | Inventory and inspect AI capabilities | Owner can see implemented UI/backend operations and coverage gaps; proposed registry mapping does not mislabel mock features |
| 2 | Shared operations for one Requirements workflow | User and AI can create/edit/read a requirement with identical validation and persistence; existing UI still works |
| 3 | View controls through the same boundary | AI opens a tool, selects an object and changes a filter/camera in an identified view; another view is unaffected |
| 4 | Backend provider integration | Authenticated server validates permitted operations and invokes a replaceable provider; fake-provider and error paths pass; secrets remain server-side |
| 5 | Design brief and durable tasks | Conversation creates an inspectable brief; corrections, interruption and stale inputs are handled without losing constraints |
| 6 | Research-backed physical interface | General interface-definition workflow exercised with isolated test fixtures; sources, measurements, keep-outs and missing dimensions are explicit |
| 7 | Concept gallery and selection | User-specified concept count, stable IDs, comparisons, provisional labels and selection persistence; ten is a demonstration input only |
| 8 | Real CAD operations and geometric checks | Requires actual CAD kernel/engine integration: editable models, verified interfaces/keep-outs and recorded limitations using domain-independent operations |
| 9 | STL export and reproducible handoff | Native model plus validated mesh/export manifest; download, unit/scale checks and owner fit-review steps |
| 10 | Coverage expansion and scoped autonomy | Repeat per module; proposed autonomy policy separately reviewed and tested before replacing mandatory preview application |

Order may change with dependencies and user priorities. Real CAD/geometry work is a dependency,
not a capability the AI module can simulate into existence. Research and concept generation may use
external adapters; account/license availability and permissions must be explicit.

## Coverage inventory

Create a maintained inventory containing module, UI control/backend operation, semantic command/query,
read/write/view effect, input/output schemas, authorization, test evidence and implemented/planned status.
Start from current tool contributions and platform operations. Count coverage against the complete
inventory, not just whichever operations are already exposed to AI.

For each new capability, include discovery, validation, unauthorized/stale context, successful
execution, retries and error tests as relevant. For user-facing sprints, exercise the real workspace
and standalone harness, save the exact checkpoint and give the owner a walkthrough.
Include a second unrelated design scenario to expose example-specific assumptions. The application
must run without loading or installing the drill-holder demonstration.

## Initial task for Claude

Start with Sprint 1 only. Inspect and document coverage, then implement a small capability inspection
view using the existing architecture if feasible. Keep the main branch runnable. Do not scaffold all
future services. Report a committed checkpoint, checks, gaps and the next bounded outcome. Ask for
missing provider/setup decisions only when they block the sprint that actually needs them.

## Open decisions

- Registry shape and migration from current AssistantContribution; reuse current handlers where possible.
- Backend execution split, authentication and authorization (prototype currently validates in the client).
- Durable task persistence and job scheduling, cancellation and compensation boundaries.
- Provider selection, data routing, budgets and retained execution provenance.
- Authorized research providers, source licensing and user-upload handling.
- CAD kernel, native feature model, renderer, clearance validator and export implementation.
- Task authorization policy and its relationship to the current mandatory proposal preview.
- Cross-tool standards profiles and external AI/MCP access scope.
