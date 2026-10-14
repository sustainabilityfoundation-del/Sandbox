---
help_id: requirements.requirement.create
title: Create a requirement
kind: guide
summary: Add a requirement with a title and a normative statement; it is stored as revision 1 in the Requirements service.
keywords: [add, new, create, write, requirement, statement]
object_types: [requirement]
related: [requirements.requirement.edit, requirements.writing]
---

## Steps

1. Choose **Add** in the toolbar. A new requirement form opens beside the table.
2. Enter a **Title** (a short name) and the **Statement (normative text)**: what must be true.
3. Optionally set type, rationale, source, owner, priority, verification methods and acceptance criteria.
4. Choose **Create requirement**.

The requirement gets a canonical ID and the next key in the project (for example `REQ-009`). If a
component was selected, the new requirement is allocated to it.

## Inputs and rules

| Field | Required | Notes |
| --- | --- | --- |
| Title | yes | Display name; may be renamed later |
| Statement | yes | Normative text only; keep rationale and notes out of it |
| Type, priority, owner, source | no | Values allowed by the project conventions |

You need the **editor** or **administrator** role and the Requirements subscription. A retry after a
network failure does not create a duplicate.

## Result

Revision 1, recorded in the change history with you as the author. Other windows and tools show the
new requirement within about a second.

The assistant cannot create requirements yet (see the AI capability coverage view).
