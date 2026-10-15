# ews-cad native format specification (format 1.0.0)

Status: Proposed with ADR-0022. Machine-readable schema:
[`packages/cad-core/schema/ews-cad.schema.json`](../../../packages/cad-core/schema/ews-cad.schema.json)
(JSON Schema draft 2020-12). Reference implementation: `@ews/cad-core` (`validateDocument`,
`parseDocument`, `serializeDocument`). This specification is sufficient to implement a reader and
writer independently.

## 1. Encoding

- UTF-8 JSON; media type `application/vnd.ews.cad+json`; extension `.ewscad`.
- Canonical writer output: keys sorted, two-space indentation, trailing newline
  (`serializeDocument`). Readers must not depend on key order.
- Lengths in millimetres, angles in degrees (`units` is fixed in 1.x).

## 2. Top level

| Field | Type | Meaning |
| --- | --- | --- |
| `format` | `"ews-cad"` | Format identifier |
| `formatVersion` | semver string, major 1 | Readers accept any 1.x; they reject other majors |
| `documentId` | string (UUID) | Global identity; entity IDs are local to it |
| `version` | integer ≥ 0 | Incremented by every committed transaction, undo and redo |
| `nextId` | integer ≥ 1 | Next number for entity IDs (`<prefix>-<n>`); IDs are never reused |
| `units` | `{ length: "mm", angle: "deg" }` | Fixed |
| `metadata` | object | `title` (required), `description`, `createdAt`, `modifiedAt` (ISO 8601), `writer { tool, version }`, `properties` (string/number/boolean map) |
| `parts` | Part[] | Parts in the document |
| `references` | ExternalReference[] | Links from CAD entities to other modules |
| `assemblies`, `configurations` | empty arrays only | Reserved for later versions; non-empty values are rejected by 1.x readers |
| `extensions` | object | Namespaced data (`"vendor.key"`); preserved, otherwise ignored |

## 3. Part

`id`, `name`, `parameters[]`, `features[]` (history order = regeneration order), `semantics[]`,
optional `material { name, density (kg/m³) }`, optional `properties`.

**Parameter:** `id`, `name` (identifier `^[A-Za-z][A-Za-z0-9_]{0,63}$`, unique in the part, not a
function, constant or unit name), `expression` (string), `unit` (`mm` | `deg` | `none`),
`description`.

**Expressions** (also allowed wherever a value is an `Expr` = number or string): numbers, parameter
names, `+ - * / % ^`, unary minus, brackets, constants `pi`, `e`, functions `sin cos tan` (degrees),
`asin acos atan atan2` (degrees), `sqrt abs floor ceil round min max hypot`, and unit suffixes
`mm cm m in ft deg rad` converting into document units. Cycles are errors. Grammar: see
`packages/cad-core/src/expr/expression.ts`.

**SemanticAnnotation:** `id`, `kind` (`interface` | `functional-surface` | `design-intent` | `note`),
`name`, `targets[]` (stable face names, feature or parameter IDs), `description`.

## 4. Features

Common: `id`, `type`, `name`, optional `suppressed`.

**sketch:** `plane { kind: "standard", plane: "XY" | "XZ" | "YZ", offset?: Expr }`, `entities[]`,
`constraints[]`.

| Plane | Origin | x direction | normal |
| --- | --- | --- | --- |
| XY | (0,0,offset) | (1,0,0) | (0,0,1) |
| XZ | (0,−offset,0) | (1,0,0) | (0,−1,0) |
| YZ | (offset,0,0) | (0,1,0) | (1,0,0) |

The sketch y direction is normal × x. Every sketch implicitly has the fixed point `origin` and the
lines `x-axis` and `y-axis`; these IDs are reserved.

Entities: `point { x, y }` (drawn seed position), `line { start, end }`, `circle { center, radius }`
(seed radius), `arc { center, start, end }` (counter-clockwise from start to end); optional
`construction`. Curves refer to point IDs of the same sketch.

Constraints: `{ id, type, entities[], value?, driving?, name? }`; types and entity signatures as in
[the constraint reference](../../../packages/tool-cad-modeler/help/constraints.md). Dimensional
types: `distance`, `distance-x`, `distance-y` (signed, second minus first), `length`, `radius`,
`diameter`, `angle` (0–180°). `driving: false` marks a driven (reference) dimension without a
required value.

**extrude:** `sketch` (ID of an earlier sketch), `extent { distance: Expr, direction: "normal" |
"reverse" | "symmetric" }`, `operation` (`new` | `join` | `cut`), optional `target` (ID of the
earlier body-creating feature; default the latest body).

**revolve:** `sketch`, `axis` (a line of the sketch, `x-axis` or `y-axis`), `angle: Expr` in
(0, 360], `operation`, optional `target`.

Rules beyond the schema (checked by `validateDocument`): unique IDs across the document; features
refer only to earlier sketches; constraint entity signatures; referenced parameters exist; revolve
axes are lines of the sketch.

## 5. References

`{ id, subject, role, target { module, id, revision?, kind?, label? } }` with roles `represents`,
`satisfies`, `verifies`, `realizes`, `traces`, `related` and modules `twin`, `requirements`, `sysml`,
`conceptualize`, `external`. `label` is display text captured at link time and is not authoritative.

## 6. Semantics of regeneration

A conforming implementation regenerates parameters, then features in order; sketches are solved
from their seed positions with the constraint values evaluated at regeneration time. Results
(geometry, names, failures) are not stored. Stable face names follow ADR-0024 and the naming rules in
[architecture.md](architecture.md#6-topological-naming-adr-0024).

## 7. Versioning and migration

- Minor versions add optional fields or new feature/entity/constraint types; older 1.x readers
  reject unknown feature types with a clear message.
- Major versions require a migration function in `cad-core` that converts the old document into a
  new one without deleting information (ADR-0009) and a test with an old-format fixture.

## 8. Example

```json
{
  "format": "ews-cad", "formatVersion": "1.0.0",
  "documentId": "00000000-0000-4000-8000-000000000001", "version": 1, "nextId": 22,
  "units": { "length": "mm", "angle": "deg" },
  "metadata": { "title": "Plate" },
  "parts": [{
    "id": "part-1", "name": "Plate", "semantics": [],
    "parameters": [{ "id": "par-2", "name": "width", "expression": "80", "unit": "mm" }],
    "features": [
      { "id": "sk-5", "type": "sketch", "name": "Sketch 1", "plane": { "kind": "standard", "plane": "XY" },
        "entities": [{ "id": "pt-6", "type": "point", "x": 0, "y": 0 }, "…"],
        "constraints": [{ "id": "cn-18", "type": "length", "entities": ["ln-10"], "value": "width", "name": "width" }, "…"] },
      { "id": "ext-21", "type": "extrude", "name": "Extrude 1", "sketch": "sk-5",
        "extent": { "distance": 10, "direction": "normal" }, "operation": "new" }
    ]
  }],
  "references": []
}
```
