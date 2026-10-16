# ADR-0073: SBOM, dependency register and licence checks: integrate npm built-ins, build only the policy layer

Status: Proposed (16 October 2026, infrastructure agent, backlog OSS-2)
Module: Platform / supply chain governance ([strategy §8](../architecture/OPEN_SOURCE_STRATEGY.md))

## Capability and requirements
Per strategy §8: a machine-readable dependency register (name, upstream, version, licence, direct or transitive, consuming
modules, distribution method, approval status, local modifications), automated SBOM generation and licence checks in CI that flag
restricted, unknown or incompatible licences, and a vulnerability report. Requirements: deterministic register (sorted, no
timestamps, diffable), licences classified into the strategy §2 categories, owner decisions (for example ADR-0021 OCCT/LGPL)
recorded without being silently approved, read-only CI with no secrets, no network beyond the npm registry and its advisory database.

## Candidates considered
| Candidate | Upstream | Version checked | Licence (verified) | Maturity and activity | Fit |
| --- | --- | --- | --- | --- | --- |
| `npm sbom` and `npm audit` (npm CLI built-ins) | github.com/npm/cli | 11.19.0 local; latest 12.2.0 (15 Oct 2026) | Artistic-2.0 (npm registry metadata); already installed, not a project dependency | Maintained by GitHub/npm, released daily to weekly | CycloneDX 1.5 and SPDX 2.3 from the lockfile and installed tree; `npm audit` reports advisories. No policy, no per-workspace data |
| `@cyclonedx/cyclonedx-npm` | github.com/CycloneDX/cyclonedx-node-npm | 6.0.1 (11 Aug 2026) | Apache-2.0 (registry metadata) | Active, OWASP CycloneDX project | Richer CycloneDX (licence evidence, hashes); new devDependency with its own transitive tree for what `npm sbom` already gives |
| `license-checker-rseidelsohn` | github.com/RSeidelsohn/license-checker-rseidelsohn | 5.0.1 (27 May 2026) | BSD-3-Clause (registry metadata) | Active fork of the unmaintained `license-checker` (25.0.1, 2019) | Reads licences from installed `node_modules`; result varies by platform-specific optional packages; no approval workflow |
| OSV-Scanner | github.com/google/osv-scanner | v2.7.0 (12 Oct 2026) | Apache-2.0 (GitHub API) | Active (Google), repository pushed 15 Oct 2026 | Strong vulnerability matching from lockfiles; a Go binary or action, not an npm package; a candidate for the vulnerability step later |
| Internal development | this repository | n/a | n/a | n/a | Only for the policy layer: classification, approval workflow, ADR links |

## Licence assessment
All candidates are preferred or permissive (Artistic-2.0 for npm itself is a tool we already run; Apache-2.0, BSD-3-Clause) and
would be dev-only, not distributed. Nothing needs owner approval. The tooling classifies the project's own dependencies; it
does not approve any of them.

## Integration design
- SBOM: `npm sbom --sbom-format cyclonedx` and `spdx` (scripts/deps-sbom.mjs) written to `dist/sbom/` (ignored by git) and uploaded as a
  CI artifact; no large generated files are committed.
- Register: `scripts/deps-register.mjs` reads `package-lock.json` (lockfile v3) only, never `node_modules` or the network, so the
  output is identical on every machine; `docs/dependencies/register.json` is committed (one package per line, about 290 kB) and CI
  fails if it is stale (`--check`). Direct/transitive, runtime/dev scope and consuming workspaces come from walking the lockfile
  graph per workspace. Upstream repository, approval status, obligations, ADR links, local modifications and notes come from the hand-maintained
  `docs/dependencies/policy.json`; missing upstream repositories are `null` rather than guessed.
- Licence policy: `scripts/deps-check.mjs` classifies each SPDX expression (OR takes the least restrictive branch, AND the most) into
  preferred / conditional / restricted / commercial / prohibited / unknown. Fails on restricted, commercial, prohibited and unknown
  unless the package is `approved` in policy.json; conditional (LGPL, MPL, EPL, plus OFL and CC-BY notices) needs `reviewed` or
  `approved`. Status `pending ...` passes but is printed on every run, so open owner decisions (OCCT/LGPL, ADR-0021) stay visible; it is never
  accepted for prohibited licences. The agent seeding the policy marks only what docs/dependencies.md already records as approved
  (fonts, elkjs); everything else is `pending`.
- Vulnerabilities: `npm audit --json` (scripts/deps-sbom.mjs `--audit`) saved to `dist/sbom/npm-audit.json`. **Non-blocking at first**: it
  reports counts and uploads the file but never fails the build; blocking thresholds are a follow-up decision after the first triage.
- CI: read-only `contents: read`, no secrets; network only to the npm registry (`npm audit`).
- Tests: unit tests in `scripts/lib/deps.test.mjs`, including a fixture lockfile with a GPL entry that must fail.

## Decision
Integrate npm's built-ins for the SBOM and vulnerability report (no new dependency) and develop only the thin policy layer
internally, because none of the candidates provides the strategy's approval-status, consumer and ADR-linked register, and
`license-checker-rseidelsohn` depends on installed state. Re-evaluate `@cyclonedx/cyclonedx-npm` if a consumer needs richer
CycloneDX, and OSV-Scanner when vulnerability gating becomes blocking.

## Contribution opportunities
None identified. Nothing is submitted upstream without owner authorization.

## Consequences
No dependency added. CI gains a stale-register check, a licence check, SBOM artifacts and a non-blocking audit. Contributors run
`npm run deps:register` when the lockfile changes. The first run reported open items: `webgl-constants` has no licence field (its
LICENSE file is MIT; unknown by metadata, pending), the MPL-2.0 `lightningcss*` build tool and the CC-BY-4.0 `caniuse-lite` data
(conditional, pending review), and replicad-opencascadejs LGPL-2.1 (pending ADR-0021). Risks: the SPDX parser ignores `WITH`
exceptions and treats unrecognised identifiers as unknown (fail-safe); lockfile licence fields come from registry metadata and can be wrong.
