---
help_id: conceptualize.architecture
title: Architectures, diversity and readiness
kind: guide
summary: Explore the different ways a solution can be organised before choosing dimensions, check that alternatives are really different, and see whether the recorded context is enough for the next activity.
keywords: [architecture, variant, diversity, readiness, exploratory, context established, interfaces verified, provisional, host interface, attachment principle, load path, gate]
operations: [conceptualize.assess_diversity, conceptualize.evaluate_readiness]
related: [conceptualize.context, conceptualize.alternatives, conceptualize.ai]
---
Alternatives are developed in two steps. First the **architectures**: different ways the solution can be organised.
Only then the **variants**: parameters, orientation, material and local shape within one architecture.

## The architecture block

An alternative recorded with level *architecture* carries a block in its engineering definition:

- **Host interface**: the interface to the system it works with. Empty when the design object works alone.
- **Attachment principle**, **interface geometry**, **load path** and **installation and removal**.
- **Advantages**, **disadvantages**, **risks**, **assumptions** (unverified) and **evidence required** before it can be
  relied on.

The service requires the attachment principle, the load path, installation and removal, at least one disadvantage and
at least one item of evidence required, for the person and the assistant alike. A *variant* names the architecture it
varies and states no architecture of its own. Unknown values of an existing system stay unknown: write them as
assumptions or as evidence required, never as facts.

## Diversity

**Assess diversity** compares the structured fields of the alternatives as text. It does not use keyword lists and does
not call a model. Alternatives whose fields say the same, or that differ only in parameters, are reported as variants and
do not count as different architectures. The result lists the distinct architectures, the variants, any alternative
without a block and findings in plain words, and whether the set reaches the number of architectures you asked for
(two by default).

## Readiness

**Evaluate readiness** says, per downstream activity, whether the recorded context is enough. There is no single
completeness percentage.

| Level | Meaning | Activities it allows |
| --- | --- | --- |
| Exploratory | An intent is recorded and it is decided whether the design object works with another system. | Architecture concepts |
| Context Established | The systems involved are identified, nothing essential is missing and an architecture states its host interface. | Host-specific concepts |
| Interfaces Verified | The critical interface information is verified. | Dimensioned design, CAD handoff |

Readiness is **advisory** in this phase. Nothing is refused: previews of architecture-first alternatives and the CAD
handoff are labelled *provisional* and list what is unmet. Interface and fact records, and so verified interface
information for a design that works with another system, are not available yet; such a design stays provisional for
dimensioned design and CAD handoff. A design object that works alone has no outside interface to verify.

## With the assistant

Ask for alternatives; the assistant first records architectures, checks them with **assess diversity**, and develops
variants of the one you select. Ask it to **evaluate readiness** before dimensioned design or a CAD handoff.

## API

`GET /diversity` (name the alternatives with `conceptIds`, `setId` or `parentId`) and `GET /readiness` (`intentId`,
`activity`, `conceptId`); see the interactive API reference.
