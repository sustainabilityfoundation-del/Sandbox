---
help_id: conceptualize.structure
title: Relationships and decomposition
kind: reference
summary: The nine relationship types, their direction and the validation rules (no self links, no duplicates, no containment cycles).
keywords: [relationship, contains, part of, depends on, interfaces with, alternative, derived from, refines, implements, conflicts, replaces, cycle]
related: [conceptualize.explorer]
---
| Type | Reads | Rules |
| --- | --- | --- |
| contains / part of | A contains B | acyclic over all decompositions; shared children allowed |
| depends on | A depends on B | cycles allowed |
| interfaces with | A interfaces with B | symmetric; may carry an interface definition (kind, flows) |
| alternative to | A is an alternative to B | symmetric |
| derived from | A is derived from B (for example a branch) | acyclic |
| refines | A refines B | acyclic |
| implements | A implements the more abstract B | acyclic |
| conflicts with | A conflicts with B | symmetric |
| replaces | A replaces B (B superseded) | acyclic |

Self links and duplicates (either direction for symmetric types) are refused. Removing a relationship
is recorded, not deleted. Relationships can cross abstraction levels.

**Decompositions** (Structure tab): add a named decomposition (for example *Hybrid-electric*), mark it
candidate, preferred or rejected, and choose it when adding a *contains* relationship. The tree groups
children by decomposition when a Concept has more than one.
