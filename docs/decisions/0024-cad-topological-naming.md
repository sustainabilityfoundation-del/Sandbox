# ADR-0024: Generative topological naming with geometric probes

Status: Accepted (16 October 2026, coordinator, after review against main 186db1c; amendments recorded below)

## Context

History-based CAD needs references to faces and edges that survive regeneration (the "topological
naming problem"). OCCT has no persistent naming outside OCAF/TNaming, and kernel indices change when
upstream dimensions change. Brief §4.1 requires stable entity identifiers; brief §12 requires tests of
topological reference stability.

## Decision

- Faces are named **generatively** from design intent, never from kernel indices:
  `<featureId>/<role>[:<sketchEntityId>]`, e.g. `ext-5/cap-end`, `ext-5/side:ln-3`,
  `rev-9/side:arc-4`, `ext-5/cap-start`.
- Each feature that creates geometry emits **probes**: a name plus a set of sample points on the face
  (`FaceProbe.points`; there is no expected-normal check) computed by `cad-core` from the solved sketch and the feature parameters (for example
  the midpoint of a sketch edge swept half way). After each feature the kernel adapter assigns every
  current face the probes that lie on it (distance below tolerance). Probes of earlier features are
  re-evaluated against the new body, so names of faces split or trimmed by later booleans persist.
- A face with several probes keeps the earliest as primary and lists the others as aliases; a face
  with none gets an explicitly unstable fallback name `face#<n>` (no `<featureId>/` prefix) flagged `stable: false`.
- Edges are named by their adjacent faces (`edge(<faceA>|<faceB>)[#n]`). Vertex naming is not implemented.
- Downstream references (Phase 2 fillets, sketch-on-face, mates) store these names; resolution
  failures are regeneration errors with code `reference-lost`, never silent re-binding.

## Consequences

- Names are deterministic, readable by people and the AI, and independent of kernel version.
- Probes can be fooled by coincident geometry from different features; such cases are reported as
  aliases. Later phases add kernel history (`BRepBuilderAPI_MakeShape::Generated/Modified`) as a
  second signal when the WASM build exposes it, keeping the probe method as a fallback.
- Tests regenerate models with changed dimensions and assert that names map to the same semantic faces.

## Amendments on acceptance

- A probe is a set of sample points (`FaceProbe.points`, `packages/cad-core/src/kernel.ts:45`), with no expected-normal check.
- The unstable fallback name is `face#<n>` with no `<featureId>/` prefix (`packages/cad-kernel/src/occt/OcctKernel.ts:356`).
- Vertex naming is not implemented.
- Sprint C1 (ADR-0075, Proposed): kernel shape history (`BRepBuilderAPI_MakeShape::Modified/IsDeleted`) is the second naming signal for faces that Booleans and fillets split or trim. Probes stay first: a face a probe reaches keeps its probe name exactly as above, so stable names are unchanged. Of the pieces of a split face, the one the name's probe reaches keeps `<name>`; the pieces no probe reaches are named `<name>~2`, `<name>~3` … in smallest-centre order instead of `face#n`. When the probe reaches no piece, no piece takes the name and dependent references are `reference-lost`. Repairing a lost reference is an explicit command (`repair_reference`), never a silent re-bind.
