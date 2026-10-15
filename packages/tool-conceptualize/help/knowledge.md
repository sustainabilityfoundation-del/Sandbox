---
help_id: conceptualize.knowledge
title: Design knowledge: functions, constraints, assumptions and links
kind: guide
summary: Functions say what must be accomplished, Constraints bound the design, Assumptions record what is taken as given; typed links connect them to Concepts, evidence and decisions.
keywords: [function, constraint, assumption, design link, performs, decomposes into, formalizes, depends on, rationale, review, validity, graph, search, batch]
operations: [conceptualize.create_function, conceptualize.convert_to_function, conceptualize.create_constraint, conceptualize.promote_constraint, conceptualize.record_assumption, conceptualize.create_link, conceptualize.rationale, conceptualize.traverse, conceptualize.search_design]
related: [conceptualize.concept.model, conceptualize.structure, conceptualize.decision, conceptualize.explorer]
---
Conceptualize keeps four kinds of design knowledge as separate records, each with a key, immutable
revisions and provenance (person, or assistant proposal and conversation):

| Record | Key | What it is |
| --- | --- | --- |
| Concept | CON-… | A possible solution or idea (unchanged) |
| Function | FN-… | What must be accomplished, independent of how. Never implemented directly and never an alternative |
| Constraint | CST-… | A bound on the design: qualitative, logical, mathematical, dimensional or interface; hard, soft or a preference |
| Assumption | ASM-… | Something taken as given, with a validation status (unvalidated, under review, validated, invalidated, retired) |

## Finding them

In the **Explorer**, choose **Functions**, **Constraints** or **Assumptions** in the record-type list next
to the search field. The list shows each record's status and **basis**; search filters by words. Choose a
record to open its inspector. **Create function** adds a Function directly.

## Functions

The inspector shows the verb phrase, description, flows (energy, material, signal, force, data in and
out), **objectives** with value or range, unit and basis, constraints on the Function and its links.

- **Decompose** adds a sub-function (a *decomposes into* link; cycles are refused).
- **Status**: draft, active or retired (with a reason).
- Concepts **perform** Functions: the seeded 500 N alternatives perform *Deliver controlled linear force*.

**Convert to Function** (a Concept's **Design knowledge** tab) is for Concepts that name a function rather
than a solution, such as *Provide controlled mechanical power transmission*. It is explicit, never
automatic. **Preview conversion** lists what will happen: a new Function derived from the Concept
revision, the function, behaviour, performance and constraint statements copied (quantified ones become
objectives with their basis), and every *implements* relationship re-expressed as *performs*. The
Concept, its relationships and its history stay unchanged. A Concept can be converted once.

## Constraints

- **Promote to constraint** (Design knowledge tab) turns a constraint statement with a quantity into a
  Constraint; the operator follows from the quantity (max gives ≤, min gives ≥, both give a range). The
  statement itself is unchanged.
- A Constraint can **formalize** one requirement at an exact (pinned) revision. If that requirement is
  revised, treat the Constraint as suspect and review it (Integration shows requirement link status).
- **Status**: proposed, active, relaxed or retired, with a reason. Relaxing or retiring a hard
  Constraint that formalizes a requirement needs a **reviewer**; the assistant can only propose.

## Assumptions

Assumption statements of a Concept are Assumptions: existing ones were created when the service was
upgraded; for new statements choose **Record … assumption statement(s)**. Each statement shows the key of
its Assumption (or Constraint) in the Intent tab. **Add assumption** records a free one.

**Validation** (inspector): *validated* needs an evidence record (for *invalidated* it is optional).
Validating or invalidating an Assumption that a recorded decision rests on needs a reviewer. The assistant can only put an Assumption
**under review**. Every change is kept in the validation history.

## Design links

Every inspector and the Design knowledge tab show **Design links**: stored links (performs, decomposes
into, depends on, constrains, interfaces with, derived from, supported by, contradicted by, verified by,
invalidated by, formalizes), Concept relationships and readings marked *(derived)* (for example an
evidence record's subjects). **Add link**: choose a type (only types allowed from this record are
listed), search for the target by key or words, choose the basis and add. The server checks the
endpoint types, duplicates, cycles for acyclic types and basis rules: a *supported by* link cannot claim
a stronger basis than the evidence, and *verified by* needs verified evidence. Removing a link is
recorded, never deleted. Administrators can register new namespaced link types (for example
`thermal:rejects-heat-to`) through the API.

## Decisions: rationale and validity

**Rationale and validity** under a decision assembles what it rests on: alternatives and outcomes,
supporting or contradicting evidence with its review status, Assumptions and Constraints with the
revision the decision pinned and the current one, the trade study and conditions under which the
decision becomes invalid. A decision superseded by a newer recorded decision is shown as
*invalidated*. **Rests on revised records** warns when a pinned revision is no longer
current. **Flag for review** sets the decision *under review* (the record is not edited); a reviewer
answers with **Still valid** or **Invalidate**. Flags are kept with who cleared them.

## Evidence reviews

Evidence can have several subjects. Records with basis **Calculated** carry a reproducibility manifest.
Reviewers **Accept** or **Reject** evidence independently; nobody can accept their own record and the
assistant cannot review.

## Through the API and the assistant

The API offers an atomic **batch** with placeholders (`$fn`), graph **traverse**, **neighbourhood**,
**paths** and cross-type **search** (see [API](conceptualize.api)). The assistant prepares Functions,
conversions, Constraints, Assumptions and links as previews you apply; it reads rationale, follows
links and searches. Its content is always labelled AI hypothesis.
