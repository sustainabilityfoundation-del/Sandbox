---
help_id: requirements.roles
title: Roles and permissions
kind: reference
summary: What readers, editors, reviewers and administrators may do; the server enforces it.
keywords: [roles, permissions, reader, editor, reviewer, administrator, forbidden, access]
related: [requirements.troubleshooting]
---

| Permission | Reader | Editor | Reviewer | Administrator |
| --- | --- | --- | --- | --- |
| Read, export, personal saved views | yes | yes | yes | yes |
| Create, edit, archive, relationships, collections, bulk edit, import | | yes | | yes |
| Comment, dismiss quality findings, share views | | yes | yes | yes |
| Approve or reject, retire, reinstate, create baselines | | | yes | yes |
| Attribute definitions, conventions, renumber keys | | | | yes |

The Requirements subscription is needed for all of it. With only the SysML subscription you can read
requirements and edit their title and statement from SysML. Actions you may not take are hidden; if
one is refused anyway, the server's explanation is shown.
