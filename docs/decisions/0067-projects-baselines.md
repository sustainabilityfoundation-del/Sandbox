# ADR-0067: Project baselines as sets of pinned module versions

Status: Proposed (2026-10-15)

## Context

Four baseline mechanisms exist: twin baselines (browser, ADR-0005), Requirements baselines, SysML tags,
immutable CAD document revisions. The brief asks for a clear distinction between working state and formally
released baselines across the project.

## Decision

- A project baseline is an immutable set of entries `{ artifactId, module, version, lifecycle }` plus, per
  module, the source revision and read time. It pins; it never copies content.
- Creating one reconciles the registry first; modules that are unavailable are recorded as incomplete and the
  baseline is marked incomplete (it can still be created as a `checkpoint`, never released).
- Kinds: `checkpoint` (editor; "save checkpoint") and `baseline` (`working` → `released` by reviewer or
  administrator; released baselines are immutable and cannot contain unconfirmed modules).
- Modules may expose native baseline operations; a project baseline may reference a module baseline (Requirements
  baseline, SysML tag) as one entry instead of every member artifact.
- Comparison is derived (added, removed, version changed, lifecycle changed); module-level semantic diffs come
  from modules (backlog B-19).

## Consequences

- One project-wide configuration record without a global transaction; its exactness is per module and stated.
- Release gates, approvals and change orders build on it later (backlog B-01, B-02, B-05).
