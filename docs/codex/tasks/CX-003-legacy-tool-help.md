# CX-003: Help pages for the illustrative SysML and mock CAD tools

Goal: close the known documentation gaps (`KNOWN_DOCUMENTATION_GAPS = ['sysml', 'cad']` in
`apps/workspace/src/help/help.test.ts`) for the two legacy demo tools, `packages/tool-sysml` and `packages/tool-cad`.

Paths you may change: `packages/tool-sysml/help/**`, `packages/tool-cad/help/**`, their `src/help.ts` (new) and the
`help` field in each tool definition, `apps/workspace/src/help/help.test.ts` (shrink the gaps list only), and
`docs/codex/README.md` (status row).

Requirements:
- Follow `docs/modules/help.md` and the existing pattern in `packages/tool-requirements/src/help.ts` and its `help/`.
- Describe the tools honestly as **demo** tools: the illustrative SysML tool is not SysML v2 compliant; the mock CAD
  tool has mock geometry and no kernel (the real tools are the SysML Modeler and the CAD Modeler; say so and link their
  help IDs).
- Map every toolbar item and assistant operation of each tool in `contextMappings`; stable help IDs `sysml.*`, `cad.*`.
- Do not change tool behaviour or markup other than adding the help export.

Acceptance: `npm run check` passes with `KNOWN_DOCUMENTATION_GAPS` reduced to `[]`.
