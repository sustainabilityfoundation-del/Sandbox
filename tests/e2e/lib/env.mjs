// Shared configuration for the committed browser flows (integration-milestone-1.md §5).
// Override with environment variables; defaults match `npm run dev`.
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../../..')

export const env = {
  /** Workspace URL (trailing slash). */
  base: process.env.E2E_BASE ?? 'http://localhost:5173/workspace/',
  /** API origin hosting every service. */
  api: process.env.E2E_API ?? `http://127.0.0.1:${process.env.API_PORT ?? 8787}`,
  /** Repository root with forward slashes, for Vite `/@fs/` imports of fixtures. */
  repoFs: repo.split('\\').join('/'),
}

/** Chrome or Chromium executable; playwright-core does not download browsers. */
export const launchOptions = {
  executablePath: process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome'),
  headless: process.env.E2E_HEADED ? false : true,
}

/** Screenshot folder for a flow (git-ignored). */
export function shotsDir(name) {
  const dir = join(process.env.E2E_OUTPUT ?? join(here, '..', '.output'), name)
  mkdirSync(dir, { recursive: true })
  return dir.split('\\').join('/')
}

/**
 * The workspace opened on the example project PRJ-ACT100. A browser that remembers no project otherwise opens the
 * person's most recently opened project from the server; flows that need the example name it explicitly.
 * `query` is appended, e.g. exampleUrl('tool=requirements').
 */
export function exampleUrl(query = '') {
  return `${env.base}?project=PRJ-ACT100${query ? `&${query}` : ''}`
}

/**
 * A browser context whose workspace always uses the demo assistant (development builds), so flows never reach a
 * person's connected AI account. Flows that test the AI connection itself use the fake provider instead.
 */
export async function demoAssistantContext(browser, options = {}) {
  const context = await browser.newContext(options)
  await context.addInitScript(() => localStorage.setItem('ews.assistant.forceDemo', '1'))
  return context
}
