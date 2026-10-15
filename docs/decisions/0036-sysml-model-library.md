# ADR-0036: SysML Modeler — model library handling

Status: Proposed (2026-10-14, SysML agent)

## Context

SysML v2 semantics depend on the standard model libraries (implicit specialization, scalar values,
quantities and units). Contracts §4: the OMG library may be bundled only under its published licence
terms, which must be checked and recorded.

## Decision

- Bundle a **platform library subset** written by us in textual notation: it declares the standard
  library names and kinds the implementation needs (Base, ScalarValues, Parts, Items, Ports,
  Connections, Interfaces, Actions, States, Requirements, Constraints, Calculations, ISQ and SI subsets)
  plus the platform metadata package `EWS`. It does not copy OMG library text and is labelled as a
  subset stand-in in the UI and help.
- Library elements get deterministic IDs (UUIDv5 over qualified names) and are read-only.
- The official library can be fetched locally (`npm run sysml:library`, not committed) and loaded for
  conformance tests; bundling it in the shipped application is decided after the licence review
  (progress file, licensing review).

## Consequences

- Models written against standard names (e.g. `ScalarValues::Real`, `ISQ::MassValue`, `SI::kg`) resolve.
- Library-dependent validation is only as complete as the subset; the conformance list says so.
