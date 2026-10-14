# ADR-0005: Minimal baselines

Status: Accepted (2026-10-13)

## Context

Phase 1 needs minimal baselines, and a baseline must identify the exact engineering definition
assessed (vision §10, §11). Change and release workflows belong to Phase 2.

## Decision

A baseline is an immutable record for one configuration. It pins `{ id, revision }` for every object
and scenario and copies the relationships at creation. Names are unique per project
(case-insensitive). The platform creates baselines; `compareWithBaseline` compares one with the
working model, and change impact lists the baselines that pin an object. There is no release, lock,
approval or deletion.

## Consequences

- Verification records can name a baseline as the configured article.
- Relationships are copied, not versioned; relationship revision history is a later decision.
