# AGENTS.md: @ews/platform-sdk

The versioned tool contract (SDK **1.15.0**, `src/contract/version.ts`), `PlatformHost`, the module
manifests (client and server), the capability registry, React hooks and `defineTool`, the standalone
harness and the testing fixtures. Owner: Platform (the coordinator). Decisions:
[ADR-0002](../../docs/decisions/0002-versioned-tool-contract.md),
[ADR-0074](../../docs/decisions/0074-capability-registry-and-toolbars.md); specifications:
[module-registration.md](../../docs/specifications/module-registration.md),
[capability-registry.md](../../docs/specifications/capability-registry.md).

## Entry points

`@ews/platform-sdk` (framework-free contract, quantities, capabilities, module manifests),
`@ews/platform-sdk/react` (`defineTool`, hooks, engineering UI helpers), `@ews/platform-sdk/harness`
(`mountHarness`, mock host), `@ews/platform-sdk/testing` (`sampleModel`, sample twin). Services import
the root entry only.

## Rules

- Imports only `@ews/model-service` and `@ews/design-system` (`src/boundaries.test.ts`, which also
  enforces every other package's permitted imports; update its table when a package is added).
- Every export is a **shared contract**: follow "Contract changes" in the root [AGENTS.md](../../AGENTS.md).
  Additive changes bump the minor version; breaking changes bump the major version. Write the
  migration note in [CHANGELOG.md](CHANGELOG.md) before merging and validate every tool (`npm run check`, harnesses).
- The host refuses tools built for another major version (`isSdkCompatible`); tools declare `sdkVersion`.
- No module-specific logic: a module's inventory, operations and help live in the module's package and
  reach the platform through its manifest.

## Commands

```bash
npx vitest run packages/platform-sdk
npm run typecheck -w @ews/platform-sdk
npm run check                      # after any contract change
```

## Open-source first (mandatory)

Before designing or coding a new engineering capability, search for established open-source implementations. Prefer integration and contribution over recreation. Document the alternatives considered, license implications, integration strategy, and rationale for any custom implementation ([strategy](../../docs/architecture/OPEN_SOURCE_STRATEGY.md), [evaluation template](../../docs/architecture/open-source-evaluation-template.md), root [AGENTS.md](../../AGENTS.md)).
Capability-complete toolbars (mandatory, owner directive, [directive](../../docs/architecture/CAPABILITY_TOOLBARS.md)): keep this module's full target capability inventory (implemented, partial, planned) in its manifest with evidence for each status; planned commands are shown muted and explained, never executed, and never report success.
