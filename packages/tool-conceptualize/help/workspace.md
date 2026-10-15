---
help_id: conceptualize.workspace
title: Concept Workspace
kind: guide
summary: The open Concept with its intent, structure, alternatives and decisions, implementations, evidence and revision history.
keywords: [workspace, intent, edit, revision, history, maturity]
operations: [conceptualize.read, conceptualize.search]
related: [conceptualize.concept.model, conceptualize.maturity, conceptualize.history]
---
Tabs:

- **Intent**: description, purpose, attributes and statements grouped by kind with their basis.
  **Edit** changes them and saves a new revision (with a reason). AI hypotheses keep their label until
  you choose **Confirm**. **Change maturity** sets the [maturity](help:conceptualize.maturity).
- **Structure**: relationships in both directions; add or remove them (see
  [relationships](help:conceptualize.structure)).
- **Alternatives and decisions**: alternative sets the Concept belongs to and decisions about it.
- **Implementations**: [implementations](help:conceptualize.implementation) and
  [requirement links](help:conceptualize.requirements).
- **Evidence**: preliminary calculations and verified evidence.
- **History**: immutable revisions and the change history with [provenance](help:conceptualize.history).

Header badges keep three things apart: **maturity**, **implementation status** (derived from
implementations) and **verification status** (needs verified evidence).

**Record evidence** (Evidence tab) stores a preliminary estimate (method, inputs and outputs with units,
assumptions) or verified evidence, which must reference the authoritative result (a saved result
`OUT-…`, an analysis test-adapter result or an external document). Reviewers set the **verification
status** there, choosing the verified evidence that supports it.

To supersede a Concept, set maturity *superseded* and choose **Replaced by**: a *replaces* relationship
is recorded and the old Concept stays readable.
