---
help_id: sysml-modeler.views
title: Views (General and Interconnection)
kind: guide
summary: Diagrams are projections of the model in SysML v2 view styles, laid out automatically. SysML v1 diagram kinds are not presented as the same thing.
keywords: [diagram, view, general view, interconnection view, ibd, bdd, layout, graphical]
related: [sysml-modeler.browser, sysml-modeler.properties]
---

Every diagram is **computed from the model** each time it changes. Deleting or rearranging a
diagram never changes engineering data; positions come from automatic layout (ELK, layered).

## General View

Shows the definitions and top-level usages of the selected package (including nested packages) or
of one definition. Nodes have compartments: attributes with values, ports, parts, actions, states,
parameters and requirement text. Edges:

| Edge | Meaning |
| --- | --- |
| Hollow triangle | Specialization (`:>`) |
| Diamond with a label | Composite part of a definition, typed by the target (`part motor : Motor`) |
| Dashed arrow | A usage defined by a definition |
| Dashed, «satisfy» | `satisfy R by x` |
| Dashed, «allocate» | `allocate a to b` |

## Interconnection View

Shows the parts of a part definition, or of the definition of a selected part usage. Ports sit on
the borders (a filled square is a conjugated `~` port), with the connections, interfaces, flows and
bindings between them. **Connect** in the toolbar adds a connection between two parts or ports.

## Using diagrams without a pointer

Every node, port and edge is focusable (Tab) and selectable with Enter. Zoom with the buttons in
the diagram bar. Everything a diagram offers is also available in the browser and in Properties.

## SysML v1 diagrams

BDD-, IBD-, activity-, state machine- and other SysML v1-style presentations are **planned** as
labelled compatibility presentations of these views; v1 and v2 notations do not map one to one.
Action flow, state transition and sequence views are also planned. Behaviour can already be
modelled and edited in text.
