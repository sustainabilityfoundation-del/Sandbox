---
help_id: requirements.requirement.trace
title: Trace and allocation
kind: guide
summary: Allocate a requirement to components, product elements or SysML elements and link it to other requirements with typed relationships.
keywords: [trace, traceability, allocate, allocation, derive, decompose, depends, link, relationship]
object_types: [requirement, part, assembly]
operations: [requirements.allocate, requirements.read_for_component]
related: [requirements.matrix, requirements.overview]
---

Open a requirement and choose the **Trace** tab (or **Trace** in the toolbar).

| Relationship | Direction | Meaning |
| --- | --- | --- |
| allocated-to | requirement → component, product element or SysML element | The target is responsible for meeting the requirement |
| derives-from | derived → original | The requirement was derived from another |
| decomposes | child → parent | The requirement is part of a decomposition |
| depends-on | from → to | Changing the target may affect this requirement |

Components come from the shared product structure; the Requirements service never copies them.
To allocate, choose **Allocate to**: a **Component (shared twin)**, a **Product element** (its ID in
the project's product structure) or a **SysML element** (searched in the System Model). The server
checks that the target exists in this project and refuses the change if the requirement changed since
you opened it. A SysML allocation records the element's commit number.

The assistant can prepare allocations and removals (`requirements.allocate`); you review the preview
and choose **Apply**. The same checks apply.
Collection headings and order never imply derivation or decomposition.

The Trace tab also shows SysML usages (**Show in SysML** selects one) and the impact of a change on
linked items.
