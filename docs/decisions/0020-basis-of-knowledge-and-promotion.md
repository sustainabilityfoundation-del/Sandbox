# ADR-0020: Basis-of-knowledge ladder and promotion rules

Status: Proposed (2026-10-14)

## Context

The brief (§5 Evidence Evaluator) requires distinguishing hypotheses, assumptions, qualitative assessments,
preliminary estimates, calculated results, verified results and approved decisions, and forbids an AI
assertion becoming verified evidence without validation. Conceptualize already enforces a basis on statements,
scores and evidence (`user-assertion`, `ai-hypothesis`, `assumption`, `estimate`, `evidence`, `decision`) and
refuses assistant writes of `user-assertion`, `evidence` and `decision`. It has no level for qualitative
assessments or for deterministic calculated results.

## Decision

- The ladder, lowest to highest: `ai-hypothesis`, `assumption`, `assessment` (qualitative judgement),
  `estimate` (preliminary, not through a registered model), `calculated` (registered model executed by the
  deterministic engine, reproducible manifest), `evidence` (verified: accepted by a reviewer or a verification
  record), `decision` (recorded design decision). `user-assertion` stays as a separate provenance-type basis
  (stated by a person, unverified), ranked with `assumption` for derivation purposes.
- Promotion rules, enforced by Conceptualize: assistant/reasoning sources may write `ai-hypothesis`,
  `assumption`, `assessment`, `estimate`, and `calculated` **only** with a manifest that Conceptualize
  re-verifies (ADR-0021); `evidence` needs a reviewer's review record; `decision` needs a recorded decision.
- A derived conclusion's basis is the minimum of its inputs' bases (a calculation on hypothesis inputs is an
  estimate). Stale inputs make conclusions stale.
- Confidence scores, repetition and retrieval similarity never raise a basis.

## Consequences

- Users can always see how something is known; the UI shows the basis everywhere.
- Adds two enum values to Conceptualize and the SDK proposal item (additive).
- Some useful AI output will remain `ai-hypothesis` until a person confirms it; that is intended.
- Alternatives considered: a numeric confidence score (rejected: invites false precision and is not an
  engineering status); a single verified/unverified flag (rejected: loses the distinctions the brief requires).
