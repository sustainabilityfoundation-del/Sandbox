---
help_id: cad-modeler.commands
title: Command reference
kind: reference
summary: The typed CAD commands behind every action, with their inputs, preconditions and errors; the same for the interface, scripts and the assistant.
keywords: [commands, api, create_sketch, add_rectangle, apply_constraint, set_parameter, extrude_profile, revolve_profile, transaction]
related: [cad-modeler.ai, cad-modeler.constraints]
operations: [cad-modeler.run_commands]
---

| Area | Commands |
| --- | --- |
| Document, part | `set_document_metadata`, `create_part`, `rename`, `set_material` |
| Parameters | `create_parameter`, `set_parameter`, `delete_parameter` |
| Sketch | `create_sketch`, `set_sketch_plane`, `add_point`, `add_line`, `add_circle`, `add_arc`, `add_rectangle`, `move_sketch_point`, `set_construction`, `delete_sketch_entities` |
| Constraints | `apply_constraint`, `set_dimension`, `set_dimension_driving`, `delete_constraint` |
| Features | `extrude_profile`, `revolve_profile`, `edit_feature`, `set_suppressed`, `delete_feature` |
| Semantics, references | `add_semantic`, `remove_semantic`, `add_reference`, `remove_reference` |

Each command has a JSON Schema for its input, documented preconditions and error codes
(`invalid-input`, `not-found`, `precondition-failed`, `in-use`, `invalid-expression`, `cycle`,
`version-conflict`). Commands run in transactions; create commands accept `"ref": "$name"` so later
commands in the same transaction can use the new ID. The machine-readable catalogue is returned by
the query `list_commands` and published as `docs/modules/cad/commands.json`.

Example: `{ "command": "add_rectangle", "input": { "sketchId": "sk-2", "width": "width", "height": 40 } }`.
