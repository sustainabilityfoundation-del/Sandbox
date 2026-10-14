---
help_id: requirements.requirement.edit
title: Edit a requirement
kind: guide
summary: Change a requirement's fields; every save creates a new immutable revision with a reason, and conflicting edits are refused.
keywords: [edit, change, revision, conflict, reason, save]
object_types: [requirement]
operations: [requirements.update]
related: [requirements.requirement.create, requirements.lifecycle, requirements.troubleshooting]
---

1. Open the requirement (Enter on its row) and stay on the **Edit** tab.
2. Change the fields. "Unsaved changes" is shown until you save.
3. Enter a **Reason for this change** and choose **Save revision**.

## Revisions and conflicts

Each save creates a new revision; older revisions never change and remain available on the
**History** tab, where you can compare two revisions.

Your edit is based on the revision you opened. If someone saved a newer revision meanwhile, the save is
refused with an explanation and your input is kept. Choose **Load latest (keep my edits)** to rebase
your changes on the newest revision, review them and save again.

Editing an approved or in-review requirement creates a new draft revision, which needs review again
([Lifecycle and reviews](help:requirements.lifecycle)).

The assistant can prepare statement and rationale edits (`requirements.update`); you review them
before anything is saved.
