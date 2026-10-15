---
help_id: conceptualize.ai
title: AI collaboration
kind: guide
summary: The scripted demo assistant proposes Concepts, alternatives, decompositions, decisions and links as previews; you apply them; AI content stays labelled until confirmed.
keywords: [ai, assistant, chatgpt, demo, hypothesis, proposal, apply, undo, provenance, next steps]
operations: [conceptualize.search, conceptualize.read, conceptualize.create, conceptualize.develop_alternatives, conceptualize.decompose, conceptualize.compare, conceptualize.propose_decision, conceptualize.link_artifact, conceptualize.propose_requirement, conceptualize.request_realization, conceptualize.next_steps]
related: [conceptualize.concept.model, conceptualize.alternatives]
---
**No language model is connected.** The demo assistant understands example requests:

- *Develop three alternative concepts for a compact mechanical actuator capable of delivering 500 N of
  linear force within a 100 mm envelope.*
- *Create a concept: …*, *Decompose CON-018 into drive, guide and housing*
- *Compare the alternatives of CON-005*, *Pursue CON-019*, *What are the next steps for CON-001?*
- *Link CON-019 to CAD-120*, *Propose requirements for CON-018*, *Request CAD generation for CON-019*

Every change is a **preview** in the assistant panel. Nothing changes until you choose **Apply**;
**Undo** applies a compensating change (archive, withdraw, unlink). Applied changes record the
conversation and proposal; the AI collaboration page lists them per Concept.

Generated content is labelled **AI hypothesis** or **Estimate**. Estimates are computed from your
quantities with textbook formulas and stated assumptions, never invented, and never verified. Review
them under **AI hypotheses to review** (Confirm or Remove).

**Explorations** (AI collaboration page) lists the alternative sets generated for the open Concept.
**Undo** archives the generated Concepts, removes their relationships and withdraws the alternatives;
nothing is deleted. Undo is refused once a decision has been recorded on those alternatives or one of
them has passed an approval gate.
