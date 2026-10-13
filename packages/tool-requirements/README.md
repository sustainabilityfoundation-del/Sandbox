# @ews/tool-requirements: Requirements Management

Requirements table with search, status filter and filtering by the selected component (or its SysML or CAD representation); detail panel to edit title, statement, rationale, status, verification methods and allocation; relationships and history; Trace columns for SysML references and CAD representations.

## Run it on its own

```bash
npm install                 # from the repository root
npm run dev:requirements
```

Opens the standalone harness at http://localhost:5181: this tool alone on a **mock platform
host** with the sample actuator twin. The harness lets you change the configuration and scenario,
select any object as another tool would, see registered commands and the activity log, and reset
the sample data. Writes go through the same demo repository as the workspace (in a separate
storage key).

## Use it in the workspace

The workspace registers the exported definition (`apps/workspace/src/platform/tools.ts`) and
renders it through the tool registry. Opening it requires the `tool:requirements` entitlement.

## Check

```bash
npm run typecheck -w @ews/tool-requirements
npx vitest run packages/tool-requirements
npm run build:harness -w @ews/tool-requirements   # builds the harness into dist-harness/
```

See [AGENTS.md](./AGENTS.md) for responsibilities, permitted dependencies and rules.
