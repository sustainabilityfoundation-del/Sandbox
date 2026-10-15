# User-interface architecture

Status: Proposed (ADR-0035). Implementation: `packages/tool-sysml-modeler`.

## 1. Principles

1. **Views are projections.** Every diagram, table and tree is computed from the semantic model at a
   commit. Nothing a person drags or styles becomes engineering truth; layout positions are
   presentation data (private view state now; persisted presentation records later), never elements.
2. **One command path.** Every edit (inspector field, create button, diagram action, text apply) builds
   typed commands and submits them as a transaction; the same commands the assistant proposes.
3. **Text and graphics are peers.** The textual notation of the selected namespace is always one tab
   away; applying text is a command that keeps element IDs (reconciliation, ai-commands.md §4).
4. **SysML v2 views first, v1 familiarity second, and labelled.** Standard SysML v2 views (General,
   Interconnection, Action Flow, State Transition, Sequence, Grid, Browser — the standard view
   definitions of the SysML v2 view library) are the primary notation. SysML v1 diagram kinds are
   offered as *compatibility presentations* of those projections and always labelled as such
   (§4); they are not a second model.
5. **Platform rules.** Design-system components only, tokens only, phone/tablet/desktop, both themes,
   keyboard access, no essential action that needs hover, right-click or dragging.

## 2. Layout of the tool

```
┌ toolbar: project/branch · Add ▾ · Validate · Undo last · View: General | Interconnection | Text · Fit ┐
├──────────────┬─────────────────────────────────────────────────────────┬───────────────────────────┤
│ Model browser│  View area (tabs: Diagram · Text · Validation · History) │ Properties (inspector)    │
│ search,      │  diagram: SVG, auto layout (ELK layered), zoom/pan,      │ name, short name, kind,   │
│ metaclass    │  click/keyboard select, "show owned", "open as view root" │ typing, specialization,   │
│ filter,      │  text: namespace text, Dry run → change preview, Apply   │ multiplicity, direction,  │
│ containment  │  validation: diagnostics list → select element           │ value, documentation,     │
│ tree (lazy)  │  history: commits with provenance, Undo                  │ relationships (in/out)    │
└──────────────┴─────────────────────────────────────────────────────────┴───────────────────────────┘
```

Container queries collapse the three columns into a single column with a segmented control
(Browser · View · Properties) below the `tool` container's tablet width.

## 3. Components

| Component | Data source | Edits through |
| --- | --- | --- |
| Model browser | `children` of owners (core `Model` in the browser; lazy `children` endpoint for large models) | create/delete/move commands |
| Diagram — General View | definitions and usages under the view root: nodes (with compartments for attributes/ports/parts), edges for specialization, typing, composition (owned usages), satisfy, allocate, connections | contextual buttons → commands |
| Diagram — Interconnection View | a part definition or usage: its part usages as nested nodes, ports on the border, connections/interfaces/flows/bindings as edges between port/part ends | connect command |
| Text editor | serializer output for the namespace; parser for diagnostics while typing | `applyText` (dry run, then apply) |
| Property inspector | element + derived properties | rename, setShortName, setTyping, addSpecialization, setMultiplicity, setDirection, setValue, setDocumentation, delete |
| Validation panel | diagnostics of the head commit | navigation only |
| History | commits with actor, source, reason, counts | revert (undo) |

Layout: elkjs (EPL-2.0, unmodified, layered algorithm with ports and hierarchy), run in the browser;
results cached by (view root, model revision). A node's visible compartments are a view-state option.

## 4. SysML v1 diagram compatibility (planned, Phase 4)

| v1 diagram | Presented from | Notes |
| --- | --- | --- |
| BDD | General View filtered to definitions + composition/specialization edges, block-style compartments | "Block" = part definition; value properties = attribute usages |
| IBD | Interconnection View | Proxy/full ports both map to v2 ports; item flows = v2 flows |
| Activity | Action Flow View | Partitions/swimlanes ≈ allocation; pins ≈ action parameters |
| State Machine | State Transition View | Regions ≈ parallel states |
| Sequence | Sequence View (occurrences, messages) | |
| Requirements | General View of requirements, satisfy/derive/verify | Requirement text comes from Requirements |
| Parametric | Interconnection of constraint usages with bindings | |
| Package | General View of packages and imports | |
| Use Case | General View of use cases with actors/subjects | |

The mapping is not one-to-one (B§5.E); each presentation states what it omits.

## 5. Accessibility and devices

Tree: `role="tree"`/`treeitem`, arrow keys, Enter selects, `*` expands. Diagram nodes are focusable
(`tabIndex`, Enter selects, arrow keys move between nodes in layout order); every diagram action is
also a toolbar/inspector action. Text editor: design-system `TextField` (multiline), monospace via
tool CSS. No syntax highlighting yet (risk R-08); diagnostics are listed with line/column and a
"go to" that places the caret.
