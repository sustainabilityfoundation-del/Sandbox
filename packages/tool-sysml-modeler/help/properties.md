---
help_id: sysml-modeler.properties
title: Properties
kind: reference
summary: Edit the selected element's name, short name, type, specialization, multiplicity, value, direction, abstractness and documentation; see what refers to it; delete it.
keywords: [properties, inspector, rename, type, multiplicity, value, direction, documentation, delete]
related: [sysml-modeler.commands, sysml-modeler.validation, sysml-modeler.history]
---

Every field saves as one typed command and one commit. These are the same commands the assistant
uses.

| Field | Command | Notes |
| --- | --- | --- |
| Name, Short name | `rename` | Keeps the identity; references follow. Short names are identifiers such as `R-FORCE` |
| Defined by | `setTyping` | Only definitions of a matching kind are offered (a part by a part def, an attribute by an attribute def or data type, …) |
| Specializes | `addSpecialization`, `removeSpecialization` | Definitions: subclassification |
| Lower, Upper | `setMultiplicity` | Upper `*` means unbounded; an empty upper removes the multiplicity |
| Value | `setValue` | An expression such as `12 [kg]`, `2 * 3`, `rod.stroke`; the evaluated value is shown |
| Direction | `setDirection` | in, out or inout (parameters and directed features) |
| Abstract | `setAbstract` | |
| Documentation | `setDocumentation` | Empty text removes it |
| Delete… | `deleteElement` | Refused while other elements refer to the element; you can then delete it and remove those references |

**Referenced by** lists the elements that point to the selected one (typings, specializations,
connections, satisfy, …): a direct impact analysis. Library elements are read-only.

The **General View**, **Interconnection** and **Edit as text** buttons open the selected element
in those views.
