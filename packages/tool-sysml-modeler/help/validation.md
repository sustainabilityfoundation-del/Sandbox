---
help_id: sysml-modeler.validation
title: Validation
kind: reference
summary: The validation rules, what they check, and how each change reports the problems it introduces or resolves.
keywords: [validation, rules, errors, warnings, check, consistency, units]
related: [sysml-modeler.properties, sysml-modeler.ai, sysml-modeler.troubleshooting]
operations: [sysml-modeler.validate]
---

**Validate** in the toolbar lists the diagnostics of the current commit. Select one to select its
element. Every change also validates the elements it affects and reports the problems it
**introduces** and **resolves**. The assistant's changes are refused if they would introduce errors.

| Rule | Severity | Checks |
| --- | --- | --- |
| SYSML-REF-DANGLING | error | References point to existing elements |
| SYSML-OWNERSHIP | error | Ownership relationships are consistent |
| SYSML-TYPING-KIND | error | A usage is typed by definitions of its kind |
| SYSML-SPECIALIZATION-KIND | error | A definition specializes a compatible kind |
| SYSML-SPECIALIZATION-CYCLE | error | No type specializes itself |
| SYSML-MULTIPLICITY | error | Bounds are non-negative and lower ≤ upper |
| SYSML-DUPLICATE-NAME | warning | Members are distinguishable by name |
| SYSML-REDEFINITION-TARGET | error | A redefined feature is inherited |
| SYSML-UNIT-DIMENSION | error | A quantity value has the attribute's dimension (a mass in kg, not in m) |
| SYSML-UNIT-MISSING | warning | A quantity attribute's number states its unit |
| SYSML-CONNECTOR-ENDS | error | Connections, interfaces, flows, bindings, successions and allocations have two ends |
| SYSML-SATISFY-TARGET | error | `satisfy` targets a requirement usage |
| SYSML-TRANSITION-STATES | warning | Transitions connect states |
| SYSML-COMPOSITION-CYCLE | warning | A definition does not compose itself with a mandatory part |
| SYSML-MANAGED-REQUIREMENT | error | ManagedRequirement metadata carries a requirement UUID |
| SYSML-PRODUCT-REFERENCE | error | ProductElement metadata refers to a product element UUID (`productElementId`), with an integer revision or none |
| SYSML-CAD-REFERENCE | error | CadRepresentation metadata refers to a CAD entity, `cadRef = "<document UUID>/<entity ID>"`, with an integer document revision (or none) |
| SYSML-CONSTRAINT-FALSE | warning | A constraint that can be evaluated holds with the current values |
| SYSML-UNSUPPORTED-METACLASS | info | Elements from other tools that this version keeps but does not interpret |

The rule IDs belong to this module; several approximate constraints of the KerML and SysML
specifications. Many specification constraints are not checked yet (see
[Supported language](help:sysml-modeler.language)).
