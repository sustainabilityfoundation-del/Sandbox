# Official-corpus conformance harness

Measures how much of the official SysML v2 release corpus (examples, training models, standard
library) the `@ews/sysml-core` parser handles. It is a measurement, not part of `npm test`: low pass
rates do not fail it; a parser exception (crash) does.

## Fetch

```sh
npx tsx packages/sysml-core/scripts/fetch-official.ts          # latest release tag >= 2026-04
npx tsx packages/sysml-core/scripts/fetch-official.ts 2026-08  # a specific tag
```

This downloads the `Systems-Modeling/SysML-v2-Release` archive from codeload.github.com and extracts
only `sysml/src/examples`, `sysml/src/training`, `sysml.library`, `LICENSE` and `README*` into
`.data/sysml-release/<tag>/` (git-ignored), with a `manifest.json` (tag, URL, licence statement,
date, file counts).

## Run

```sh
npx vitest run --config packages/sysml-core/vitest.official.config.ts
```

The suite uses the newest fetched tag (it is skipped with a message when nothing is fetched) and
writes `conformance-report.json` and `conformance-report.md` next to the corpus. Each example and
training file is loaded with `loadText` and classified PASS (no diagnostics), UNSUPPORTED (only
`SYSML-SYNTAX-UNSUPPORTED` and/or `SYSML-RESOLVE`; resolution failures are expected because the
official models import library packages the platform library subset lacks) or SYNTAX (other syntax
errors). Library `.sysml` files are checked with `parse()` only.

## Licence

From release tag 2026-04 the KerML/SysML models in `SysML-v2-Release` are licensed EPL-2.0; earlier
tags are LGPL-3.0, and the fetch script refuses them. The official files are never committed to this
repository.
