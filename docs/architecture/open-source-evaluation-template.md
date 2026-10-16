# Open-source evaluation template (build versus integrate)

Use this for every significant new engineering capability, as required by
[the open-source strategy](OPEN_SOURCE_STRATEGY.md) §3. Copy it into a new ADR in `docs/decisions/` (next free number) and fill
in every section; write "not applicable" with a reason rather than deleting a section. Keep it short: facts, sources and the
decision. Read-only research can be delegated to the `researcher` agent; the decision is recorded by the module owner and
reviewed by the coordinator.

```markdown
# ADR-NNNN: <capability>: build, integrate or extend

Status: Proposed (<date>, <module agent>)
Module: <owning module from AGENTS.md "Ownership">

## Capability and requirements
What the capability must do for the user, with the essential requirements (inputs, outputs, units, accuracy, performance,
determinism, local/cloud execution) and the link to the brief or D1 step it serves.

## Candidates considered (at least three where available)
| Candidate | Upstream (URL) | Version checked | Licence (verified, with source) | Maturity and activity | Fit |
| --- | --- | --- | --- | --- | --- |
| <project> | | | | releases, maintainers, last release, issue response | functionality, performance, documentation |
| <project> | | | | | |
| <project> | | | | | |
| Internal development | | | | | |

## Licence assessment
Category per the strategy §2 (preferred / conditional / restricted review / commercial / prohibited), how it is distributed
(browser bundle, server process, desktop, SaaS only), linking or modification, notices and corresponding-source obligations,
and whether owner approval is required (GPL, AGPL, commercial terms, cost).

## Integration design
The interface the platform calls (versioned contract, replaceable backend), input/output schemas and units, error handling,
provenance recorded (engine name and version, inputs, settings), isolation for externally executed code, tests at the boundary,
and how results enter the platform's information model (which stays the source of truth; loss-aware import/export).

## Decision
Adopt / extend / integrate / develop internally, and why. Custom development needs one of: no candidate meets essential
requirements; unacceptable integration or licence constraints; it is the product's differentiation. "Easier to write new code"
is not a reason.

## Contribution opportunities
Upstream fixes, tests or documentation worth offering later. Nothing is published or submitted upstream without explicit owner
authorization (strategy §7).

## Consequences
Dependencies added (also recorded in docs/dependencies.md), effect on D1, migration of existing code (replacement only with a
demonstrated benefit), risks and follow-ups.
```
