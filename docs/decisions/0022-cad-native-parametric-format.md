# ADR-0022: Open, versioned native parametric format (`ews-cad`, JSON)

Status: Accepted (16 October 2026, coordinator, after review against main 186db1c; amendments recorded below)

## Context

Brief §4.3 requires an openly specified, independently implementable native model that preserves full
design intent; STEP AP242 is the neutral exchange target but does not carry feature history.

## Decision

- The authoritative representation of a CAD Modeler document is a JSON document with
  `"format": "ews-cad"` and a semantic `formatVersion` (`1.0.0` at introduction; 1.3.0 at 186db1c, minor versions additive), media type
  `application/vnd.ews.cad+json`, file extension `.ewscad`.
- It stores design intent, not kernel output: parts, parameters with expressions and units, sketches
  (entities, constraints, driving/driven dimensions, the drawn seed geometry), features in history
  order with their inputs, suppression, external references to other modules, engineering metadata
  and semantics, and the document version. Assemblies and configurations have reserved, specified
  extension points and are rejected with a clear error until implemented.
- B-rep, meshes and mass properties are **derived** (regenerated deterministically from the document
  by the kernel) and are never the source of truth. Exports (STEP) are snapshots with provenance.
- The specification is [native-format.md](../modules/cad/native-format.md) with a machine-readable
  JSON Schema (draft 2020-12) in `packages/cad-core/schema/ews-cad.schema.json`. A test validates
  fixtures against both the schema and the TypeScript validator.
- Versioning: minor versions only add optional fields; readers ignore unknown fields under
  `extensions`. Major versions need a non-destructive migration function in `cad-core` with an
  old-format fixture test (ADR-0009). Files carry the writer's tool version.
- Entity identifiers are document-local, deterministic and never reused (`sk-3`, `ext-7`), combined
  with the document UUID for global references (ADR-0026).

## Consequences

- Any party can read and write models without our code; diffs are human-readable.
- Large models will need a chunked or binary companion encoding (Phase 6); the JSON stays the open
  reference encoding.

## Amendments on acceptance

- `formatVersion` note corrected: `1.0.0` at introduction, 1.3.0 at 186db1c (`FORMAT_VERSION` in `packages/cad-core/src/model/types.ts:10`).
