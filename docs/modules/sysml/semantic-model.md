# Semantic model and persistence architecture

Status: Proposed (ADR-0032, ADR-0033, ADR-0036). Implementation: `packages/sysml-core`, `services/sysml`.
Standards background: [research/sysml/standards.md](../../research/sysml/standards.md).

## 1. Principle: the stored model *is* the abstract syntax

The brief forbids a simplified proprietary graph (B§4). The module therefore stores exactly the
instances of KerML/SysML v2 abstract syntax metaclasses that the specifications define, using the
same metaclass names and property names as the Systems Modeling API JSON serialization:

- Every element has `@id` (= `elementId`, a UUID) and `@type` (the metaclass name, e.g. `PartUsage`).
- **Relationships are elements.** Ownership is not a parent pointer: an element is owned through an
  owning relationship (`OwningMembership`, `FeatureMembership` and its specializations) whose
  `ownedRelatedElement` it is. `owningRelationship` and `ownedRelationship` are the stored links;
  `owner`, `owningNamespace`, `ownedMember`, `ownedFeature`, `qualifiedName`, … are **derived**.
- Specialization is stored as `Subclassification`, `FeatureTyping`, `Subsetting`, `Redefinition`,
  `ReferenceSubsetting` relationships owned by the specific element (`specific`/`general`,
  `typedFeature`/`type`, `subsettingFeature`/`subsettedFeature`, …).
- Values are `FeatureValue` relationships owning an `Expression` element tree
  (`LiteralInteger`, `LiteralRational`, `LiteralString`, `LiteralBoolean`, `FeatureReferenceExpression`,
  `OperatorExpression`, `InvocationExpression`, `FeatureChainExpression`).
- Multiplicities are owned `MultiplicityRange` elements with bound expressions.
- Documentation and comments are `Documentation`/`Comment` elements with `body`.

A relational database is used for persistence and indexing (B§4 allows it); the JSON payload of each
element version is the standard serialization of that element, so nothing of the KerML/SysML
semantics is lost in storage.

### 1.1 Element record (core and wire format)

```jsonc
{
  "@id": "6f0c…",                 // elementId
  "@type": "PartUsage",           // metaclass
  "declaredName": "motor",
  "declaredShortName": "M1",       // optional
  "isAbstract": false, "isVariation": false, "direction": null, "isComposite": true, …   // metaclass attributes
  "owningRelationship": { "@id": "1a2b…" },
  "ownedRelationship": [ { "@id": "…FeatureTyping" }, { "@id": "…FeatureMembership" } ]
}
{
  "@id": "…FeatureTyping", "@type": "FeatureTyping",
  "owningRelatedElement": { "@id": "6f0c…" },
  "typedFeature": { "@id": "6f0c…" }, "type": { "@id": "…PartDefinition Motor" }
}
```

The core keeps attributes the specifications mark as stored (non-derived). Derived attributes are
computed on demand and may be **added** to API responses (`derived: true` option) for clients that
expect them, as the pilot implementation does; they are never accepted as input.

### 1.2 Metamodel registry

`sysml-core/src/metamodel` declares each supported metaclass with: name, supertypes, abstract flag,
own stored attributes (type, multiplicity), and its reference properties (which hold `{ "@id" }`).
The registry is the single source for: JSON (de)serialization, command schemas (which metaclasses a
command may create), kind compatibility in validation, and the conformance list. It covers the subset
listed in [conformance.md](conformance.md); unknown metaclasses in imported JSON are **preserved
opaquely** (kept and re-serialized unchanged, reported as "unsupported metaclass") rather than dropped.

### 1.3 Model store

`Model` (in-memory) holds elements by ID with indexes maintained incrementally:

- owner index (owning relationship → owned element, namespace → memberships, in order),
- reverse reference index (element → relationships/elements that reference it), used for impact
  analysis, referential integrity on delete, and incremental invalidation,
- name index per namespace (member name / short name → memberships) for resolution.

Everything derived (qualified names, inherited memberships, resolved types) is cached per model
revision and invalidated by element ID on change. The store has no parent pointers that could
disagree with the relationships.

## 2. Model library

SysML models rely on the standard library (implicit specializations such as every `part` subsetting
`Parts::parts`; `ScalarValues::Real`; ISQ quantities and SI units). Licence facts are in
[research/sysml/reference-implementations.md](../../research/sysml/reference-implementations.md) and
the progress file's licensing review. Design (ADR-0036):

1. **Platform library subset** (`sysml-core/src/library/*.sysml`), written by us in textual notation,
   declaring the standard *names* the implementation needs (Base, ScalarValues, Parts, Items, Ports,
   Connections, Interfaces, Actions, States, Requirements, Constraints, Calculations, ISQ subset, SI
   subset, platform metadata `EWS`). It is a stand-in that declares names and kinds with our own
   wording; it does **not** copy the OMG library text and does not claim to be the standard library.
   Library elements have deterministic IDs (UUIDv5 of the qualified name) so references to them are
   stable across processes.
2. **Official library** (optional): `npm run sysml:library` downloads the release library into
   `.data/sysml-library` (not committed). When present, the loader parses it (reporting the subset it
   could not parse) and conformance tests run against it; unsupported constructs are listed.
3. Library elements are read-only; commands refuse to modify them.

