---
help_id: sysml-modeler.commands
title: Command reference
kind: reference
summary: The typed commands every change is made of, used by people (through the interface), the assistant and API clients.
keywords: [commands, api, typed commands, transaction, dry run, createElement, applyText, schema, metadata]
related: [sysml-modeler.ai, sysml-modeler.api, sysml-modeler.properties]
operations: [sysml-modeler.describe_commands, sysml-modeler.propose_commands]
---

A **transaction** is a list of commands applied atomically: all or nothing. A transaction can be a
**dry run** (preview only). Elements are referenced by UUID, by qualified name
(`ActuatorSystem::Mechanical::Rod`) or by a placeholder (`$name`), which `ref` sets on an element
created earlier in the same transaction.

| Command | Does |
| --- | --- |
| `createElement` | Creates a package, definition or usage, with type, specialization, multiplicity, value, direction and documentation |
| `rename` | Changes the name and short name (the identity is kept) |
| `setTyping` | Replaces the types of a usage (`conjugated` for `~T` ports) |
| `addSpecialization`, `removeSpecialization` | Subclassification, subsetting, redefinition, reference subsetting |
| `setMultiplicity`, `setValue`, `setDirection`, `setAbstract`, `setDocumentation` | Feature properties |
| `connect` | Connection, interface, flow, binding, succession or allocation between feature chains such as `motor.shaft` |
| `satisfy` | `satisfy R by x` |
| `move` | Changes the owner |
| `deleteElement` | Deletes an element with everything it owns; `removeReferences` also removes references to it |
| `applyText` | Replaces or appends the members of the root, a package or a definition, from text |
| `setMetadata` | Platform metadata: ManagedRequirement, CadRepresentation, ConceptLink |
| `importRequirement` | Bring a managed requirement into the model: one requirement carrying ManagedRequirement (UUID, pinned revision, key, title), optional `satisfy` links; idempotent by UUID |

The JSON schemas are served by `GET /api/sysml/v1/commands` and returned by the assistant operation
`describe_commands`. Example transaction:

```json
[
  { "op": "createElement", "ownerId": "ActuatorSystem::Electrical", "kind": "PartDefinition", "name": "Battery", "ref": "$b" },
  { "op": "createElement", "ownerId": "$b", "kind": "AttributeUsage", "name": "capacity", "typeIds": ["ISQ::ElectricChargeValue"], "value": "7200 [C]" }
]
```

Link a requirement in the model to a managed requirement (Requirements Management stays the owner):

```json
{ "op": "setMetadata", "elementId": "ActuatorSystem::Requirements::load", "metadata": "ManagedRequirement", "values": { "requirementId": "5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001", "revision": 3 } }
```
