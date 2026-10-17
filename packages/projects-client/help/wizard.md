---
help_id: projects.wizard
title: Create a new project
kind: guide
summary: The New project wizard creates a genuinely empty project with your choice of name, key, disciplines, unit system and template.
keywords: [new project, create project, wizard, template, blank project, key, unit system]
related: [projects.home, projects.overview-panel, projects.troubleshooting]
---

1. Open Project Home (header project switcher) and choose **New project**.
2. **Project name**: any name, for example "Example Engineering Product".
3. **Key**: a short display identifier, suggested from the name (its initials, for example EEP). Use letters,
   digits and hyphens, starting with a letter, 2 to 20 characters. Keys are unique across all projects,
   including archived and deleted ones. The key is for display only: the project's identity never changes.
4. **Description** and **Engineering disciplines** are optional.
5. **Unit system**: SI, imperial or mixed. It becomes the project setting `projects.units.system`.
6. **Template**:
   - *Blank project*: nothing at all.
   - Other templates add **configuration and planning items only** (disciplines, unit settings, milestones and a
     few starter tasks). No template creates requirements, concepts, models or CAD documents.
7. Choose **Create and open**. You become the project's administrator and the window opens the new project.

A new project opens the real modules: **Requirements, Conceptualize, System Model and CAD Modeler**. The
earlier illustrative SysML tool and mock CAD tool are no longer offered (their data in the example project stays readable).

On the server, one transaction records the project, its first revision, your administrator membership and every
module's provisioning state. Modules create their project space when you first add something; nothing is seeded.
