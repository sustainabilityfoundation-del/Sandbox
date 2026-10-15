---
help_id: conceptualize.requirements
title: Requirement traceability
kind: guide
summary: Link Concepts to requirements (satisfies, refines, derives, proposes); propose draft requirements; requirements stay authoritative in Requirements.
keywords: [requirement, traceability, satisfies, proposes, draft]
operations: [conceptualize.propose_requirement]
related: [conceptualize.implementation]
---
Concept links reference requirements by canonical UUID and pin their revision. *Satisfies* states
design intent; it is not verification. When a requirement changes, the link shows *Changed since
linked* until you accept the new revision.

The assistant can **propose draft requirements** for quantified constraints (*Propose requirements for
CON-018*): after Apply they are created as **drafts** in Requirements and linked with *proposes*.
Review and approval stay in Requirements; Conceptualize never establishes approved requirements.
