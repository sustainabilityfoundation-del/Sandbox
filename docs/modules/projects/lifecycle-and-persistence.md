# Lifecycle transitions and persistence guarantees

Status: **Proposed**. Decision: ADR-0065 (lifecycle, retention, deletion). Index: [README.md](README.md).

## 1. Two independent dimensions of a project

| Dimension | Values | Who sets it | Effect |
| --- | --- | --- | --- |
| **Lifecycle status** (engineering) | planning, active, on-hold, completed, cancelled | editor or above, any order (no mandatory sequence) | Label, filter and dashboard only; never blocks work |
| **Record state** | active, archived, deleted | administrator | Archived: read-only for everyone (writes refused with `forbidden`, reason `archived`) in Project Management; modules are asked to honour it through the project context (CR-PM-API-4); deleted: hidden, restorable until `purge_after` |

```
          create (blank | template | duplicate | import)
                          │
                          ▼
   ┌──────────────────► active ◄──────────────┐
   │  restore             │  archive          │ restore (within retention)
   │                      ▼                   │
   └──────────────── archived ──── delete ──► deleted ──(after retention, explicit purge, backlog B-12)──► purged
                          active ── delete ──┘
```

| Transition | From | Precondition | Records |
| --- | --- | --- | --- |
| create | — | unique key; template exists; settings valid (when the settings service is available) | project row, revision 1, creation record, creator membership (administrator), module states, audit `project.created`, outbox |
| update metadata | active | If-Match | new project revision (immutable snapshot) |
| archive | active | administrator; dryRun lists open work items | `state=archived`, `archived_at`, audit, outbox `project.archived` |
| restore | archived, deleted | administrator; deleted: `now < purge_after` | `state=active`, audit |
| delete | active, archived | administrator; `X-Confirm: <key>` | `state=deleted`, `deleted_at`, `purge_after = now + retention` (default 30 days, project setting `projects.retention.deleted-days`, 7–3650) |
| purge | deleted | after `purge_after`; installation administrator; separate confirmation; **backlog B-12** | Removes Project Management rows only after an export package is written and kept; module data is **never** purged by Project Management (each module would need its own audited purge) |
| duplicate | any but deleted | administrator of the source; new key | new project with copied configuration; `duplicated_from` |

Close and open are client actions: **open** records the user's recent-projects entry and returns the project
context; **close** clears the workspace's current project. Neither changes engineering data.

## 2. Artifact lifecycle (registry)

The registry mirrors module lifecycle (information-model.md §5) and availability:

```
available ──module unreachable / not installed──► module-unavailable ──module back──► available
available ──module no longer lists it──► missing-in-module ──module lists it again──► available
```

No registry transition deletes a record. A record may be deleted from the registry only by the purge of
its project (backlog B-12).

## 3. Documents

`working → in-review → released → superseded | retired`, any step back to working before release.
Versions are immutable; a released document gets new content only as a new version, which returns the
document to `working` (the released version stays released and downloadable). Retiring keeps all bytes.

## 4. Work items and milestones

| Kind | Statuses | Rules |
| --- | --- | --- |
| task | open, in-progress, blocked, done, cancelled | `done` and `cancelled` are closed; reopen allowed |
| issue | open, investigating, resolved, closed, rejected | `closed` needs a resolution note |
| risk | identified, assessed, mitigating, accepted, closed | `accepted` needs reviewer or administrator and a rationale; score = likelihood × impact (1–25) |
| milestone | planned, in-progress, achieved, missed, cancelled | `achieved` lists unmet deliverables as a warning, never blocks |

Every change creates an immutable revision snapshot and an audit event.

## 5. Persistence guarantees

| Guarantee | Mechanism | Verified by (planned test) |
| --- | --- | --- |
| **Transactional creation** | project + creator membership + creation record + module states + audit + outbox in one PostgreSQL transaction; failure leaves nothing | `create rolls back completely when the membership write fails` |
| **No lost writes** | every command commits before the response; there is no unsaved server state | `restart: everything returned before shutdown is readable after restart` |
| **Automatic saving** | each UI edit is a command (debounced 800 ms for text fields); the wizard and forms keep an unsent draft in browser storage (per-viewer convenience) and restore it after a crash | browser test: type, reload, draft offered |
| **Explicit save** | "Save" flushes pending drafts and waits for their commits, then shows "All changes saved · revision N"; "Save checkpoint" creates a `checkpoint` baseline (phase C) | browser test |
| **Durability across restarts** | PostgreSQL (embedded in development, persistent data directory); blobs in the content-addressed store; nothing in process memory is authoritative | `persistence.test.ts`: stop the server and PostgreSQL, start again, compare |
| **Optimistic concurrency** | `revision` + If-Match on every mutable record; 409 with `currentRevision` | API tests |
| **Idempotent retries** | Idempotency-Key recorded inside the write transaction; replay returns the first outcome | API tests (retry after timeout replays) |
| **Referential integrity** | FKs inside `projects`; cross-module references by registry ID; integrity check for the rest (§6) | integrity tests |
| **Immutability** | revision tables, document versions, audit events protected by refuse-change triggers | `UPDATE … is refused` tests |
| **Audit** | append-only `audit_events` with provenance on every write; module audits stay in modules and are linked | tests per operation |
| **Migrations** | append-only, checksummed, advisory lock; tested from an empty database and from the previous version's fixture | migration tests |
| **Blob integrity** | key = sha-256 of content; `Content-Digest` verified on upload; reads verify the hash (configurable) | blob tests (corruption detected) |
| **Backup and restore** | (1) PostgreSQL-level backup of the whole installation (operations doc, `pg_dump` with the embedded binaries) and (2) per-project interchange packages (ADR-0064) as the portable backup | restore test into an empty database |
| **Recovery after a crash during import** | import runs as a job: validate (dry run) → apply PM part in one transaction → module payloads one by one, each idempotent, recorded per module; a crash resumes from the recorded step | job tests |

What is *not* guaranteed: atomicity across modules (a project export reads each module at its own instant;
the manifest records each module's revision and read time), and synchronous registry freshness (the registry
can lag module writes by the consumer's delivery time; `confirmedAt` makes it visible).

## 6. Integrity checks

`POST /projects/{id}/integrity-checks` returns a report of findings, each with severity, code, artifacts,
explanation and a suggested action (never an automatic repair):

| Code | Finding |
| --- | --- |
| `registry.missing-in-module` | a registry record whose module no longer lists it |
| `registry.unregistered` | the module lists an artifact the registry lacks (registry behind; reconcile) |
| `registry.module-unavailable` | records of a module that is not installed or not reachable |
| `link.dangling` | a link end whose artifact is missing in its module |
| `link.pinned-revision-missing` | a pinned revision the module cannot resolve |
| `link.stale-pin` | a pinned revision older than the current one (information; may be intended) |
| `link.redundant` | a PM link duplicating a module-owned relationship that now exists natively |
| `product.cycle` | a cycle in a breakdown (should be impossible; checked anyway) |
| `document.blob-missing` / `document.blob-corrupt` | bytes absent or hash mismatch |
| `baseline.unresolvable-pin` | a baseline entry whose module cannot resolve the pinned version |
| `membership.no-administrator` | no administrator left |
| `settings.invalid-value` | a project setting value no longer valid for its definition |
| `consistency.inconsistent-information` | rule-based checks across modules (for the AI operation "identify inconsistent engineering information"): requirement allocated to a retired product element, released baseline containing working-state artifacts, decision's chosen Concept superseded, task subject retired, verification evidence older than the pinned requirement revision |
