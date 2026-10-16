# Module: Parametric Mechanical CAD

Package: `packages/tool-cad` (version 1.0.0, SDK `^1.0.0`, entitlement `tool:cad`).
Status: **Retired from the interface** (ADR-0076, 16 October 2026; amends ADR-0027 phase 4): the mock tool is no longer registered, shown or offered to the AI; the package, the twin data (`cad-representation`, dimension delegation) and the ID `cad` are kept. The CAD tool users see is the CAD Modeler. Historical specification follows (mock geometry, no CAD kernel). Working rules:
[AGENTS.md](../../packages/tool-cad/AGENTS.md).

## Owns

- `cad-representation` objects and their dimensions.
- `represents` relationships from CAD representations to components.
- Delegation: may update `diameter`, `outerDiameter`, `length` and `effectiveLength` on parts and
  assemblies (`DELEGATIONS` in `packages/model-service/src/domain/ownership.ts`).

## Parameter ownership and update direction

A dimension edit changes the CAD representation and, in the same atomic batch, the mapped property
of the component it represents: `diameter → diameter`, `outerDiameter → outerDiameter`,
`length → effectiveLength` (or `length`). The direction is CAD → component only. A component
property changed elsewhere is not pushed back into the CAD representation; there is no
synchronisation with SysML.

## Capabilities

Side elevation of the actuator assembly; selectable housing, rod and motor; Dimensions panel with
unit and range validation; Visibility panel; representation snapshots saved as artifacts.

## Assistant actions

`cad.read_representation`, `cad.set_dimension` (same unit, range and ownership rules as the UI).

## Not in scope yet

Geometry kernel, sketches, features, drawings, tolerances, materials beyond a text property,
import and export. Geometry correctness has no independent reference yet.
