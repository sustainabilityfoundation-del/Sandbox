---
help_id: sysml.features
title: SysML demo controls and properties
kind: reference
summary: Create parts, reference requirements and connect elements.
keywords: [sysml, demo]
---

| Control | Inputs and result |
| --- | --- |
| Select | Closes the current creation dialog; click an element to select it in shared context. |
| Add Part | Enter a name, optional type name, owner part definition and represented component. Creates a SysML element; ownership nests it one level only. A component may have only one SysML representation. |
| Add Requirement Reference | Choose an existing requirement, or create one through the Requirements service. Creates a usage referencing the canonical requirement, not a copied statement. |
| Connect | Choose source and target. Part to part creates a connection; part to requirement usage creates a satisfy link. Invalid endpoints are refused. |
| Fit | Resets this view's pan and zoom. |
| Text | Toggles generated, read-only illustrative notation. |

The properties panel exposes the selected element and its type. Requirement title and statement are read and edited through the Requirements service; Save retains its revision checks. Open in Requirements navigates to the canonical record. The standalone harness lacks that service, so creation/editing of requirements needs the full workspace. A newly created requirement must appear in the platform projection before it can be linked.

Pan/zoom, text visibility and dialogs belong to this view. Domain edits go through atomic platform changes and preserve object identity. A satisfy link records a relationship; it does not demonstrate verification.
