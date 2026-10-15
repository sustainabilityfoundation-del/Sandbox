---
help_id: conceptualize.troubleshooting
title: Troubleshooting
kind: troubleshooting
summary: What the common messages mean: conflicts, refused units, cycles, approval gates, demo mode and an unreachable service.
keywords: [error, conflict, cycle, unit, forbidden, demo, unavailable]
related: [conceptualize.roles, conceptualize.structure]
---
- **Someone else changed this first** (conflict): the Concept has a newer revision. Load the latest
  and reapply your edit; nothing was overwritten.
- **Unknown unit / dimensions differ**: use a supported unit of the right kind (force in N or kN, not
  mm). See [the concept model](help:conceptualize.concept.model).
- **Would create a cycle**: a Concept cannot (indirectly) contain itself, across all decompositions.
- **Approval gate** (forbidden): selecting, recording accepted or rejected decisions and verification
  need a reviewer or administrator.
- **The assistant may only record ai-hypothesis …**: assistant content cannot be stored as your
  statement or as verified evidence; confirm it yourself.
- **Demo data**: the service setting uses in-browser demo data; authoring needs API mode.
- **Not reachable**: start the backend (`npm run dev:api`); nothing is replaced by other data.
