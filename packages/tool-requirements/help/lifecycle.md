---
help_id: requirements.lifecycle
title: Lifecycle and reviews
kind: reference
summary: Draft, in review, approved and retired states, who may change them, and what a review records.
keywords: [lifecycle, status, review, approve, reject, retire, reinstate, withdraw, draft]
object_types: [requirement]
related: [requirements.requirement.edit, requirements.roles]
---

| State | Meaning | Next steps |
| --- | --- | --- |
| Draft | Being written | Request review (editor) |
| In review | A specific revision is under review | Approve or Reject (reviewer), Withdraw review (editor) |
| Approved | That revision was reviewed and accepted | Edit (creates a new draft revision), Retire (reviewer) |
| Retired | No longer in force | Reinstate (reviewer) |

A reviewer cannot approve a revision they authored. Reviews are recorded on the **Reviews** tab with
the decision, the reviewer and the revision. Archiving (Archive / Restore) hides a requirement from
normal lists without changing its lifecycle state.

Approval is a person's decision; the assistant cannot approve.
