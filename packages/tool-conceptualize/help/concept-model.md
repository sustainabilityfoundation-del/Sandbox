---
help_id: conceptualize.concept.model
title: Concepts, statements and the basis of knowledge
kind: reference
summary: What a Concept contains, how statements are typed, and how user statements, AI hypotheses, assumptions, estimates, evidence and decisions are kept apart.
keywords: [statement, basis, ai hypothesis, assumption, estimate, evidence, units, quantity, abstraction]
related: [conceptualize.maturity, conceptualize.ai]
---
A Concept has a UUID and a key (`CON-001`, display only), a name, summary, a natural-language
description (kept verbatim), a purpose, an **abstraction** (function, component, assembly, subsystem,
system, abstract; it never restricts what the Concept can become), classifications, structured
attributes and **statements**.

**Statements** are typed: function, desired behavior, physical principle, intended effect, input,
output, constraint, interface, candidate mechanism, problem solved, capability, expected performance,
assumption, known uncertainty, open question, rationale, note. A statement may carry a **quantity**
(value, unit, min, max); units are checked by the server (N, kN, mm, N*m, m/s^2, kg/m^3, %, EUR …)
and wrong dimensions are refused.

Every statement has a **basis**:

| Basis | Meaning |
| --- | --- |
| User statement | Stated by a person; not verified |
| AI hypothesis | Proposed by the assistant; unverified until a person confirms it |
| Assumption | Engineering assumption to be confirmed |
| Assessment | Qualitative engineering judgement by a person; not a calculation |
| Estimate | Preliminary calculation with stated assumptions |
| Calculated | Result of a reproducible calculation: the evidence record carries a manifest; not independently verified |
| Verified evidence | Linked to a verified evidence record |
| Decision | Established by a recorded design decision |

The ladder runs from AI hypothesis (weakest) through assumption or user statement, assessment, estimate,
calculated and verified evidence to decision. A statement marked **Calculated** must cite a calculated or
verified evidence record. The assistant can only record AI hypotheses, assumptions, assessments and
estimates; it cannot record calculated results yet. Turning an AI hypothesis into
a user statement needs an explicit **Confirm**, which records who confirmed it. Every edit creates an
immutable **revision** with its provenance (person, or assistant proposal and conversation).
