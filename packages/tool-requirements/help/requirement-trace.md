---
help_id: requirements.requirement.trace
title: Trace and allocation
kind: guide
summary: Allocate a requirement to components and link it to other requirements with typed relationships.
keywords: [trace, traceability, allocate, allocation, derive, decompose, depends, link, relationship]
object_types: [requirement, part, assembly]
related: [requirements.matrix, requirements.overview]
---

Open a requirement and choose the **Trace** tab (or **Trace** in the toolbar).

| Relationship | Direction | Meaning |
| --- | --- | --- |
| allocated-to | requirement → component | The component is responsible for meeting the requirement |
| derives-from | derived → original | The requirement was derived from another |
| decomposes | child → parent | The requirement is part of a decomposition |
| depends-on | from → to | Changing the target may affect this requirement |

Components come from the shared product structure; the Requirements service never copies them.
Collection headings and order never imply derivation or decomposition.

The Trace tab also shows SysML usages (**Show in SysML** selects one) and the impact of a change on
linked items.
