# Product vision

Updated: 13 October 2026

Outcomes and capabilities. The full consolidated direction, including the long-term capability map,
is in [architecture-vision.md](architecture-vision.md); this file keeps the product-level summary.

## Outcome

An integrated suite for developing complex engineering products, including safety-critical aerospace
and automotive systems, connecting requirements, architecture, geometry, analysis, implementation,
manufacturing and verification through one controlled product definition.

## Principles

- Each discipline tool stays independently usable, buildable and testable. Users subscribe to one
  tool or a combination, in a common shell.
- The integrated platform adds cross-discipline navigation, traceability, configuration control,
  shared workflows and an AI interface.
- The product definition is assembled from module-owned artifacts with stable identities and
  immutable revisions, not one universal object.
- Evidence is pinned to exact revisions and configured articles; changes expose stale evidence.
- The AI interface proposes; domain commands validate; the user applies within their authorized scope.
- Capabilities are labelled honestly as implemented, experimental or planned.
- Implementation is original; dependencies are recorded with provenance and licences
  ([dependencies.md](dependencies.md)).

## Initial capabilities

Requirements Management, SysML Modelling and Parametric Mechanical CAD, with a minimal configuration,
traceability and verification foundation. Status: [roadmap.md](roadmap.md). Module specifications:
[modules/](modules/).
