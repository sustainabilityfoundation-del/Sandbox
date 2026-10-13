# @ews/tool-cad: CAD (mock geometry)

A selectable mock side elevation of the actuator assembly (housing, rod, motor) with pan, zoom, fit and per-view visibility. A few demonstration dimensions are editable and change the drawing; each edit also updates the explicitly mapped component property. Representation snapshots are saved as artifacts against the component. This is not a CAD kernel.

## Run it on its own

```bash
npm install                 # from the repository root
npm run dev:cad
```

Opens the standalone harness at http://localhost:5183: this tool alone on a **mock platform
host** with the sample actuator twin. The harness lets you change the configuration and scenario,
select any object as another tool would, see registered commands and the activity log, and reset
the sample data. Writes go through the same demo repository as the workspace (in a separate
storage key).

## Use it in the workspace

The workspace registers the exported definition (`apps/workspace/src/platform/tools.ts`) and
renders it through the tool registry. Opening it requires the `tool:cad` entitlement.

## Check

```bash
npm run typecheck -w @ews/tool-cad
npx vitest run packages/tool-cad
npm run build:harness -w @ews/tool-cad   # builds the harness into dist-harness/
```

See [AGENTS.md](./AGENTS.md) for responsibilities, permitted dependencies and rules.
