# ADR-0001: Monorepo with npm workspaces

Status: Accepted (2026-10-13)

## Context

The vision (§8) aims at independently developable modules, possibly in separate repositories later,
and asks to confirm repository topology before migrating. Three modules and a platform are developed
together today.

## Decision

One repository with npm workspaces: `apps/*` and `packages/*`. Packages expose TypeScript source
through `exports`. Each tool package runs on its own (harness) and depends only on
`@ews/platform-sdk` and `@ews/design-system`. `packages/platform-sdk/src/boundaries.test.ts`
enforces the dependency rules.

## Consequences

- A tool can move to its own repository later once the SDK and design system are published.
- Production repository topology remains an open decision.
