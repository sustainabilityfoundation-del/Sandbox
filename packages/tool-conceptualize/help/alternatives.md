---
help_id: conceptualize.alternatives
title: Alternative Explorer and branching
kind: guide
summary: Compare alternatives side by side, branch a Concept into a new alternative, withdraw candidates and keep rejected alternatives with their rationale.
keywords: [alternatives, branch, compare, side by side, variant]
operations: [conceptualize.develop_alternatives, conceptualize.compare]
related: [conceptualize.tradestudy, conceptualize.decision]
---
An **alternative set** groups competing solution Concepts under a parent and a question (“Which
actuation principle …?”). Each alternative is its own Concept, so branches never overwrite each other.

- **Branch** creates a new Concept from the current revision (own identity and history, *derived from*
  the original) and adds it to the same set. The toolbar **Branch** does the same for the open Concept.
- **Withdraw** removes a candidate from the set (it stays a Concept).
- Columns show principle, mechanism, performance estimates, assumptions and uncertainties with their
  basis.

Status (candidate, selected, rejected, deferred) changes only through [decisions](help:conceptualize.decision).

## Alternatives from the assistant

Ask the assistant for alternatives (for example “develop a concept of a protective cover for a
phone”). The assistant writes the alternatives itself: a name and a summary for each, optionally a
description, statements with quantities and part names, and a trade study (criteria with weights and
a score with a rationale per alternative). `conceptualize.develop_alternatives` records exactly what
the assistant wrote, as AI hypotheses (or the basis it states: assumption, estimate), under a new
parent Concept or an existing one. The preview card lists every alternative, statement, criterion and
score before you choose **Apply**.

The operation never invents alternatives. If the assistant calls it without alternatives, it is
refused with “Give the alternatives you propose: name and summary each”, and the assistant retries
with its own list. The small principle library (linear actuation, power transmission …) is used only
by the scripted demo assistant when no language model is connected; it never contributes to a real
model's proposal. `conceptualize.create` works the same way: the assistant gives the name and the
statements; your description is kept verbatim.
