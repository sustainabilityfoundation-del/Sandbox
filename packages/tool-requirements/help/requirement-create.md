---
help_id: requirements.requirement.create
title: Create a requirement
kind: guide
summary: Add a requirement with a title and a normative statement; it is stored as revision 1 in the Requirements service.
keywords: [add, new, create, write, requirement, statement]
object_types: [requirement]
operations: [requirements.create]
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
| Origin | no | **User constraint** (stated by a stakeholder), **AI-proposed choice** (proposed by the assistant and accepted by you) or **Derived** (from another requirement). Shown in the form; "Not recorded" for older requirements |
| Derived from | with origin Derived | Key of the parent requirement; a derives-from link is created with the requirement |

You need the **editor** or **administrator** role and the Requirements subscription. A retry after a
network failure does not create a duplicate.

## Result

Revision 1, recorded in the change history with you as the author. Other windows and tools show the
new requirement within about a second.

## With the assistant

The assistant can prepare a new requirement (`requirements.create`) with its origin. You see a preview
in the conversation (each field, and whether it is your statement or the assistant's proposal) and
nothing is created until you choose **Apply**. Applying makes the same request as this form, so the
same rules apply; the change history records the proposal and conversation. Undo archives the
requirement. Creating through the assistant needs the Requirements API (not the demo service), and
works with the Requirements tab closed.
