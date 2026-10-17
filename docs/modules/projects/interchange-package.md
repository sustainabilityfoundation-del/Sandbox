# Project interchange package (`ews-project-package`)

Status: **Proposed**. Decision: ADR-0064. Index: [README.md](README.md).

## 1. Requirements (brief §4)

Open and documented; versioned; long-term portable; importable into another compatible installation;
contains structured metadata, relationships and associated artifacts; not an opaque database dump.

## 2. Format

A ZIP container (deflate; `fflate`, MIT) with the extension `.ewsproj` and media type
`application/vnd.ews.project+zip`. Every structured file is UTF-8 JSON or JSON Lines with a published JSON
Schema **inside the package**, so a reader needs nothing from this platform to understand it.

```
manifest.json                         package description, versions, checksums (read first)
README.txt                            human-readable description of the layout and how to verify it
schemas/                              JSON Schemas (2020-12) for every file type below
project/project.json                  Project record and its revision history
project/creation.json                 template, requested configuration, provenance
project/members.json                  user IDs, display names, roles (no credentials, no e-mail unless chosen)
project/settings.json                 project-scoped settings values with definition IDs
project/modules.json                  modules enabled, provisioning status
registry/artifacts.jsonl              one ArtifactRecord per line (global ID ↔ native ref)
registry/observations.jsonl           optional, version history of registry records
links/links.jsonl                     PM-owned links (including removed, with removal records)
links/index.jsonl                     derived module relationships at export time (informative; rebuilt on import)
work/work-items.jsonl, work/work-item-revisions.jsonl, work/milestones.jsonl
documents/documents.jsonl, documents/versions.jsonl
blobs/sha256/<2>/<hash>               document bytes (content-addressed; deduplicated)
baselines/baselines.jsonl, baselines/entries.jsonl
product/elements.jsonl, product/breakdowns.jsonl, product/edges.jsonl     (if ADR-0063)
audit/audit.jsonl                     optional (include.audit)
modules/<module>/module.json          module payload descriptor (format, version, artifact count, checksums)
modules/<module>/…                    module-owned payload produced by the module's exporter
```

### 2.1 Manifest

```json
{
  "format": "ews-project-package",
  "formatVersion": "1.0.0",
  "packageId": "4f0c…uuid",
  "createdAt": "2026-10-20T12:00:00Z",
  "createdBy": "ada",
  "producer": { "platform": "engineering-platform", "version": "0.3.0", "projectsApi": "1.0.0", "sdk": "1.7.0" },
  "project": { "id": "8b1e…uuid", "key": "EEP", "name": "Example Engineering Product" },
  "contents": { "audit": true, "documents": true, "moduleContent": true },
  "modules": [
    { "module": "requirements", "format": "ews-requirements-json", "formatVersion": "1.0.0", "alsoAs": ["reqif-1.2"], "artifactCount": 12, "readAt": "2026-10-20T11:59:58Z", "sourceRevision": "outbox:1043", "status": "included" },
    { "module": "cad", "status": "unavailable", "reason": "module not installed at export time", "registryEntries": 3 }
  ],
  "files": [ { "path": "registry/artifacts.jsonl", "sha256": "…", "bytes": 10422, "schema": "schemas/artifact-record.schema.json" } ],
  "packageDigest": "sha256 of the sorted file list with their digests"
}
```

### 2.2 Module payloads

Each module chooses its own **open** format and states it; Project Management treats the payload as opaque
bytes with checksums. Proposed formats (each module confirms):

| Module | Primary payload | Also |
| --- | --- | --- |
| Requirements | `ews-requirements-json` 1.0 (requirements with revisions, collections, attributes, relationships, baselines) | ReqIF 1.2 export (existing exchange feature) for tool interoperability |
| Conceptualize | `ews-concepts-json` 1.0 (Concepts with revisions, decisions, trade studies, evidence, implementations) | — |
| System Model | SysML v2 standard JSON per commit history (`ews-sysml-commits` 1.0) | textual notation of the head (`.sysml`) |
| CAD | `ews-cad` native documents with all revisions (ADR-0022) | STEP of the latest revision where the kernel exports it |
| Twin (browser) | `ews-twin-json` (model snapshot, history, baselines) reported by the workspace | — |

## 3. Versioning and compatibility

- `formatVersion` is semver. Readers accept the same major version; unknown files and unknown fields are
  preserved (copied into `parked_payloads` on import) and reported, never silently dropped.
- Additive changes bump the minor version. A breaking change bumps the major version and ships a converter
  from the previous major.
- Every file has a schema in `schemas/`; validation runs before any data is applied.
- IDs, keys, revisions and timestamps are preserved verbatim; units are `{ value, unit }` with SI-parseable
  unit strings.

## 4. Export

1. Reconcile the project (so the registry is current), then read the Project Management data in one
   REPEATABLE READ transaction.
2. Ask each installed module for its payload (`ArtifactSource.exportProject`); record each module's read
   time and source revision. A module that is unavailable or lacks an exporter is listed with
   `status: 'unavailable' | 'not-supported'` and its registry entries are still exported.
3. Write the ZIP to the blob store; record the job and the manifest; offer the download.

## 5. Import

Always two steps: **validate** (dry run) → **apply**.

| Step | What happens |
| --- | --- |
| Validate | Check ZIP integrity, `packageDigest`, every file's sha-256 and schema; check `formatVersion`; list modules present/absent in this installation; detect ID and key collisions; return an `ImportPlan` (counts per type, problems with severity, required decisions) |
| Apply, mode `restore` | Keep every ID (project ID, artifact IDs, native IDs). Refused if any ID already exists (the package is a restore into a clean environment or a different installation) |
| Apply, mode `copy` | New project ID and key; new UUIDs for every Project Management entity; module importers receive an ID map and return theirs; the registry is rebuilt from the new native refs; links remapped; the original IDs kept in `imported_from` for traceability |
| Module absent | Its payload is stored as a **parked payload** (blob + format) attached to the project; registry entries imported as `module-unavailable`; importing the payload later (module installed) is an explicit action |
| After apply | Reconcile, run the integrity check, store the report with the import job |

Import is a recorded job: PM part in one transaction, then each module payload as an idempotent step,
resumable after a crash (lifecycle-and-persistence.md §5).

## 6. Why not a database export

A `pg_dump` remains the installation-level backup (operations), but it is opaque, version-coupled and
includes every project. The package is per project, self-describing, schema-validated, readable without the
platform, and can be imported into an installation with a different set of modules.
