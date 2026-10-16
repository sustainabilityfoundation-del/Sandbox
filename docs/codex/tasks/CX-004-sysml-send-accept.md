# CX-004: SysML Modeler parser and semantic core: send and accept actions

Goal: support the SysML v2 textual notation for **send** and **accept** action usages, which the conformance list
(`docs/modules/sysml/conformance.md`) reports as unsupported.

Paths you may change: `packages/sysml-core/src/syntax/**`, `packages/sysml-core/src/semantics/**`,
`packages/sysml-core/src/conformance/**` (cases), `packages/sysml-core/src/**/*.test.ts`,
`docs/modules/sysml/conformance.md`, `docs/codex/README.md` (status row).

Requirements:
- Read `packages/sysml-core/AGENTS.md` and ADR-0031/0032 first. The stored model is the KerML/SysML abstract syntax;
  follow the existing pattern for action usages (successions, `accept` in transitions already exist; extend, do not
  duplicate).
- Parse `send <expression> via <port> to <target>;` and `accept <name> : <Type> via <port>;` forms used by the official
  examples (do not copy OMG text into the repository; write your own minimal cases).
- Round-trip: text → model → text and model → JSON → model, like the existing 51 corpus cases.
- Unsupported variants must still be reported as errors, never dropped.

Acceptance: `npx vitest run packages/sysml-core` passes with new cases; `npm run check` passes; the conformance page
lists the new support honestly.
