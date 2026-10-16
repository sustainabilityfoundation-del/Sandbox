# ADR-0061: Artifact registry and global artifact identity

Status: Accepted (16 October 2026, coordinator, after review against main 186db1c; amendments recorded below)

## Context

The brief requires every engineering artifact to have a stable, globally unique identifier, a defined type,
ownership, creation and modification metadata, lifecycle state and version information, without separate,
incompatible project data structures per module. Modules use different native identities (requirement UUIDs,
Concept UUIDs, SysML `<project>/<element>` pairs, CAD `<document>/<entity>`, twin IDs such as `ROD-120`).

## Decision

- Project Management keeps a registry: one record per artifact with a UUID `artifactId` minted at first
  registration, the module's native reference `{module, kind, id}` (unique per project), key, title, kind,
  normalised category and lifecycle (module state kept verbatim), the module's current version, created and
  modified metadata, availability and `confirmedAt` (docs/modules/projects/information-model.md).
- The native reference remains valid everywhere; `ArtifactRef` (SDK 1.5) is unchanged. The registry ID is an
  additional identity, used by Project Management links, baselines, views and export.
- Kinds and lifecycle mappings are published by each module, so new modules add kinds without changing the
  registry.
- Registry records are never deleted by the application. When a module stops listing an artifact the record
  is marked `missing-in-module`; when the module is absent it is `module-unavailable`.
- Summary fields are shown only to members entitled to the owning module; others see a restricted entry. (Planned: summaries currently go to every member.)

## Consequences

- Cross-module navigation, traceability and export have one identity space without rewriting module IDs.
- The registry can lag the module; `confirmedAt` makes freshness visible, and reconciliation converges it.
- Existing IDs (`PRJ-ACT100`, REQ keys, `SYS-…`, `CAD-…`) keep working unchanged.

## Alternatives considered

- *Use native references only*: no stable identity across module migrations (for example a twin `CAD-120`
  replaced by a CAD Modeler entity) and no uniform handle for links and baselines.
- *Make modules mint global IDs*: couples every module's write path to Project Management.

## Amendments on acceptance

- Entitlement-filtered summaries are planned; summaries currently go to every member.