## 3. Name resolution (KerML §8.2 subset)

For a qualified name `A::B::c` resolved in namespace N: resolve the first segment visible from N, then
each following segment as a **member** of the previous namespace (owned, inherited, imported; public
only from outside). The "visible from N" search order is: N's owned memberships, N's inherited
memberships (via its specializations, with redefined features hidden), N's imports (membership and
namespace imports, `::*`, `::**` recursive), then the enclosing namespace, up to the root, then the
global namespace (root packages of the model and the library). Feature chains `a.b.c` resolve `b` as a
feature of the type(s) of `a`. Aliases (`alias X for Y`) are memberships whose member element is the
target. Private members are visible inside the namespace and its nested namespaces only.

Unresolvable names are errors with the source range when they come from text, or the relationship ID
when they come from the API.

## 4. Validation

Rules (IDs `SYSML-…`) run on the whole model or incrementally on changed elements and their
dependents. Each diagnostic: `{ ruleId, severity, elementId, message, range? }`. The rule list, with
the spec constraint each approximates and its test, is in [conformance.md](conformance.md#validation-rules).
Validation runs after every transaction; the transaction result reports `introduced` and `resolved`
diagnostics; the AI path uses policy `reject-new-errors` by default (ai-commands.md §6).

## 5. Units and quantities

Quantity literals are written as in SysML v2: `12.5 [kg]`, `24 [V]`, `3 [m/s]`. They parse to an
`OperatorExpression` with operator `'['` (value, unit reference). The core's unit table (SI base and
derived units, prefixes, a few common non-SI units) gives each unit a dimension vector; ISQ quantity
value types in the library (e.g. `ISQ::MassValue`) carry their dimension. Validation checks that a
literal quantity assigned to an attribute typed by a quantity value type has the same dimension, and
the evaluator converts between units of the same dimension.

## 6. Persistence (PostgreSQL schema `sysml`)

Aligned with the Systems Modeling API resource model: project → commits (each with a change set of
data versions) → branches and tags pointing at commits.

| Table | Purpose |
| --- | --- |
| `projects` | SysML project (API `Project`): UUID, name, description, `platform_project_id` (authorization scope, e.g. `PRJ-ACT100`), default branch |
| `commits` | API `Commit`: UUID, project, `number` (per-project sequence, used as numeric revision in `ArtifactRef`), parent commit IDs, actor, source (user/assistant/import/api + conversation/proposal IDs), description/reason, the typed commands (JSON), counts, created time. Append-only (trigger refuses update/delete) |
| `element_versions` | API `DataVersion`: one row per element per commit that changed it: version UUID, element ID, commit, metaclass, declared name, owner element ID, `payload` (standard JSON, `null` for deletion). Append-only |
| `branches` | API `Branch`: name, head commit, `revision` (optimistic lock); moving the head is the only update |
| `branch_elements` | Head index: for each branch the current version of each live element (`branch_id, element_id → version_id`, plus metaclass/name/owner copies for indexed queries). Maintained in the commit transaction; rebuildable from history |
| `element_refs` | Reference index per version: (version, referenced element, property). Joined with `branch_elements` it answers "who references X" at a head |
| `tags` | API `Tag` (baselines): name, commit |
| `outbox` | Transactional outbox for SSE (`sysml.commit-created`, `sysml.branch-updated`, `sysml.tag-created`, `sysml.project-created`) |
| `idempotency_keys` | Idempotent replays (24 h) |

**Reading a commit.** At a branch head: `branch_elements` (indexed, paged). At an older commit: the
latest version of each element among the commit's ancestors (recursive CTE over parents, ordered by
commit number). Histories are linear per branch until merge exists (Phase 5); a branch created from a
commit shares history up to it.

**Writing.** A transaction runs in the core against the cached head model; the service then, in one
database transaction: locks the branch row, re-checks concurrency (§7), inserts the commit, the
changed element versions and their reference rows, updates `branch_elements`, moves the head and writes
the outbox row. Cost is proportional to the change, not the model size.

**Caching.** Each API process caches materialized models by commit ID (immutable, so the cache needs no
invalidation; LRU by size). A missing commit is loaded from the head index or history.

## 7. Versions and concurrency

- Commits are immutable; element identity is the element ID; an element's versions are its rows in
  `element_versions`.
- A transaction states `baseCommitId`. If the branch head equals it, it applies. Otherwise the service
  computes the element IDs changed between base and head; if none of the elements the transaction
  touches (read set for preconditions + written set, including owning relationships of moved/deleted
  elements) changed, it rebases onto the head; else it fails with `conflict` and lists the elements.
- Undo is a compensating commit computed from the inverse change set; it applies only if the elements
  still have the versions the undone commit produced.

## 8. Scaling path (B§9)

Measured baseline (see test strategy): repository commit and head reads for a generated model of
tens of thousands of elements in the DB test suite. Path to 10⁶ elements: (1) per-owner lazy loading in
the browser and server-side text rendering per namespace (in place); (2) incremental validation by
dependency (reverse index exists); (3) model partitioning by root package with separate caches;
(4) background workers for whole-model validation and indexing; (5) materialized qualified-name index
and trigram search (`pg_trgm`) when available; (6) commit squashing of history reads with periodic
snapshots ("checkpoints") so historic reads do not scan all ancestors.
