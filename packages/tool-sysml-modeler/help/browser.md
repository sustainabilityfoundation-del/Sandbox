---
help_id: sysml-modeler.browser
title: Model browser
kind: guide
summary: The containment tree of packages, definitions and usages, with search by name and a filter by kind.
keywords: [browser, tree, containment, search, filter, navigate]
related: [sysml-modeler.properties, sysml-modeler.views]
---

The browser shows the **owned members** of each namespace, as the model stores them (through
membership relationships). Relationship elements, multiplicity ranges and the implied conjugated
port definitions are not listed; Properties and the views show them instead.

- **Select** an element: click it, or focus the tree and press Enter.
- **Expand or collapse**: the arrow before the name, a double-click, or the Right and Left keys.
- **Move** through the tree with the Up and Down keys.
- **Search** matches names, short names and qualified names (case-insensitive). Results show the
  qualified name. Clear the search to return to the tree.
- **Filter by kind**: packages, definitions, parts, ports, attributes, actions and states,
  requirements, connections and flows. A kind includes its specializations: *Definitions* includes
  part, port, requirement and every other definition.

Selection in the System Model is private to the view. SysML elements are not objects of the
shared product model, so selecting them does not change the workspace selection.
