import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * CAD document service tests on a real, disposable PostgreSQL (npm run cad:test:db). Same global
 * setup as the Requirements run (services/api/test/globalSetup.ts); npm run req:test:db also runs them.
 */
export default defineConfig({
  root: resolve(__dirname, '../..'),
  test: {
    environment: 'node',
    include: ['services/cad/test/**/*.test.ts'],
    globalSetup: ['services/api/test/globalSetup.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
})
