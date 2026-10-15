---
help_id: conceptualize.concept.create
title: Create a Concept from natural language
kind: guide
summary: New concept turns your description into a reviewed draft with functions, constraints with units, questions and assumptions.
keywords: [new, create, natural language, describe, draft, child]
operations: [conceptualize.create, conceptualize.decompose]
related: [conceptualize.concept.model, conceptualize.getting-started]
---
Choose **New concept** and describe the idea. The draft recognizes:

- the subject (“… concepts for **a compact mechanical actuator** capable of …”);
- quantities with units and their bounds (“at least 2 kg”, “within 100 mm”, “10–20 mm”);
- functions (“capable of delivering … linear force” → *Deliver linear force*);
- questions (sentences ending with ?) and assumptions (“Assume …”).

The recognition is deterministic and covers common phrasing only; check it before **Create Concept**.
The description is always stored verbatim. **Add child** creates a Concept inside the open one
(contains), and **Branch** creates an alternative of it.

Through the assistant, *Create a concept: …* prepares the same draft as a proposal, and *Decompose
CON-018 into drive, guide and housing* prepares child Concepts; their interpreted statements are AI
hypotheses until confirmed.
