---
help_id: projects.explorer
title: Project explorer
kind: reference
summary: The left panel of a project lists its registered artifacts by module (product structure, concepts and design knowledge, requirements, SysML models, CAD documents, tasks and documents); choose an item to open its tool.
keywords: [project explorer, artifacts, concepts, requirements, sysml, cad, documents, left panel, tree]
related: [projects.overview, projects.product-structure]
---

In every project except the example, the left panel is the **Project explorer**. It shows what the project contains,
grouped by the module that owns it:

| Group | Contains | Choosing an item |
| --- | --- | --- |
| Product structure | Product elements (product, systems, assemblies, parts) | selects the element in every tool |
| Concepts and design knowledge | Concepts (including alternatives), functions, alternative sets, decisions, constraints, assumptions … | opens Conceptualize |
| Requirements | Requirements and collections | selects the requirement and opens Requirements |
| SysML models | System Model projects with their named elements | opens the System Model |
| CAD documents | CAD documents with their parts | opens the CAD on the document |
| Tasks, milestones and documents | Project Management records | — |

The list comes from the project's **registry**: each module reports what it creates, and the explorer refreshes when
something is added or changed (also when the assistant applies a proposal). Opening a project also checks every
module again, so nothing is missed after a restart. A warning icon marks an item whose module is not available or
that its module no longer lists; it is never removed silently.

The example project **ACT100** keeps its product tree, built from the example's browser data.
