# C. Knowledge representation

Status: Proposed. Decision: [ADR-0041](../../decisions/0041-relational-knowledge-and-graph-api.md).
Index: [README.md](README.md).

## 1. Six layers, one authoritative store

| # | Brief §4 layer | Representation | Store |
| --- | --- | --- | --- |
| 1 | Strongly typed relational entities | Function, Concept, Constraint, Assumption, Evidence, Decision, … ([domain-model.md](domain-model.md)) | PostgreSQL schema `conceptualize` |
| 2 | Typed semantic relationships | `design_links` with a registered type vocabulary (§2) | same |
| 3 | Natural-language explanations | Descriptions, statements, rationale, justifications: plain text columns, kept verbatim | same |
| 4 | Mathematical expressions and constraints | CalculationModel relations (expression text + canonical AST JSON) and constraint bounds ([mathematics.md](mathematics.md)) | same |
| 5 | References to authoritative artifacts | `ArtifactRef` (module, id, revision?, kind) | same (references only) |
| 6 | Optional embeddings | Rebuildable retrieval projection, phase 2+ and only with demonstrated need (§4.3) | derived; not authoritative |

The relational schema is the only authoritative store. Everything else (graph views, matrices, search
indexes, embeddings, AI summaries) is a **derived projection** that can be rebuilt from it and records
the source revisions it was built from.

## 2. Typed design links

### 2.1 Table (proposed for Conceptualize, CR-C4)

```sql
CREATE TABLE conceptualize.design_links (
  id uuid PRIMARY KEY,
  project_id text NOT NULL,
  type text NOT NULL REFERENCES conceptualize.link_types (name),
  from_type text NOT NULL,              -- DesignEntityType
  from_id uuid NOT NULL,
  from_revision integer,                -- pinned when the link asserts something about a revision
  to_type text NOT NULL,                -- DesignEntityType or 'artifact'
  to_id text NOT NULL,                  -- UUID, or ArtifactRef id
  to_module text,                       -- for artifacts: requirements | sysml | cad | twin | analysis | external
  to_revision integer,
  decomposition_id uuid,                -- for decomposes-into within a named decomposition
  basis text NOT NULL,                  -- ADR-0043 ladder
  note text NOT NULL DEFAULT '',
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,  -- e.g. interface definition, flow, strength
  revision integer NOT NULL DEFAULT 1,  -- 1 created, 2 removed (as today's relationships)
  removed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL, created_by text NOT NULL,
  removed_at timestamptz, removed_by text,
  source_kind text NOT NULL, conversation_id text, proposal_id text, run_id text, step_id text
);
```

Existing `relationships` (Concept↔Concept), `concept_links` (Concept→artifact) and
`implementation_artifacts` stay; they are exposed through the same graph API as views over the
vocabulary below. New link kinds go into `design_links`. No existing row is rewritten (ADR-0009).

### 2.2 Vocabulary (brief §4) and validation rules

Each type has: allowed `from`/`to` entity types, direction, inverse reading, acyclicity, symmetry,
whether the assistant may assert it, and **impact propagation** (used by the analyzer, ADR-0046).

| Type | From → To | Inverse reading | Rules | Impact propagation |
| --- | --- | --- | --- | --- |
| `performs` | Concept → Function | performed by | many-to-many | Function change → performing Concepts (possible) |
| `realizes` | Implementation → Concept | implemented by | existing `implementation_concepts`; inverse is the brief's "Implemented by" | Concept revision → implementation `intent-ahead` (formalization.md) |
| `decomposes-into` | Function → Function; Concept → Concept (today `contains`) | part of | acyclic over all decompositions; shared children allowed | parent change → children (possible); child change → parent (possible) |
| `depends-on` | any design entity → any design entity or artifact | needed by | not acyclic (cycles reported, not refused) | to → from |
| `constrains` | Constraint → Function, Concept, exploration, interface | constrained by | — | constraint change → subjects (possible; demonstrated by re-evaluation) |
| `interfaces-with` | Concept ↔ Concept; Function ↔ Function | symmetric | `attributes.interface` (name, kind, flows) | both directions (possible) |
| `alternative-to` | Concept ↔ Concept | symmetric | existing | none (informational) |
| `derived-from` | X → X (same type); Constraint → requirement artifact | origin of | acyclic | origin change → derived (possible) |
| `supported-by` | Decision, Assumption, Constraint, Concept statement → Evidence | supports | evidence must exist; `basis` of link ≤ evidence basis | evidence superseded/rejected → supported (demonstrated if it was the only support) |
| `contradicted-by` | same → Evidence | contradicts | — | new contradicting evidence → subject under review |
| `verified-by` | Concept, Function, Constraint → Evidence (basis `evidence`) or twin verification record | verifies | target must be verification-grade | verification stale → subject (possible) |
| `selected-through` | Concept → Decision | selects | derived from decision outcomes; not written directly | decision invalidated → selected Concept (demonstrated) |
| `invalidated-by` | Decision, Assumption, Evidence → Evidence, Assumption, change record | invalidates | written only with a person's action (ADR-0046) | — (terminal) |
| `formalizes` | Constraint → requirement artifact (pinned) | formalized by | exactly one requirement per formalizing constraint | requirement revised → constraint suspect (demonstrated: revision differs) |
| `proposes` | Concept/Constraint → requirement artifact | proposed by | existing concept link relation | — |

