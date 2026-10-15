---
help_id: sysml-modeler.requirements
title: Requirements in the model
kind: guide
summary: Link a SysML requirement definition or usage to a requirement managed by Requirements Management; its text is read live and stale pins are flagged.
keywords: [requirement, managed requirement, link, traceability, satisfy, reqif, REQ]
related: [sysml-modeler.properties, sysml-modeler.commands, sysml-modeler.ai]
operations: [sysml-modeler.link_requirement]
---

Requirements Management owns requirement records (key, title, statement, revisions, reviews). The
SysML model refers to them; it never keeps a competing copy.

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
