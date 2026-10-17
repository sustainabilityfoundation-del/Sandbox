// `npm run ai:dev:fake`: `npm run dev` with the scripted fake AI provider registered (development only), for
// trying the Connect → ask → proposal → Apply flow without an AI account. Any key starting with "fake-" works.
// It also replays the recorded tool-call scripts in tests/e2e/fixtures/fake-scripts (plumbing tests, not model runs).
// Ports follow the usual variables (API_PORT, EMBEDDED_PG_PORT); extra arguments go to the workspace dev server.
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Recorded tool-call scripts the fake provider replays (test fixtures; tests/e2e/flows/demo-d1.mjs).
const scripts = resolve(dirname(fileURLToPath(import.meta.url)), '../../../tests/e2e/fixtures/fake-scripts')

const npmCli = process.env.npm_execpath
if (!npmCli) {
  console.error('Start this with npm run ai:dev:fake.')
  process.exit(1)
}
const child = spawn(process.execPath, [npmCli, 'run', 'dev', '--', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, EWS_AI_MODE: 'mock', EWS_ASSISTANT_FAKE_PROVIDER: '1', EWS_ASSISTANT_FAKE_SCRIPTS: process.env.EWS_ASSISTANT_FAKE_SCRIPTS ?? scripts } })
child.on('exit', (code) => process.exit(code ?? 0))
process.on('SIGINT', () => undefined)
