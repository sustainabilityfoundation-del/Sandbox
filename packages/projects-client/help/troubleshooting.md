---
help_id: projects.troubleshooting
title: Troubleshooting projects
kind: troubleshooting
summary: What the common Project Management messages mean and what to do.
keywords: [error, troubleshooting, could not load the project, key already used, archived, not a member]
related: [projects.home, projects.wizard, projects.overview-panel]
---

| Message | Meaning and what to do |
| --- | --- |
| *Project Management needs the backend* | The workspace runs in demo mode, which has only the example project. Switch the service mode to the API in the header (Services). |
| *Could not load the project* | The project in the address, or the one this browser remembers, is not available to you (membership removed, project deleted), or the API is unreachable. Choose **Projects…** to open another one, or **Open the example project**. |
| *The project key … is already used* | Keys are unique across all projects, including archived and deleted ones. Choose another key. |
| *… is archived and read-only* | An administrator archived the project. Every module refuses changes until it is restored (This project → Restore). |
| *This is a destructive change. Confirm it …* | Deleting needs the project key typed exactly. |
| *You are not a member of project …* | Ask a project administrator to add you. |
| A module shows *failed* in This project | Provisioning is retried the next time the project is opened; the message next to it says why. |
