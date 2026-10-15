# AGENTS.md: @ews/sysml-client

Browser client of the SysML Modeler. Owner: the SysML agent.

- `SysmlClient` is the only interface the tool and its assistant actions use.
- Two adapters: HTTP (mode `api`) and local in-browser repository (mode `local`). They must pass the
  same contract suite (`src/contractTests.ts`); a new client method needs a contract test.
- Never fall back silently from `api` to `local` (or the reverse); errors are `SysmlClientError`
  with the server's code.
- Depends only on `@ews/sysml-core`. No React, no `localStorage` access except through an injected
  `StorageLike` in local mode.
