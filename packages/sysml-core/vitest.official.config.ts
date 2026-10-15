import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Official-corpus conformance measurement (not part of `npm test`). Fetch the corpus first:
//   npx tsx packages/sysml-core/scripts/fetch-official.ts
// then run: npx vitest run --config packages/sysml-core/vitest.official.config.ts
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    environment: 'node',
    include: ['packages/sysml-core/test/official.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
})
