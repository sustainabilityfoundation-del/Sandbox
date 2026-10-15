---
help_id: conceptualize.tradestudy
title: Trade studies
kind: reference
summary: Multicriteria comparison with weights, quantities with units and ranges, qualitative 1–5 scores and a documented weighted-sum evaluation.
keywords: [trade study, criteria, weight, score, uncertainty, range, mass, cost, risk]
related: [conceptualize.alternatives, conceptualize.decision]
---
Criteria: performance, mass, cost, complexity, manufacturability, risk or custom, each with a weight,
a direction (higher or lower is better) and a scale (quantity with unit, or qualitative 1–5). A score is
a value or a range (low–high) in any compatible unit (converted; wrong dimensions are refused), with a
basis and rationale. Scores are append-only: earlier scores stay in the history.

Evaluation: each quantity criterion is normalized to 0–1 over the span of the options, qualitative
scores map 1–5 to 0–1, and the weighted sum is computed over the scored criteria. Ranges propagate to a
score range. **Coverage** shows the share of weight that was scored; missing scores are listed, not
guessed. The ranking is *robust* only when the best option's range does not overlap the others.
Results are **preliminary** unless every score is verified evidence.
