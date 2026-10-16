# Visual concept exploration: coordinator contracts and ownership

Status: agreed by the coordinator, 15 October 2026. Brief (owner's text): [concept-visualization.md](concept-visualization.md).
Priority: part of the D1 path ([demo-ai-engineering.md](demo-ai-engineering.md)); it extends Conceptualize, it does not
replace the D1 workflow. Boundaries of [ADR-0070](../decisions/0070-development-assurance-boundaries.md) apply: an image
is never evidence, never verifies a requirement, never marks feasibility.

## 1. Placement

| Concern | Owner | Where |
| --- | --- | --- |
| Concept engineering definition: components (stable IDs), relationships, interfaces, parameters with units, functional intent, maturity stage (exploration, layout, engineering); reuse of existing functions, constraints, assumptions, questions, decisions, requirement links, implementations | Conceptualize agent | `services/conceptualize`, `packages/conceptualize-client`, `packages/tool-conceptualize` |
| Visual artifacts and their revisions: kind (`illustration`, `layout`; reserved: `mechanism`, `architecture`, `envelope-3d`, `motion`), source concept revision, status, provenance, outdated flag, not-to-scale flag; annotations (numbered pin or rectangle, normalized coordinates, instruction, exact visual revision, optional component ID); comparison of alternatives; selection and rejection with rationale through existing decisions | Conceptualize agent | same |
| Structured 2D layouts: a deterministic renderer (SVG) from the structured definition. Dimension labels come only from parameters; components carry stable IDs; always available, no provider needed | Conceptualize agent | `packages/tool-conceptualize` (renderer framework-free, testable) |
| Image generation: `services/visualization` (`@ews/visualization-service`, schema `visualization`, `/api/visualization/v1`): jobs (`pending`, `running`, `succeeded`, `failed`, `cancelled`), idempotency key derived from the request (concept revision, instruction, adapter, model, reference assets) so repeats never generate or charge twice, retry, cancel, per-item outcomes (one failure never discards other results), provider/model/instructions/reference assets/source concept revision recorded. Adapter registry; adapters receive only the context needed. Credentials stay on the server through a port to `services/assistant`'s credential store; no credential reaches the browser or Conceptualize | AI connection agent | `services/visualization` (new), `services/assistant` (credential port) |
| Binary assets (generated images, uploaded references) | host | the Project Management blob store (`BlobStore`, content-addressed) passed to `services/visualization` by `services/api`; Conceptualize stores asset references only |
| CAD handoff: a structured, revision-pinned package from the selected concept (parameters, interfaces, envelopes, constraints, requirement and decision links, unresolved items); CAD documents record the source concept and revision; missing information is reported, never invented | Conceptualize (package); CAD agent (consumption) | Conceptualize API and SDK read; `packages/tool-cad-modeler` |
| SDK additions (SDK 1.9): `ConceptsService` reads for the handoff and visuals, `PlatformServices.files` (CR-PM-SDK-4) if needed for references | coordinator applies, agents propose exact TypeScript | `packages/platform-sdk` |

No competing system model: SysML links go through existing `ArtifactRef`s. No placeholder images: when no generation
provider is available, the illustration action is refused with an explanation and the structured layout workflow keeps
working.

## 2. Assistant operations (shared with the UI)

Every human action is a domain operation the assistant can also call (headless, service proposals, same validation):
propose alternatives with visual requests (default 3, configurable), request an illustration (job), create or revise a
layout, add an annotation, refine from annotations (proposes concept changes; Apply creates a new concept revision and a
new visual revision; earlier annotations stay attached to their revision), compare, select or reject with rationale,
produce the CAD handoff. Region-to-component interpretation on raster sketches is an inference: ask when ambiguous.

## 3. Image generation provider

The AI connection agent determines from current official documentation which image generation the owner's connection
can use (Sign in with ChatGPT plan usage, or an API key) and documents configuration, expected costs and limitations
in `docs/modules/ai-interface/` and the help. Tests use a fake adapter that returns a deterministic test image clearly
marked as a test asset; it is never offered outside development and tests.

## 4. Acceptance (brief §10) and tests

Persistence (save, restart, reopen restores visuals, annotations, revisions, decisions), revision and dependency
behaviour (a parameter change marks dependent layouts, illustrations, handoffs and CAD documents possibly outdated, no
silent regeneration), generation failure handling (failed or cancelled items keep successful siblings; retries are
idempotent), dimension labels equal their source parameters, AI and UI use the same operations, the selected concept
reaches CAD with its requirement and decision links. Committed browser flow `tests/e2e/flows/concept-visual.mjs` using
the fake image adapter (labelled), plus database tests. Live generation with the owner's account is reported
separately and only after the owner agrees to the usage.

## 5. Ports and rules

Conceptualize: 5196, 5197, 8798, 54340. AI connection: 5202, 5203, 8801, 54343. Coordinator-owned files only in
`COORDINATOR REVIEW:` commits. Do not push. Never use the owner's connected account in automated tests (flows pin the
demo assistant; see `tests/e2e/lib/env.mjs` `demoAssistantContext`).
