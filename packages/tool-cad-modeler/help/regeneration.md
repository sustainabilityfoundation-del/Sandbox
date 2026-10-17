---
help_id: cad-modeler.regeneration
title: Regeneration and failures
kind: guide
summary: How changes propagate through the dependency graph, what is rebuilt incrementally, and how failures and blocked features are reported.
keywords: [regenerate, rebuild, dependency, failure, error, blocked, incremental, cache]
related: [cad-modeler.troubleshooting, cad-modeler.parameters]
---

The model is regenerated after every change: parameters are evaluated, sketches solved, then each
feature is rebuilt in history order by the kernel in a background worker. Every step has a content
key; unchanged steps are reused from a cache, so changing one dimension rebuilds only what depends
on it. **Diagnostics** lists what was rebuilt and reused, and how long it took.

Feature status: **OK**, **Failed** (with the reason, for example a non-positive length or a profile
crossing the revolution axis), **Blocked** (an earlier sketch it needs failed or is suppressed) and
**Suppressed**. A failure never stops the rest of the model. **Full regeneration** clears the cache
and rebuilds everything.

**Blocked features name their cause.** A blocked feature does not just say "failed": its message names
the feature it needs, says whether that one failed or is suppressed, and quotes the message of the
feature whose own failure started the chain (*Root cause in “Sketch 2” (sk-7): …*). **Diagnostics**
shows the message with a **Show** button that selects that feature. Fix the root cause and the
dependent features rebuild. A lost face or edge is repaired in **Diagnostics → Repair reference**
([repair a lost reference](help:cad-modeler.repair-reference)).
