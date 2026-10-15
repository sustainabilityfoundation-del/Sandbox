# ADR-0024: Generative topological naming with geometric probes

Status: Proposed (2026-10-14, CAD agent). Number provisional.

## Context

History-based CAD needs references to faces and edges that survive regeneration (the "topological
naming problem"). OCCT has no persistent naming outside OCAF/TNaming, and kernel indices change when
upstream dimensions change. Brief §4.1 requires stable entity identifiers; brief §12 requires tests of
topological reference stability.

## Decision

- Faces are named **generatively** from design intent, never from kernel indices:
  `<featureId>/<role>[:<sketchEntityId>]`, e.g. `ext-5/cap-end`, `ext-5/side:ln-3`,
  `rev-9/side:arc-4`, `ext-5/cap-start`.
- Each feature that creates geometry emits **probes**: a name plus a 3D point (and expected normal for
  planar caps) computed by `cad-core` from the solved sketch and the feature parameters (for example
  the midpoint of a sketch edge swept half way). After each feature the kernel adapter assigns every
  current face the probes that lie on it (distance below tolerance). Probes of earlier features are
  re-evaluated against the new body, so names of faces split or trimmed by later booleans persist.
- A face with several probes keeps the earliest as primary and lists the others as aliases; a face
  with none gets an explicitly unstable fallback name `<featureId>/face#<n>` flagged `stable: false`.
- Edges are named by their adjacent faces (`edge(<faceA>|<faceB>)[#n]`), vertices by their edges.
- Downstream references (Phase 2 fillets, sketch-on-face, mates) store these names; resolution
  failures are regeneration errors with code `reference-lost`, never silent re-binding.

## Consequences

- Names are deterministic, readable by people and the AI, and independent of kernel version.
- Probes can be fooled by coincident geometry from different features; such cases are reported as
  aliases. Later phases add kernel history (`BRepBuilderAPI_MakeShape::Generated/Modified`) as a
  second signal when the WASM build exposes it, keeping the probe method as a fallback.
- Tests regenerate models with changed dimensions and assert that names map to the same semantic faces.
