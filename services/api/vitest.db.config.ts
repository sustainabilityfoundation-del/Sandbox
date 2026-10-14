import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Real-PostgreSQL test run (npm run req:test:db). A global setup starts official PostgreSQL
 * binaries (embedded-postgres) in a temporary directory, or uses EWS_TEST_PG_ADMIN_URL (for
 * example Docker Compose). Each test file creates and drops its own ews_test_* database.
 */
export default defineConfig({
  root: resolve(__dirname, '../..'),
  test: {
    environment: 'node',
    include: ['services/*/test/**/*.test.ts', 'services/*/src/**/*.test.ts', 'packages/requirements-client/test/**/*.test.ts'],
    globalSetup: ['services/api/test/globalSetup.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
})
