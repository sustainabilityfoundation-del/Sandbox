# ADR-0035: SysML Modeler — views are projections; v1 diagrams are labelled compatibility presentations

Status: Proposed (2026-10-14, SysML agent)

## Context

Brief §5.E: diagrams must be projections of the semantic model; distinguish standard SysML v2 views from
legacy v1 diagram compatibility; do not assume v1 diagrams map directly to v2 notation.

## Decision

- Each view is a pure function `project(model, viewRoot, options) → graph` in the tool, recomputed on
  every model change. Layout (elkjs, EPL-2.0, unmodified) produces positions; positions and visibility
  are private view state, never model elements.
- Phase 2 implements the SysML v2 General View and Interconnection View presentations; later phases add
  Action Flow, State Transition, Sequence, Grid (tables/matrices) and Browser views.
- Saved viewpoints will be SysML `view` usages (with `expose`) in the model, i.e. standard elements.
- SysML v1 diagram kinds (BDD, IBD, activity, state machine, sequence, requirements, parametric, package,
  use case) are offered later as compatibility presentations of these projections, each labelled and
  documenting what it omits.

## Consequences

- No diagram can disagree with the model; deleting a diagram never deletes engineering data.
- Hand-placed layouts need a presentation store later (Phase 3+); until then auto layout is used.
