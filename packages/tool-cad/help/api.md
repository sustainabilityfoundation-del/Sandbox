---
help_id: cad.api
title: Mock CAD assistant operations
kind: api
summary: Read representations or propose dimension changes.
keywords: [cad, demo]
---

These are registered platform operations, not a separate HTTP CAD service. The platform validates and previews proposed writes.

| Operation | Inputs | Output |
| --- | --- | --- |
| `cad.read_representation` | `objectId`: component or representation ID | Representation ID, component ID, dimensions with units, explicit property mappings and the mock-geometry limitation. |
| `cad.set_dimension` | `objectId`, `parameter`, numeric `value`; optional `unit` | Proposed dimension change plus the explicitly mapped component property, if any. |

Parameters are `diameter`, `outerDiameter` and `length`, but must exist on the selected representation. Review [ranges and mappings](help:cad.features). Missing representations and unavailable dimensions produce errors. Stable IDs identify objects; names are display labels. Shared validation enforces quantities, ownership and revisions; the assistant cannot bypass those rules or create real geometry here.
