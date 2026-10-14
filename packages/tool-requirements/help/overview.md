---
help_id: requirements.overview
title: Requirements Management
kind: overview
summary: Write, review, trace and verify requirements stored in the Requirements service, shared with every tool in the workspace.
keywords: [requirements, overview, introduction, specification]
related: [requirements.getting-started, requirements.requirement.create, requirements.lifecycle]
---

Requirements Management keeps each requirement as a controlled record: a stable identity, a
human-readable key such as `REQ-001`, and immutable revisions. Other tools (SysML, CAD, the inspector
and the assistant) read the same canonical requirement; none of them keeps its own copy.

## What you can do

- Write requirements with a normative **statement**, rationale, type, source, owner and priority
  ([Create a requirement](help:requirements.requirement.create)).
- Edit safely: every save is a new revision with a reason, and edits based on an old revision are
  refused instead of overwriting someone else's work ([Edit a requirement](help:requirements.requirement.edit)).
- Allocate requirements to components and link them to other requirements
  ([Trace and allocation](help:requirements.requirement.trace)).
- Move requirements through review and approval ([Lifecycle and reviews](help:requirements.lifecycle)).
- Organise specifications in collections with headings ([Collections](help:requirements.collections)).
- Pin baselines and compare revisions ([Baselines](help:requirements.baselines)).
- Record verification results pinned to the exact revision ([Verify a requirement](help:requirements.requirement.verify)).
- Check wording quality ([Quality checks](help:requirements.quality)).
- Exchange specifications as ReqIF or JSON ([Import and export](help:requirements.exchange.reqif)).

## Pages

The tool has five pages: **Requirements** (table and details), **Matrix**, **Baselines**, **Quality**
and **Import / export**.

Approval, verification results, compliance assessment and modelled satisfaction (SysML `satisfy`)
are separate records. An approval says a revision was reviewed and accepted; it is not evidence that
the requirement is met.
