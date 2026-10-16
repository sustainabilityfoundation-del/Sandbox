---
help_id: sysml.overview
title: Illustrative SysML demo
kind: overview
summary: Understand the demo model and its limits.
keywords: [sysml, demo]
---

This demo tool edits a small shared diagram of parts, requirement usages, connections and satisfy links. It is **not SysML v2 compliant**. Its text is generated, read-only illustration, not a parser or an exchange format. For the semantic modeling tool, see [SysML Modeler](help:sysml-modeler.overview).

Open SysML from the workspace tool selector. Existing shared objects appear in the diagram. Select an element to inspect its properties. Selecting a physical component in another tool resolves through explicit representation links; an unlinked selection stays selected and shows no matching element.

Supported constructs are part definitions, one level of nested part usages, requirement references, part connections and satisfy links. Ports, interfaces, items, attributes, actions, states, constraints, packages, imports and multiplicities are not supported here. A part can represent an existing physical component, without creating another component. There is no implicit synchronization with CAD.

Continue with [features](help:sysml.features), [a tutorial](help:sysml.tutorial), [operations](help:sysml.api) or [troubleshooting](help:sysml.troubleshooting).
