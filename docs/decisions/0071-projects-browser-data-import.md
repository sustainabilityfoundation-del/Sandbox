# ADR-0071: Explicit, user-confirmed import of browser twin data into the server

Status: Proposed (2026-10-15) — integration milestone 1, C8. Design only; implementation is increment I4.

## Context

The illustrative tools keep their data in the browser twin (`DemoRepository`, `localStorage`), per browser.
The server-side product registry now holds the example project's components (ADR-0063), imported from a fixture
of the seed, not from any user's browser. People may have edited the example twin in their own browser (component
properties, SysML and mock CAD objects, relationships, saved artifacts, baselines). Those edits must not be lost,
must not be uploaded silently, and must never overwrite server data.

## Decision

1. **Explicit action only.** "Import this browser's data" in the project overview, available for projects whose
   twin exists in this browser. Never automatic, never on load.
2. **Preview first.** The workspace reads the local twin (`DemoRepository.loadModel`, `listHistory`,
   `listOutputs`, `listBaselines`) and sends it to `POST /projects/{id}/browser-imports?dryRun=true`. The server
   returns a plan: per object, `new` (unknown to the server), `same` (identical content at the same revision),
   `differs` (the server has the ID or alias with other content or a later revision) or `unsupported` (an object
   type with no server home yet, e.g. illustrative SysML elements and mock CAD representations: they stay in the
   browser and are listed).
3. **Conflict report, no silent choice.** `differs` items are shown side by side (twin value and revision, server
   value and revision). The person chooses per item: keep the server value (default) or import the browser value
   as a **new revision** on the server (recorded with `sourceKind: 'import'`, actor, browser identity and the twin
   revision it came from). Nothing is ever reassigned or renumbered.
4. **IDs and revisions kept.** Twin IDs stay as aliases (ADR-0063); twin revision numbers are recorded as
   provenance (`importedFromTwinRevision`); server revisions continue their own sequence.
5. **Idempotent.** The import is an operation record (ADR-0069) keyed by `(projectId, browserImportId)` where the
   browser import ID is stored in the browser after a successful import; repeating the import with unchanged data
   reports everything as `same` and changes nothing.
6. **The browser copy is not deleted.** After import the workspace marks the twin's projected objects read-only
   for that project (C2 fallback); the person can still export or inspect the local copy. Removing local data is a
   separate, explicit browser action that only clears local storage.

## Consequences

- No user edit is lost or applied without being seen; the server stays authoritative.
- Illustrative SysML/mock CAD objects remain browser-only until their tools are retired with their own
  non-destructive migrations (CAD CR-CAD-4, SysML replacement ADR).
