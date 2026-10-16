# CX-004: SysML Modeler parser and semantic core: send actions

Revised 16 October 2026 by the coordinator after review of PR #7: `AcceptActionUsage` already exists
(`packages/sysml-core/src/metamodel/metaclasses.ts`) and accept is supported (corpus case `accept-action`). The blocker
PR #7 recorded was real: `SendActionUsage` is missing from the metamodel, which the earlier allowed paths excluded. Scope is
now **send only**, and the metamodel and the modeler's language help page are allowed.

Goal: support the SysML v2 textual notation for **send** action usages, which the conformance list
(`docs/modules/sysml/conformance.md`) reports as unsupported.

Paths you may change: `packages/sysml-core/src/metamodel/metaclasses.ts` (add `SendActionUsage`, specializing
`ActionUsage`, with payload, sender and receiver parameters), `packages/sysml-core/src/syntax/**`, `packages/sysml-core/src/semantics/**`,
`packages/sysml-core/src/conformance/**` (cases), `packages/sysml-core/src/**/*.test.ts`,
`docs/modules/sysml/conformance.md`, `packages/tool-sysml-modeler/help/language.md` (required by the package AGENTS.md),
`docs/codex/README.md` (status row). Do not put process notes or blockers in `conformance.md` (it is user-facing); report
blockers in the pull request description.

Requirements:
- Read `packages/sysml-core/AGENTS.md` and ADR-0031/0032 first. The stored model is the KerML/SysML abstract syntax;
  follow the existing pattern for action usages (successions, `accept` in transitions already exist; extend, do not
  duplicate).
- Parse the `send <expression> via <port> to <target>;` forms used by the official
  examples (do not copy OMG text into the repository; write your own minimal cases).
- Round-trip: text → model → text and model → JSON → model, like the existing 51 corpus cases.
- Unsupported variants must still be reported as errors, never dropped.

Acceptance: `npx vitest run packages/sysml-core` passes with new cases; `npm run check` passes; the conformance page
lists the new support honestly.
