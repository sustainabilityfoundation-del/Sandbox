# AGENTS.md: @ews/tool-cad-modeler

The CAD tool (`cad-modeler`, entitlement `tool:cad`, contracts §1). Owner: CAD agent.
Separate from the mock CAD tool (`packages/tool-cad`), which must not be edited.

## Responsibilities

- View (`CadModelerView.tsx`): panels Model / Edit / Inspect / Diagnostics, 3D viewport
  (`ui/Viewport.tsx`, three.js, meshes from the kernel worker), sketch stage (`ui/SketchStage.tsx`: drawing bar and
  click-to-draw state; `ui/Sketcher.tsx`: SVG view; `ui/sketchDraw.ts`: snapping and the clicks-to-commands mapping,
  unit-tested without a DOM); Diagnostics with Repair reference (`ui/DiagnosticsPanel.tsx`).
- Toolbar (`index.ts`): New, Open, Save, Sketch, Extrude, Revolve, Undo, Redo, Fit, Check against constraints (result in Diagnostics, `checkRun.ts` shared with the assistant), Export STEP.
- Session (`session.ts`): open documents (`CadEngine`), active document, kernel (Web Worker by
  default), downloads. Shared by the view and the assistant.
- Assistant (`assistant.ts`): `cad-modeler.*` actions; reads as data, mutations as service
  proposals with dry-run previews; labelled demo planner.
- Help (`help/*.md`, `src/help.ts`): every toolbar item and operation mapped.

## Permitted dependencies

`@ews/platform-sdk` (+ `/react`, `/harness`, `/testing` in tests), `@ews/design-system`,
`@ews/cad-core`, `@ews/cad-kernel`, three (MIT), React. Never another tool, `apps/workspace`,
`@ews/model-service`, localStorage, React Aria or icon packages directly; never replicad (kernel only).

## Rules

- Every model change goes through `CadEngine.execute` with commands (`ui/common.tsx` `makeRun`).
- Design system components and tokens only; CSS in `src/modeler.css` inside `@layer components`,
  container queries against `tool`; no essential action depends on dragging or hover (forms and
  keyboard alternatives exist for drawing, picking and view control).
- Update help pages, the capability inventory entries and the requirements status with every feature.

## Commands

```bash
npm run cad:dev                      # harness on :5198
npx vitest run packages/tool-cad-modeler
npm run typecheck -w @ews/tool-cad-modeler
```

## Open-source first (mandatory)

Before designing or coding a new engineering capability, search for established open-source implementations. Prefer integration and contribution over recreation. Document the alternatives considered, license implications, integration strategy, and rationale for any custom implementation ([strategy](../../docs/architecture/OPEN_SOURCE_STRATEGY.md), [evaluation template](../../docs/architecture/open-source-evaluation-template.md), root [AGENTS.md](../../AGENTS.md)).
CAD assignment (strategy §10): evaluate Open CASCADE, FreeCAD, geometric constraint solvers, meshing libraries and interoperability components; avoid custom geometric kernels or solvers where established alternatives meet requirements.
Capability-complete toolbars (mandatory, owner directive, [directive](../../docs/architecture/CAPABILITY_TOOLBARS.md)): keep this module's full target capability inventory (implemented, partial, planned) in its manifest with evidence for each status; planned commands are shown muted and explained, never executed, and never report success.
