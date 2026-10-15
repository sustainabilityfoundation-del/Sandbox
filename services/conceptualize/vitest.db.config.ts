import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Conceptualize tests on a real, disposable PostgreSQL (npm run concept:test:db). Same global setup as
 * the Requirements run (services/api/test/globalSetup.ts); npm run req:test:db also includes these files.
 */
export default defineConfig({
  root: resolve(__dirname, '../..'),
  test: {
    environment: 'node',
    include: ['services/conceptualize/test/**/*.test.ts', 'packages/conceptualize-client/test/**/*.test.ts'],
    globalSetup: ['services/api/test/globalSetup.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
})
