import { defineConfig } from 'vitest/config'

// One test run for the whole monorepo. Tests live next to the code they cover.
export default defineConfig({
  test: {
    // Several agents run suites in parallel on one machine; 5 s per test produced load-only timeouts.
    testTimeout: 20_000,
    environment: 'node',
    // Unit tests only; tests needing PostgreSQL run with npm run req:test:db.
    include: ['packages/*/src/**/*.test.{ts,tsx}', 'apps/*/src/**/*.test.{ts,tsx}', 'services/*/src/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
})
