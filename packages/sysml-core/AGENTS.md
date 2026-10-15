# AGENTS.md: @ews/sysml-core

SysML Modeler semantic core. Owner: the SysML agent (docs/specifications/sysml-program-contracts.md §7).
Architecture: [docs/modules/sysml/semantic-model.md](../../docs/modules/sysml/semantic-model.md),
ADR-0031, ADR-0032, ADR-0034, ADR-0036. Conformance: [docs/modules/sysml/conformance.md](../../docs/modules/sysml/conformance.md).

## Rules

- Framework-free and environment-free: no React, no Node-only APIs (it runs in the service and in the
  browser). No `@ews/*` dependencies.
- The stored model is the KerML/SysML abstract syntax. Never add a parallel "simplified" graph;
  derived properties are computed (`semantics/semantics.ts`), never stored.
- Every metaclass lives in `metamodel/metaclasses.ts` (single source for JSON, commands, validation).
- Every modification is a command in `commands/commands.ts` with a JSON schema in
  `commands/schemas.ts`; commands run on working copies inside `applyTransaction`. Never mutate an
  element object in place: use `patch()` (copy-on-write, models share element objects).
- A new textual construct needs: parser, builder, serializer, a conformance case in
  `conformance/cases.ts` (round trip text and JSON), and an update of conformance.md and the help page
  `packages/tool-sysml-modeler/help/language.md`. Unsupported constructs must be reported
  (`SYSML-SYNTAX-UNSUPPORTED`), never dropped.
- Do not claim SysML v2 conformance anywhere.
- The bundled library (`library/text.ts`) is our own text; do not paste OMG library text into it.

## Tests

`npx vitest run packages/sysml-core` (unit + conformance corpus); official corpus measurement:
`npm run sysml:library` then `npm run sysml:conformance` (files under `.data/`, not committed).
