---
help_id: requirements.quality
title: Quality checks
kind: reference
summary: Explainable checks for wording and completeness; findings are suggestions, not judgements of correctness.
keywords: [quality, check, wording, vague, ambiguous, findings, dismiss, conventions]
object_types: [requirement]
operations: [requirements.explain_quality]
related: [requirements.writing, requirements.requirement.edit]
---

The **Quality** tab of a requirement and the **Quality** page list findings such as multiple
obligations, vague wording, missing units, missing acceptance criteria, missing source or rationale,
possible duplicates and missing traceability.

Each finding is labelled **validation** (a rule that is certainly broken) or **heuristic** (a
suggestion), explains why, and proposes an improvement. Nothing is rewritten automatically. **Dismiss
with reason** records why a finding does not apply to this revision.

Necessity, feasibility, correctness and completeness need engineering judgement; the checks cannot
establish them. Administrators can adjust writing conventions (for example whether "shall" is expected).
