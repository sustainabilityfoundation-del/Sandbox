---
help_id: conceptualize.calculations
title: Calculation models and calculated evidence
kind: guide
summary: Deterministic calculation models (CALC-…), read-only evaluation with honest uncertainty labels, recording a result as evidence that Conceptualize reproduces, and what such evidence does not establish.
keywords: [calculation, model, CALC, evaluate, manifest, calculated, estimate, bounds, enclosure, sampled, point value, validation, buckling, library]
operations: [conceptualize.evaluate_calculation, conceptualize.record_calculation]
related: [conceptualize.knowledge, conceptualize.tradestudy, conceptualize.decision]
---
A **calculation model** (`CALC-001`) is a small set of parameters (inputs, constants, design variables,
outputs, each with a unit) and relations (assignments such as `I = pi * d^4 / 64`, checks such as
`P_cr >= n * F`), with the conditions under which it is valid. The deterministic calculation engine checks
the units and expressions when the model is saved. Every change is a new, immutable revision.

## Finding and creating models

In the **Explorer**, choose **Calculations**. **New model from the library** starts from a reviewed library
entry (for example Euler buckling of a solid round column), shown with its sources, assumptions and
limitations. A library model, and any model the assistant proposes, starts **unvalidated**.

Parameters may be **bound** to design records: an Assumption's value, a Constraint's bound or a Concept
attribute. Bound inputs follow the record; the evaluation shows where each value came from.

## Evaluating

**Evaluate** in the inspector runs the model without storing anything. Leave an input empty to use its binding
or default. With **Interval (input ranges)**, give a minimum and maximum for an input.

Each output is labelled with what is known about it:

| Label | Meaning |
| --- | --- |
| point value | Computed at the nominal inputs |
| exact bounds min–max | The range is attained (proven) |
| enclosure min–max (true range may be narrower) | The true range lies inside (sound bounds) |
| sampled values min–max (n samples; not a bound) | Values seen at sample points; the true range may be wider |

A check is **satisfied** or **violated** *at the nominal point*, or *over the input ranges* only when that is
proven by exact bounds or an enclosure; otherwise it is **uncertain: not proven over the input ranges**.

## Recording evidence

**Record as evidence** stores the result for a Concept. Conceptualize **reproduces the calculation** from the
stored model revision before it is saved and refuses results that do not reproduce. The basis is what the
engine allows: *Estimate* for an unvalidated AI-hypothesis model or AI-hypothesis inputs, otherwise
*Calculated*. Basis *Calculated* is never accepted without such a reproducible calculation.

A reproducible calculation shows only that the outputs follow from that model revision and those inputs. **It
does not establish that the model is valid for the design, or that any requirement is satisfied**; every
record and decision rationale says so. Evidence never changes a requirement's or a Concept's verification
status.

## Validation

A reviewer **Validates** a model after checking it for this kind of design; the reason is recorded. Editing
the model creates a new revision that is unvalidated again. **Deprecate** retires a model.

## Trade studies

A quantity score can be taken from calculated evidence by naming its output: the score must equal the output
(and its range, if the output has one) and keeps the output's label. A ranking is **robust** only when the
score ranges separate and none of them is a sampled range.
