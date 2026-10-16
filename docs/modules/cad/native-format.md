# ews-cad native format specification (format 1.2.0)

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

**sketch:** `plane` (a plane reference, below), `entities[]`, `constraints[]`.

Plane references (`PlaneRef`, 1.1 adds the last two kinds), each with an optional `offset: Expr`
along the normal:

- `{ kind: "standard", plane: "XY" | "XZ" | "YZ" }`;
- `{ kind: "datum", datum: <ID of an earlier datum-plane feature> }`;
- `{ kind: "face", face: <stable face name, e.g. "ext-22/cap-end"> }`, which must name a planar face
  of a body produced by an earlier feature.

A face plane is re-resolved at every regeneration, so the sketch follows the face when upstream
parameters change. The origin is the model origin projected onto the face plane, so on faces parallel to a standard
plane the sketch coordinates equal the model coordinates. The normal is the outward face normal, and
`faceFrame` gives the x direction (Z × normal, or the X axis when the normal is within 0.99 of ±Z).
If the face no longer exists, the sketch fails with `reference-lost`. If the face is not planar, it
fails with `face-not-planar`.

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

**datum-plane** (1.1): `plane` (a plane reference as above, including another datum or a face, with
`offset`). It produces no body, only a plane for later sketches and datums.

**pattern-linear** (1.2): `features[]` (earlier extrude or revolve IDs), `direction` (unit `[x, y, z]`
in model coordinates), `count: Expr` (integer ≥ 2, occurrences including the original), `spacing: Expr`
(mm, > 0). Occurrence k (2 … count) is the source feature rebuilt from its sketch on a plane shifted by
(k − 1)·spacing·direction and applied with the same operation to the same body. Its faces are named
`<patternId>/i<k>-<featureId>-<role>`. Regeneration results add `pattern { count, spacing, direction,
gap }`, where `gap` is the kernel's minimum distance between the tool solids of occurrences 1 and 2.
The gap is derived and never stored.

**fillet** (1.1): `edges[]` (stable edge names, at least one), `radius: Expr` (> 0), optional
`target` (ID of the body-creating feature; default the latest body).

**chamfer** (1.1): `edges[]`, `distance: Expr` (> 0, equal distance), optional `target`.

Stable edge names are `edge(<faceA>|<faceB>)`, with the two adjacent stable face names in sorted
order, plus `#n` when the same pair of faces shares several edges. Faces created by a fillet or
chamfer are named `<featureId>/blend:<edge name>`. A missing edge fails the feature with
`reference-lost` and lists the available edges. A value the kernel cannot build fails it with
`invalid-value` or `blend-failed`. Later features are then `blocked`.

Rules beyond the schema (checked by `validateDocument`):

- IDs are unique across the document.
- Features refer only to earlier sketches, datum planes and body-creating features.
- Constraints match their entity signatures.
- Referenced parameters exist.
- Revolve axes are lines of the sketch.
- Fillets and chamfers name at least one edge.

Validation does not check whether face and edge names exist. Regeneration resolves them and reports
failures.

## 5. References

`{ id, subject, role, target { module, id, revision?, kind?, label? } }` with roles `represents`,
`satisfies`, `verifies`, `realizes`, `traces`, `related` and modules `product` (1.1: Project Management product elements, the default for new projects;
ADR-0026), `twin`, `requirements`, `sysml`,
`conceptualize`, `external`. `label` is display text captured at link time and is not authoritative.

## 6. Semantics of regeneration

A conforming implementation regenerates parameters, then features in order; sketches are solved
from their seed positions with the constraint values evaluated at regeneration time. Results
(geometry, names, failures) are not stored. Stable face names follow ADR-0024 and the naming rules in
[architecture.md](architecture.md#6-topological-naming-adr-0024).

## 7. Versioning and migration

- Minor versions add optional fields or new feature/entity/constraint types; older 1.x readers
  reject unknown feature types with a clear message.
- 1.2.0 (2026-10-15) adds the `pattern-linear` feature and the optional `binding` of a parameter:
  `{ ref: { module, kind, id, revision? }, quantity?, note? }`. A binding records what the parameter
  implements; it never copies values from the target. It is additive, so 1.0 and 1.1 documents are
  valid 1.2 documents.
- 1.1.0 (2026-10-15) adds plane references `datum` and `face`, and the features `datum-plane`,
  `fillet` and `chamfer`. Every 1.0 document is a valid 1.1 document unchanged; no migration is needed.
  Readers built for 1.0 do not know the additions and may refuse documents that use them.
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
