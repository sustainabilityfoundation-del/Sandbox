---
help_id: sysml-modeler.requirements
title: Requirements in the model
kind: guide
summary: Bring managed requirements into the System Model (idempotent, one element per managed requirement), or link an existing SysML requirement; text is read live and stale pins are flagged.
keywords: [requirement, managed requirement, link, traceability, satisfy, reqif, REQ]
related: [sysml-modeler.properties, sysml-modeler.commands, sysml-modeler.ai]
operations: [sysml-modeler.link_requirement, sysml-modeler.import_requirement]
---

Requirements Management owns requirement records (key, title, statement, revisions, reviews). The
SysML model refers to them; it never keeps a competing copy.

## Bring managed requirements into the model

The Satisfy matrix and Coverage list only requirements that exist in the model. Requirements created in
Requirements Management are **not** in the model until you bring them in:

- In **Matrix › Satisfy**, choose **Bring in managed requirements** (also offered in the empty matrix,
  which says: “Managed requirements appear here once they are brought into the System Model”). Tick the
  requirements, optionally name the part that satisfies them, choose **Preview** to see the changes, then
  **Bring into the model**.
- Each requirement becomes **one** requirement in the model named by its key (`REQ-001`), carrying
  `@EWS::ManagedRequirement { requirementId; revision; requirementKey; title }`: the UUID is the identity,
  the revision is pinned, key and title are shown in matrix headers. The statement is not copied.
- **Idempotent.** If the model already has a requirement carrying that managed requirement’s UUID, it is
  reused (the pin is kept; use **Update pin** to move it) and only missing `satisfy` links are added. A
  second element for the same managed requirement is never created. If only a requirement definition
  carries the link, a requirement usage typed by it is used (definition plus usage).
- The assistant does the same with `sysml-modeler.import_requirement` (a previewed proposal; command
  `importRequirement`).

## Link an existing SysML requirement

- Select a `requirement def` or `requirement` usage. Under **Managed requirement**, choose a
  requirement (for example `REQ-001`). The link is stored in the model as standard SysML metadata,
  `@EWS::ManagedRequirement { requirementId = "<UUID>"; revision = 3; }`, in a new commit.
- The title, statement and status shown come from the Requirements service at the pinned revision.
- When Requirements has a newer revision, a warning appears: review the change, then choose
  **Update pin**. **Unlink** removes the link.
- `satisfy R by x` in the model states that part `x` satisfies requirement usage `R`. It is a modelled
  claim, not verification evidence.
- The assistant can propose a link: "Link ActuatorSystem::Requirements::load to REQ-001"
  (`sysml-modeler.link_requirement`).

The identity is the requirement's UUID. Keys such as `REQ-001` are display text and may be
renumbered; validation rule `SYSML-MANAGED-REQUIREMENT` refuses links that carry only a key.
