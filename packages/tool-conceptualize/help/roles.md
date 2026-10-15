---
help_id: conceptualize.roles
title: Roles and permissions
kind: reference
summary: Readers read; editors create and edit; reviewers and administrators pass approval gates (decisions, selection, verification).
keywords: [roles, permissions, reader, editor, reviewer, administrator, approval gate]
related: [conceptualize.decision, conceptualize.maturity]
---
| Action | Reader | Editor | Reviewer | Administrator |
| --- | --- | --- | --- | --- |
| Read everything | ✓ | ✓ | ✓ | ✓ |
| Create and edit Concepts, relationships, alternatives, trade studies, evidence, implementations, links; propose decisions | | ✓ | | ✓ |
| Record accepted or rejected decisions, set maturity selected or later, supersede selected Concepts, set verification status | | | ✓ | ✓ |

The entitlement *tool:conceptualize* is needed; users of other tools may read the cross-module subset
(Concepts and the implementations of an artifact). The server enforces all of it; the interface only
hides what you cannot do.
