import { defineConfig } from 'vitest/config'

// One test run for the whole monorepo. Tests live next to the code they cover.
// Two projects: the unit tests, and the real-browser tests (*.browser.test.ts), which each start their own Vite server and
// Chrome. The browser project runs its files one after the other (fileParallelism: false) so two browsers never compete
// with each other, or with a cold Vite transform, while the unit workers are busy. `npm run check` runs both.
const shared = {
  // Several agents run suites in parallel on one machine; 5 s per test produced load-only timeouts.
  testTimeout: 20_000,
  environment: 'node' as const,
}

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          ...shared,
          name: 'unit',
          // Unit tests only; tests needing PostgreSQL run with npm run req:test:db.
          include: ['packages/*/src/**/*.test.{ts,tsx}', 'apps/*/src/**/*.test.{ts,tsx}', 'services/*/src/**/*.test.ts', 'scripts/**/*.test.mjs'],
          exclude: ['**/node_modules/**', '**/*.browser.test.ts'],
        },
      },
      {
        test: {
          ...shared,
          name: 'browser',
          include: ['packages/*/src/**/*.browser.test.ts'],
          exclude: ['**/node_modules/**'],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
})
