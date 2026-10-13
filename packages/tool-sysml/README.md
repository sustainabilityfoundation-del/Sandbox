# @ews/tool-sysml: SysML Modeling

A small editable diagram of parts, requirement usages, connections and satisfy links, with a property panel and an illustrative, read-only SysML v2-style text view. Supports a deliberately small subset of SysML (see AGENTS.md); it is not SysML v2 compliant and has no parser.

## Run it on its own

```bash
npm install                 # from the repository root
npm run dev:sysml
```

Opens the standalone harness at http://localhost:5182: this tool alone on a **mock platform
host** with the sample actuator twin. The harness lets you change the configuration and scenario,
select any object as another tool would, see registered commands and the activity log, and reset
the sample data. Writes go through the same demo repository as the workspace (in a separate
storage key).

## Use it in the workspace

The workspace registers the exported definition (`apps/workspace/src/platform/tools.ts`) and
renders it through the tool registry. Opening it requires the `tool:sysml` entitlement.

## Check

```bash
npm run typecheck -w @ews/tool-sysml
npx vitest run packages/tool-sysml
npm run build:harness -w @ews/tool-sysml   # builds the harness into dist-harness/
```

See [AGENTS.md](./AGENTS.md) for responsibilities, permitted dependencies and rules.
