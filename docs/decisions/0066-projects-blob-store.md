# ADR-0066: Content-addressed blob store behind an interface

Status: Accepted (16 October 2026, coordinator, after review against main 186db1c; amendments recorded below)

## Context

Documents, attachments, export packages and parked module payloads are binary and can be large. Contracts
§2.7 require object storage behind an interface, a content-addressed local filesystem store under `.data/`
for development, an optional S3-compatible adapter later, and no paid service. Requirements already has an
`ObjectStorage` with the same key scheme (`services/requirements/src/storage.ts`).

## Decision

- `BlobStore { put(bytes) → { key, sha256, byteSize }, get(key), has(key), description }` in
  `services/projects/src/blob`, keys `sha256/<2>/<hash>` (no user input in keys), atomic write by temporary
  file and rename, optional hash verification on read.
- Adapters: `localBlobStore(root)` (default `STORAGE_DIR`, `.data/objects`, git-ignored, shared directory with
  Requirements is safe because keys are content addresses) and `memoryBlobStore()` for tests. S3-compatible
  adapter is backlog B-08.
- PostgreSQL holds the catalogue (`projects.blobs`) and the meaning (document versions). Bytes are never
  deleted while any row references them.
- Upload limit 200 MB per version (configurable); uploads are buffered up to the limit; streaming is backlog.

## Consequences

- Deduplication across versions and projects; integrity verifiable by hash.
- Same scheme as Requirements, so a later shared storage package can merge both without moving bytes.

## Amendments on acceptance

- `put(bytes)` only, no stream (`services/projects/src/blob`); uploads are buffered up to the limit; streaming is backlog.
