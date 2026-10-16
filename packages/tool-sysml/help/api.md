---
help_id: sysml.api
title: SysML demo assistant operations
kind: api
summary: Inputs, outputs and constraints for registered operations.
keywords: [sysml, demo]
---

These are platform assistant operations, not a standalone HTTP API. Writes produce proposals for platform validation and preview; documentation cannot execute them.

| Operation | Inputs | Output |
| --- | --- | --- |
| `sysml.read_model` | None | Elements, owners, represented components, requirement references, connections and satisfy links. |
| `sysml.create_part` | Required `name`; optional `typeName`, `ownerId`, `representsId` | Proposed part creation and optional representation link. Owner must be a top-level part definition; represented component must exist and not already be represented. |
| `sysml.add_requirement_reference` | `requirementId` | Proposed usage referencing an existing requirement; duplicates are refused. Does not create the requirement itself. |
| `sysml.connect` | `fromId`, `toId` | Proposed connection or satisfy link; physical components and requirements resolve through their existing links. |

Use stable object IDs, never names, for identity. A type name is illustrative text. Shared writes enforce ownership, relationship rules and revision checks. The operation registry remains authoritative.
