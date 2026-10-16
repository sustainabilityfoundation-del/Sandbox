---
help_id: conceptualize.visual
title: Visual comparison of alternatives
kind: guide
summary: Compare alternative Concepts side by side as cards whose primary visual is a structured, dimensioned 2D layout drawn from the engineering definition, with differences highlighted and constraints shown as intended, checked or verified.
keywords: [visual, layout, sketch, compare, card, dimension, component, parameter, interface, envelope, stage, not to scale, outdated]
operations: [conceptualize.define_concept, conceptualize.read_visuals, conceptualize.compare_cards, conceptualize.develop_alternatives]
related: [conceptualize.visual.refine, conceptualize.visual.handoff, conceptualize.visual.illustration, conceptualize.alternatives, conceptualize.decision]
---
Open **Visual comparison** in the Conceptualize page switcher and choose an alternative set. Each
alternative is a **card**:

- **Layout** (primary visual): a 2D drawing generated from the Concept's engineering definition. It is
  always available and needs no AI provider.
- **Operating principle**, **components and interfaces**, **key parameters**.
- **Benefits and trade-offs** (statements of kind *benefit* and *trade-off*).
- **Requirements and constraints**: *Intended* (no recorded check), *Checked (preliminary)* (an estimate or
  analysis result against the constraint) or *Verified* (verified evidence). A drawing or image never
  counts as a check.
- **Assumptions, open questions** and the **validation** summary (expand the card).

What differs between the alternatives is highlighted: components that not every alternative has, and
parameters (by symbol) whose values differ.

## The engineering definition

The definition of a Concept revision is the authoritative engineering data that layouts render and CAD
consumes:

| Part | Content |
| --- | --- |
| Functional intent | What the Concept must do |
| Components | Stable IDs (C1, C2 …) that never change or get reused; kind part, assembly, purchased, envelope or feature |
| Parameters | Symbol, value or range, unit and basis (user statement, AI hypothesis, assumption, estimate). Never "verified": verification comes from recorded checks against constraints |
| Interfaces | Between two components, optionally with their defining parameters |
| Relationships | contains, attached-to, supports, guides, drives, connected-to, clears |
| Layout | View (top, front, side, section), length unit, placements (numbers, or bound to a length parameter), dimensions that point at parameters |

The **stage** says how far the visual definition has come: *exploration* (principles, loose proportions),
*layout* (envelopes, interfaces, controlled dimensions) or *engineering* (parametric CAD, explicit
constraints).

## Dimensions and scale

Dimension labels come **only** from parameters: `symbol = value unit`. They are never measured from the
drawing and never taken from text in an image. An extent bound to its parameter is drawn to scale. If a
dimension sits on an extent that is a plain layout number, the label is still the parameter, the dimension
is marked *n.t.s.* and the drawing says **not to scale**.

## Revisions and "possibly outdated"

Every visual revision shows one exact Concept revision. When a relevant part of the definition changes
(for a layout: components, parameters or the layout), the visual is marked **possibly outdated** with the
changes listed. Nothing is redrawn automatically: choose **Re-render as a new revision**. The earlier
revision stays, with its annotations.

## With the assistant

Ask for alternatives with layouts, for example "Develop three concepts for a wall-mounted shelf bracket and
draw their layouts". The assistant writes the components, parameters and layouts itself
(`conceptualize.develop_alternatives` with a `definition` per alternative, or `conceptualize.define_concept`
for one Concept); you review and apply the proposal. `conceptualize.compare_cards` reads the cards.
