# ADR-0081: ECII placement, federated context graph, interface ownership and product origin

Status: Proposed (16 October 2026, ECII implementer, increment 1; for coordinator acceptance with the [ECII plan](../specifications/ecii-plan.md)).

## Context

The owner's [ECII brief](../specifications/ecii-brief.md) asks the platform to understand the engineering context of a request:
what is designed, whether it works with an existing system, which interfaces constrain it and what is still unknown. The root cause
of the drill-bit holder behaviour is recorded in the plan §1: the instructions never ask about integration, Concept interfaces can
only join a Concept's own components, product elements do not distinguish designed from existing, and nothing structured records
the interpretation. A parallel module or database would duplicate existing capabilities and break the rule that each object type
has one owning module.

## Decision

1. **Placement.** ECII is a capability across existing modules, not a module or service. New record types are revisioned
   Conceptualize types registered in the artifact registry: the engineering intent `INT-` (increment 1, kind `intent`), the
   interface `IFC-` and facts (increment 3). Projects keeps products, documents and sources. No new database; no new
   `ARTIFACT_OWNER` or `DELEGATIONS` entry in Phase 1.
2. **Federated graph.** The context graph is a federated view over the Conceptualize design graph (`traverse`, ADR-0041) and the
   Projects artifact registry, product registry and links. Nothing is copied: records hold `ArtifactRef`s with revisions.
3. **Interface ownership, option A (chosen).** An interface is a Conceptualize record at project level whose ends are `ArtifactRef`s to
   product elements (and Concept components); the interface is the edge, and its `relation` (mounts-to, connects-to,
   integrates-with, interferes-with) types it. The product registry owns the products at the ends; Conceptualize owns the interface
   definition and its facts. Alternatives rejected: (B) a new service, which would add a deployable and a database for a record
   type that shares Conceptualize's revisioning, basis and audit rules (own tables and route group keep the option to move it later);
   (C) the product registry, which would put engineering reasoning, revisions and basis rules in a registry module. Interfaces as
   SysML elements were also set aside: they would make Conceptualize depend on the System Model for early-phase work (SysML links
   come in Phase 2 as `InterfaceLink` metadata). Interface definition, candidate
   interface requirement and verification activity stay separate records.
4. **Product origin.** Product elements gain `origin` (designed, existing, purchased) and `identification` (manufacturer, model,
   revision) in increment 3, additively, so a host is a product element rather than an invented component, in line with "never
   create a second component to represent an existing one". Increment 1 adds no field to product elements; an external system
   without a product element keeps its description and `identified: false` in the intent.
5. **Domain independence.** No engineering noun in rules, schemas, code or instruction lines; the model fills in structure, code
   validates it and computes gaps. Enforced by a test over the ECII source files and the instruction lines (fixtures excepted). This
   follows [ADR-0070](0070-development-assurance-boundaries.md): no standard-specific gates in generic modules.
6. **Basis.** Intents written by the assistant carry the basis `ai-hypothesis`; the service refuses other assistant bases
   ([ADR-0043](0043-basis-of-knowledge-and-promotion.md) ladder as implemented in Conceptualize `ASSISTANT_BASES`).

## Open-source evaluation (summary)

Considered for the intent and interface model: SysML v2 (interface and connection usages; mapped later in Phase 2, no code), ReqIF
(requirements exchange only), PROV-O (provenance vocabulary, concept only), and general knowledge-graph stores (a second store would
split the source of truth). No established open-source component models engineering intent with revisioned, basis-labelled,
tool-agnostic records that fit the existing Conceptualize ownership model, so the types are implemented in the existing service on
PostgreSQL with no new dependency. Details: [engineering-practice.md](../research/ecii/engineering-practice.md).

## Consequences

- One owner per type; Requirements, System Model and CAD receive interface data through references and the SDK, never copies.
- Increment 1 ships the intent only; interfaces, facts and `origin` follow in increment 3 with their own migrations.
- Deterministic computations (gaps, later readiness) are testable on PostgreSQL without a model; fake-provider replays prove
  structure and plumbing, not reasoning quality.
- A later move of interface ownership would be an ADR, because `RELATIONSHIP_RULES` and the artifact registry would change.
