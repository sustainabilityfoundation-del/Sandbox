---
help_id: projects.overview-panel
title: Project overview, members and lifecycle
kind: reference
summary: The "This project" tab shows and edits the open project's description and lifecycle status, lists modules with their provisioning states, members, milestones and recent activity, and offers archive, restore and delete.
keywords: [project overview, lifecycle status, archive, restore, delete project, members, modules, provisioning]
related: [projects.home, projects.troubleshooting]
---

| Item | Meaning |
| --- | --- |
| Description | Saved when you leave the field. Editors and above can change it. |
| Lifecycle status | Planning, active, on hold, completed or cancelled. Informational; it never blocks work. |
| Modules | Each installed module with its provisioning state: *not-needed* (the module creates its space on first use), *ready*, *pending* or *failed* (retried when the project is opened). A *disabled* module is hidden in this project; nothing is deleted. |
| Members | Everyone with access and their role: reader, editor, reviewer or administrator. |
| Milestones, recent activity | Planning items and the project's audit trail (who changed what, and when). |

Lifecycle (administrators):

- **Archive** makes the project read-only in every module (Requirements, Conceptualize, SysML, CAD and Project
  Management refuse changes) until it is restored.
- **Delete** needs you to type the project key. The project disappears from the lists but stays restorable for the
  retention period (30 days by default). **No module data is deleted.**
- **Restore** returns an archived or deleted project to active.

Changes are saved as you make them; "All changes saved · revision N" confirms the server revision.
