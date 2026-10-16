# AGENTS.md: @ews/sysml-client

Browser client of the SysML Modeler. Owner: the SysML agent.

- `SysmlClient` is the only interface the tool and its assistant actions use.
- Two adapters: HTTP (mode `api`) and local in-browser repository (mode `local`). They must pass the
  same contract suite (`src/contractTests.ts`); a new client method needs a contract test.
- Never fall back silently from `api` to `local` (or the reverse); errors are `SysmlClientError`
  with the server's code.
- Depends only on `@ews/sysml-core`. No React, no `localStorage` access except through an injected
  `StorageLike` in local mode.

## Open-source first (mandatory)

Before designing or coding a new engineering capability, search for established open-source implementations. Prefer integration and contribution over recreation. Document the alternatives considered, license implications, integration strategy, and rationale for any custom implementation ([strategy](../../docs/architecture/OPEN_SOURCE_STRATEGY.md), [evaluation template](../../docs/architecture/open-source-evaluation-template.md), root [AGENTS.md](../../AGENTS.md)).
SysML assignment (strategy §10): evaluate existing SysML v2 implementations, modeling frameworks, graph libraries and visualization components; preserve compatibility with the official SysML v2 specifications and published APIs (without claiming compliance, per the root AGENTS.md).