`implemented-by` and `selected-through` are **readings** of stored data (implementation membership,
decision outcomes), not separately stored links, so they cannot drift from their source.

### 2.3 Provenance and versioning of links

Links are created and removed, never edited; a removal is a new revision of the link row with actor and
time (as today). A link that makes a claim about a specific revision (`supported-by` evidence about
Concept revision 3) pins `from_revision`/`to_revision`. Graph reads take an `asOf` (timestamp) or a
baseline and return the links valid at that point (created before, removed after or never).

## 3. Graph traversal API (persistence-independent)

Owned and served by Conceptualize (CR-C9); consumed by the engine and the Conceptualize UI. The API is
defined in terms of DesignRefs and link types, so the implementation (recursive CTEs today) can change
without affecting callers.

```
POST /api/concepts/v1/projects/{projectId}/graph/traverse
{
  "start": [DesignRef | ArtifactRef],
  "follow": [{ "type": "performs", "direction": "in" | "out" | "both" }, …],   // default: all types
  "maxDepth": 1..6,                         // default 3
  "nodeTypes": ["decision", "assumption"],   // optional filter on returned nodes
  "where": { "maturity": [...], "status": [...], "basis": [...] },
  "asOf": "2026-10-14T12:00:00Z" | null,
  "limit": 1..500, "cursor": "…"
}
→ { nodes: [{ ref, key, label, revision, type, status }], edges: [{ id, type, from, to, basis, pinned }],
    truncated: boolean, cursor?, builtFrom: { at, projectRevisionDigest } }
```

Also: `GET …/graph/neighbourhood?ref=…&depth=1` (UI), `GET …/link-types` (vocabulary with rules), and
`POST …/graph/paths` (all paths up to depth N between two refs, for "why is X affected by Y").

Federation across modules is **not** inside Conceptualize: the engine's Context Resolver joins
Conceptualize graph results with Requirements `traceLinks`/`impact` and with twin relationships
([reasoning-orchestration.md §2](reasoning-orchestration.md#2-context-resolver)).

## 4. Retrieval

### 4.1 Structured filtering
List endpoints with typed filters (type, status, maturity, basis, classification, subject, configuration,
updated since). Exact and cheap; first choice of the Context Resolver.

### 4.2 Full-text search
Conceptualize already maintains a `tsvector` over concept revisions. Extend it (CR-C9) to functions,
constraints, assumptions, decisions (question + rationale) and evidence (title + summary), with a single
`GET …/search?q=&types=` endpoint returning DesignRefs with ranks. PostgreSQL built-in, no new dependency.

### 4.3 Semantic embeddings (optional, deferred)
Only if full-text retrieval demonstrably misses relevant records in evaluated tasks (roadmap phase 2
risk review). Then: a rebuildable projection table (`retrieval_embeddings`: ref, revision, model id,
vector, built_at) maintained from outbox events, owned by the engine (it is a retrieval aid, not design
knowledge), using the pgvector extension only after an ADR. An embedding match is never evidence and is
never shown as a reason for a decision.

## 5. Derived matrices (DSM and design matrix)

Computed on demand by `@ews/design-reasoning-core` from graph results; never stored as authoritative data.

| View | Rows × columns | Built from | Use |
| --- | --- | --- | --- |
| Function × Concept matrix ("design matrix") | Functions × Concepts of one architecture | `performs`, `decomposes-into` | Coupling check in the axiomatic-design sense: a Concept performing several functions of the same level, or a function needing several concepts, is flagged for review (no axiom enforcement) |
| Design-element DSM | Concepts (or Functions) × same | `depends-on`, `interfaces-with` | Clustering (modularity) and sequencing hints; cycles reported |
| Constraint × alternative feasibility | Constraints × alternatives | constraint checks (evidence) | Exploration infeasibility screen |

## 6. Extension strategy (no rigid ontology)

Following the CPM idea of a per-class `type` with independent taxonomies:

1. **Classifications** per entity type (already on Concepts): user-defined terms, optionally organized
   in a project taxonomy (`taxonomy_terms`: entity type, term, parent term). Terms carry no behaviour.
2. **Registered link types** (`link_types` table, CR-C4): built-in types from §2.2 plus namespaced
   project or discipline types (`thermal:rejects-heat-to`, `electrical:powers`), each with endpoint rules,
   inverse reading, symmetry and acyclicity, and an impact-propagation default of `possible` or `none`.
   Only administrators register types; the engine treats unknown types as `depends-on` for impact.
3. **Typed attributes**: `attributes` jsonb with quantities (`{ value, unit, min?, max?, basis }`)
   validated by the platform unit algebra (CR-S2); attribute *definitions* per classification are an
   optional later addition (attribute templates), not required for phase 1.
4. **Statements** (existing) keep free semantic content typed by kind (`principle`, `mechanism`,
   `effect`, …) without forcing it into entities.

Discipline modules that need more structure (thermal networks, electrical topologies) model it in their
own module and link to it by `ArtifactRef`; they do not extend the Conceptualize schema.
