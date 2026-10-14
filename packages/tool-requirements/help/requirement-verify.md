---
help_id: requirements.requirement.verify
title: Verify a requirement
kind: guide
summary: Record a verification result pinned to the exact requirement revision and configured article; later changes mark it stale.
keywords: [verify, verification, test, evidence, result, stale]
object_types: [requirement]
related: [requirements.baselines, requirements.lifecycle]
---

1. Open the requirement and choose the **Verification** tab.
2. Choose **Record result**, then the method, outcome (pass, fail, inconclusive) and the
   **Procedure / run** that produced it.
3. Optionally name a baseline (the configured article) and an evidence artifact.

The record pins the requirement revision and the revisions of its allocated components. It is never
edited: when the requirement or a component changes, the table shows **Stale evidence** and the record
explains what changed. **Show verified statement** shows the text that was verified.

Verification results are separate from approval and from compliance assessment.
