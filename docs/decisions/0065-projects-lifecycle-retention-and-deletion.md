# ADR-0065: Project lifecycle, archive, soft delete with retention; module data is never deleted by Project Management

Status: Proposed (2026-10-15)

## Context

The brief asks to open, close, rename, duplicate, archive, restore and delete projects; contracts §2.2 forbid
Project Management from deleting module data; ADR-0009 forbids destructive migrations.

## Decision

- Two dimensions: an engineering **lifecycle status** (planning, active, on-hold, completed, cancelled; any
  order; informational) and a **record state** (active, archived, deleted).
- Archive makes the project read-only in Project Management and is announced to modules through the project
  context so they can refuse writes (CR-PM-API-4).
- Delete is a soft delete with a retention window (default 30 days, project setting), requires the
  administrator role and typed confirmation of the project key, and is restorable until the window ends.
- Purge after retention is a later, separate, audited operation (backlog B-12) that removes Project
  Management rows only after writing an export package; module data is never purged by Project Management.
- Every transition is audited with actor, time, reason and provenance; project metadata changes create
  immutable project revisions.

## Consequences

- No accidental data loss through Project Management; deleted projects can be recovered.
- Storage is not reclaimed until a purge policy is approved.
