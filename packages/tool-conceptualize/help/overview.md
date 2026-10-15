---
help_id: conceptualize.overview
title: Conceptualize
kind: overview
summary: Create, explore, compare and evolve engineering ideas (Concepts) before and during their realization in SysML, CAD and analysis.
keywords: [concept, idea, conceptual design, alternatives, trade study]
related: [conceptualize.getting-started, conceptualize.concept.model, conceptualize.implementation]
---
A **Concept** is a persistent engineering idea: a function, solution, component, assembly, subsystem or
whole system. It exists without any CAD model or SysML element and keeps its identity (`CON-001`) while
it matures and while its implementations change.

Conceptualize keeps **what a design should achieve** (purpose, functions, constraints, assumptions,
open questions) separate from **how it is implemented** (ConceptImplementations that reference
requirements, SysML elements, CAD representations, components, analysis results and documents).

Pages:

- **Explorer**: search, filter and navigate Concepts as a [tree or graph](help:conceptualize.explorer); open one in the [Concept workspace](help:conceptualize.workspace).
- **Alternatives**: compare alternatives side by side, run [trade studies](help:conceptualize.tradestudy) and record [design decisions](help:conceptualize.decision).
- **Integration**: [implementations and links](help:conceptualize.implementation), [requirement traceability](help:conceptualize.requirements) and [change notifications](help:conceptualize.integration).
- **AI collaboration**: review [AI hypotheses](help:conceptualize.ai), assumptions and next steps.

Everything is stored by the Conceptualize service (PostgreSQL); see [the API](help:conceptualize.api).
