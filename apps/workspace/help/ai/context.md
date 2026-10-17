---
help_id: ai.context
title: Platform context for the assistant
kind: guide
summary: How the assistant gets the facts of your project (intent, hosts, interfaces, constraints, unknowns) as exact, revisioned references, and how to see and control it.
keywords: [context, snapshot, digest, mandatory, budget, tokens, revision, stale, untrusted, documents, retrieve, assemble]
operations: [context.assemble, context.retrieve]
related: [ai.overview, ai.policy, ai.privacy]
---

The assistant can be given **platform context**: a snapshot of the project facts a task needs, read from the modules that own them
(Conceptualize and Project Management today). It is never a second copy of your project: a snapshot holds **references with exact
revisions** and short **projections** (values with unit, tolerance and datum, and summaries of at most 2,000 characters). Document
bytes are never included.

### Setting

**Settings → AI and reasoning → Model selection → Platform context** (`ai.context.mode`):

- **Off** (the default): nothing is added to requests.
- **Digest**: a short standing summary of the active intent, the hosts, the interfaces and the readiness is added to every turn.
- **Full**: the digest plus the records the task needs (constraints, unknowns, assumptions, background).

**Platform context size** (`ai.context.max-tokens`, default 12,000) caps one snapshot; the server uses the smaller of it and a quarter of the
model's context limit, with at most 400 items and 256 KB. Mandatory records (hard constraints in force, critical interfaces, material
unknowns) are always kept; if they alone exceed the budget the snapshot says **over budget** instead of dropping them. Numbers are
never rounded or summarised.

### What the assistant can do

- `context.assemble` builds (or reuses) a snapshot for a task as you, so project membership and your module permissions apply.
- `context.retrieve` returns items of a stored snapshot (records with a newer revision are flagged **stale**, never rewritten) and reads
  again the references a snapshot left out for lack of room.

Both only read. Applying a change still needs you.

### Trust

Everything in a snapshot is data, not instructions. Text from project documents is marked **untrusted external content**: it cannot
override the assistant's instructions, your AI settings or which operations it may run. Another project's records never appear, and a
record you are not allowed to read is reported as not authorized without saying how many exist.

### Traceability

A snapshot is stored unchanged with an ID (`CTX-…`). The usage record of each model call and the proposals prepared from it carry that ID, so a
proposal can be traced back to exactly what the model was given.
