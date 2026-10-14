# ADR-0008: Client-side entitlements are a prototype

Status: Accepted (2026-10-13)

## Decision

Demo subscription plans gate tools in the browser, for user experience only. Tools declare an
`entitlement` and never check plans themselves; every check goes through one platform function so
that a server-side check can replace it.

## Consequences

- This is not a security control. Production needs server-side identity, authorization and
  entitlement enforcement (vision §4, shared platform services).
