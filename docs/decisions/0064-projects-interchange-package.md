# ADR-0064: Open, versioned project interchange package

Status: Proposed (2026-10-15)

## Context

The brief asks for project export/import, backup and restoration, and an open, documented interchange
package for long-term portability into another compatible installation, not an opaque database export.

## Decision

- Format `ews-project-package` (semver `formatVersion`, starting 1.0.0): a ZIP (`.ewsproj`, `fflate`, MIT)
  with `manifest.json`, a `README.txt`, JSON Schemas for every file inside the package, Project Management data
  as JSON/JSON Lines, content-addressed blobs, and one folder per module containing that module's own open
  payload (docs/modules/projects/interchange-package.md).
- Modules produce and consume their payloads through optional `ArtifactSource.exportProject` /
  `importProject` (ADR-0062). Project Management never interprets module content.
- Import is always validate (dry run) then apply, in `restore` (keep IDs; refuse collisions) or `copy` (new IDs
  with recorded ID maps) mode, as a resumable job. Payloads of modules absent from the target installation are
  kept as parked payloads; their registry entries are marked `module-unavailable`. Nothing unknown is dropped.
- Installation-level PostgreSQL backups remain an operational tool, not the portability mechanism.

## Consequences

- Projects can move between installations and survive platform upgrades with schema-validated files.
- Complete module content in a package depends on each module shipping an exporter; the manifest says which
  modules were included.
