---
help_id: conceptualize.context
title: Engineering intent and information gaps
kind: guide
summary: The engineering intent (INT-…) records what is being designed, whether it works with an existing system, which systems are involved, what is not yet known and what has to be asked; gaps are computed from that structure.
keywords: [intent, INT, engineering context, integration, external system, host, information gap, tier, question, clarification, standalone]
operations: [conceptualize.interpret_intent, conceptualize.read_context, conceptualize.identify_gaps]
related: [conceptualize.knowledge, conceptualize.ai]
---
An **engineering intent** (`INT-001`) is the first thing recorded about a design request. It answers, in a
structured form, what is being designed, what role it has (standalone, accessory, component, modification or
system) and **whether it works with an existing system**. Every change is a new, immutable revision. The
assistant writes the intent with the basis *AI hypothesis*; a person confirms or corrects it.

## The parts of an intent

- **Integration** is one of standalone, hosted, embedded, connected, replacement or undetermined, with a
  short rationale. Standalone means the design object works alone; any other mode means another system is
  involved; undetermined means this is not yet known.
- **External systems** are the systems the design object works with. Each has a name, a role, a description,
  whether it is identified, who owns that side of the interface (project, external or shared) and how the design
  relates to it (mounts to, connects to, integrates with, interferes with). A system that is only described keeps
  its description and stays unidentified. A system can reference a product element.
- **Objectives** and **environment** in plain statements.
- **Information needs** are what is missing. Each has a tier (1 essential, 2 concept, 3 detail, 4 immaterial) and
  a route: research, ask the user, measure or defer. Only tier 1 needs are ever researched automatically.
- **Questions** carry the text, why it is asked, its impact (blocks, changes architecture, refines) and the options
  the person can choose from, for example continue generically, identify the system, upload photos or CAD, or supply
  measurements.
- **Assumptions** the intent rests on (ASM-…).

## Gaps

**Identify gaps** lists the missing information in four tiers. It is deterministic: the service computes it from
the structure, never from the words. An undetermined integration, a mode that involves another system without a
listed system, and every unidentified system the design attaches to are essential gaps. A standalone intent has
no system gaps.

## With the assistant

Ask the assistant to **interpret the intent**: it proposes an intent that you review and apply. **Read context**
returns the intent with its assumptions, the project constraints and concepts, and its open questions.
When essential information is missing, the assistant asks a few targeted questions instead of inventing values.

## API

`GET/POST /intents`, `GET/PATCH /intents/{id}`, `GET /intents/{id}/revisions`, `GET /intents/{id}/gaps` and
`GET /intents/{id}/context` (see the interactive API reference).
