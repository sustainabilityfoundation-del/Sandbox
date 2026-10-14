# ADR-0010: The assistant uses the same command boundary

Status: Accepted (2026-10-13)

## Context

User actions, AI actions and automation must use the same validation and permission boundaries
(vision §6, §11).

## Decision

Assistant operations are tool-contributed actions, validated by application code into previews with
expected revisions. Applying a preview submits the same `ModelChange` batch as a user edit, as writer
`assistant` acting only `onBehalfOf` the modules whose actions produced it; the repository applies the
same ownership and relationship rules. Model descriptions and imported documents are data, not
instructions. Provider credentials stay on the server, and only the context a request needs is sent.

## Consequences

- The assistant cannot bypass ownership, validation or subscriptions.
- A provider adapter can be added without changing domain code. Today the assistant is a scripted
  demo and is not connected to a model provider.
