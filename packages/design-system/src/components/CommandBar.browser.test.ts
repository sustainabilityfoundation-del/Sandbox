// @vitest-environment node
// CommandBar in a real browser: the fixture (fixtures/command-bar) is served by Vite and driven with playwright-core and the
// installed Chrome (like tests/e2e). The suite is skipped where Chrome is missing; set CHROME_PATH to point at it. With
// COMMAND_BAR_SHOTS=<dir> it also saves a screenshot of each state there.
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright-core'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const chrome = process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome')
const shots = process.env.COMMAND_BAR_SHOTS

const haveChrome = existsSync(chrome)
if (!haveChrome) {
  const message = `CommandBar browser tests need Chrome at ${chrome}; set CHROME_PATH`
  if (process.env.CI) throw new Error(message)
  console.warn(`SKIPPED: ${message}`)
}

describe.skipIf(!haveChrome)('CommandBar in a browser', () => {
  let server: ViteDevServer
  let browser: Browser
  let base = ''

  beforeAll(async () => {
    server = await createServer({
      root: join(here, 'fixtures', 'command-bar'),
      configFile: false,
      logLevel: 'error',
      plugins: [react(), tailwindcss()],
      server: { port: 25191, strictPort: false, host: '127.0.0.1' },
      optimizeDeps: { include: ['react', 'react-dom/client', 'react-aria-components', 'lucide-react'] },
    })
    await server.listen()
    base = server.resolvedUrls!.local[0]
    browser = await chromium.launch({ executablePath: chrome, headless: true })
    if (shots) mkdirSync(shots, { recursive: true })
  }, 90_000)

  // 60 s: closing Chromium and the Vite server can take well over the default hook timeout when several
  // suites (or agents) run in parallel on one machine (see the testTimeout note in vitest.config.ts).
  afterAll(async () => {
    await browser?.close()
    await server?.close()
  }, 60_000)

  async function open(query = '', viewport = { width: 1000, height: 600 }): Promise<Page> {
    const page = await browser.newPage({ viewport })
    await page.goto(`${base}?${query}`)
    await page.getByRole('toolbar', { name: 'Demo toolbar' }).waitFor()
    return page
  }

  it('announces each state in the accessible name', async () => {
    const page = await open()
    await page.getByRole('button', { name: 'Save', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Export STEP, partial: geometry only' }).waitFor()
    await page.getByRole('button', { name: 'Fillet, planned' }).waitFor()
    await page.getByRole('button', { name: 'Reopen, unavailable: Open a document first' }).waitFor()
    expect(await page.getByRole('button', { name: 'Fillet, planned' }).getAttribute('aria-disabled')).toBe('true')
    await page.close()
  })

  it('opens the explanation on Enter for a planned command and invokes nothing', async () => {
    const page = await open()
    const planned = page.getByRole('button', { name: 'Fillet, planned' })
    await planned.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: /Fillet/ })
    await dialog.waitFor()
    expect(await dialog.textContent()).toContain('Round the selected edges.')
    expect(await dialog.textContent()).toContain('BL-CAD-12')
    expect(await page.evaluate(() => window.__calls)).toEqual([])
    await page.close()
  })

  it('returns focus to the command on Escape', async () => {
    const page = await open()
    const planned = page.getByRole('button', { name: 'Fillet, planned' })
    await planned.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('dialog', { name: /Fillet/ }).waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'detached' })
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')), { timeout: 5000 }).toBe('Fillet, planned')
    await page.close()
  })

  it('shows the reason of an unavailable command and invokes nothing', async () => {
    const page = await open()
    await page.getByRole('button', { name: /^Reopen, unavailable/ }).focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: /Reopen/ })
    await dialog.waitFor()
    expect(await dialog.textContent()).toContain('Open a document first')
    expect(await page.evaluate(() => window.__calls)).toEqual([])
    await page.close()
  })

  it('mutes a planned command with the tertiary text colour and dims an unavailable one', async () => {
    const page = await open()
    const style = (name: string | RegExp) => page.getByRole('button', { name }).evaluate((el) => ({ color: getComputedStyle(el).color, opacity: getComputedStyle(el).opacity }))
    const partial = await style(/^Export STEP/)
    const planned = await style('Fillet, planned')
    const unavailable = await style(/^Reopen, unavailable/)
    expect(planned.color).not.toBe(partial.color)
    expect(planned.opacity).toBe('1')
    expect(Number(unavailable.opacity)).toBeLessThan(1)
    await page.close()
  })

  it('invokes ready and partial commands', async () => {
    const page = await open()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('button', { name: /^Export STEP/ }).click()
    expect(await page.evaluate(() => window.__calls)).toEqual(['save', 'export'])
    await page.close()
  })

  it('opens help from the popover and with F1', async () => {
    const page = await open()
    const planned = page.getByRole('button', { name: 'Fillet, planned' })
    await planned.focus()
    await page.keyboard.press('F1')
    expect(await page.evaluate(() => window.__help)).toEqual(['cad.fillet'])
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Open help' }).click()
    expect(await page.evaluate(() => window.__help)).toEqual(['cad.fillet', 'cad.fillet'])
    await page.close()
  })

  it('moves between toolbar controls with the arrow keys and leaves with Tab', async () => {
    const page = await open()
    await page.getByRole('button', { name: 'Save', exact: true }).focus()
    await page.keyboard.press('ArrowRight')
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Export STEP, partial: geometry only')
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('after')
    await page.close()
  })

  it('switches tabs with the arrow keys', async () => {
    const page = await open('tabs=1')
    await page.getByRole('tab', { name: 'Home' }).focus()
    await page.keyboard.press('ArrowRight')
    await page.getByRole('button', { name: 'Fit', exact: true }).waitFor()
    await page.close()
  })

  it('on a tablet moves secondary commands into a group menu; planned ones explain instead of running', async () => {
    const page = await open('layout=tablet')
    expect(await page.getByRole('button', { name: 'Export STEP, partial: geometry only' }).count()).toBe(0)
    await page.getByRole('button', { name: 'Edit: more commands' }).click()
    await page.getByRole('menuitem', { name: /Fillet, planned/ }).click()
    await page.getByRole('dialog', { name: /Fillet/ }).waitFor()
    expect(await page.evaluate(() => window.__calls)).toEqual([])
    await page.close()
  })

  it('on a phone shows tabs as a select and groups as menus, with primary commands visible', async () => {
    const page = await open('layout=phone&tabs=1', { width: 390, height: 700 })
    await page.getByRole('button', { name: 'Save', exact: true }).waitFor()
    expect(await page.getByRole('tablist').count()).toBe(0)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.getByRole('menuitem', { name: /Fillet, planned/ }).waitFor()
    await page.close()
  })

  // The measured layout (no forced layout): below 520 px a phone, below 840 px a tablet, otherwise desktop.
  it('at 520 px is the tablet layout: secondary commands move into a group menu, and nothing scrolls sideways', async () => {
    const page = await open('', { width: 520, height: 600 })
    await page.getByRole('button', { name: 'Edit: more commands' }).waitFor()
    expect(await page.getByRole('button', { name: 'Fillet, planned' }).count()).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    await page.close()
  })

  it('at 519 px is the phone layout: groups are menus and the tabs are a select', async () => {
    const page = await open('tabs=1', { width: 519, height: 600 })
    await page.getByRole('button', { name: 'Edit', exact: true }).waitFor()
    expect(await page.getByRole('tablist').count()).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    await page.close()
  })

  it('at 840 px is the desktop layout: every command is in the bar, tabs are a tab list, and nothing scrolls sideways', async () => {
    const page = await open('tabs=1', { width: 840, height: 600 })
    await page.getByRole('button', { name: 'Fillet, planned' }).waitFor()
    await page.getByRole('tablist').waitFor()
    expect(await page.getByRole('button', { name: 'Edit: more commands' }).count()).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    await page.close()
  })

  it('at 839 px is the tablet layout', async () => {
    const page = await open('', { width: 839, height: 600 })
    await page.getByRole('button', { name: 'Edit: more commands' }).waitFor()
    await page.close()
  })

  it.skipIf(!shots)('saves a screenshot of each state', async () => {
    for (const theme of ['light', 'dark']) {
      const page = await open(`layout=desktop&theme=${theme}`, { width: 820, height: 120 })
      await page.screenshot({ path: join(shots!, `command-bar-states-${theme}.png`) })
      await page.getByRole('button', { name: 'Fillet, planned' }).focus()
      await page.keyboard.press('Enter')
      await page.getByRole('dialog').waitFor()
      await page.setViewportSize({ width: 820, height: 260 })
      await page.screenshot({ path: join(shots!, `command-bar-planned-popover-${theme}.png`) })
      await page.keyboard.press('Escape')
      await page.getByRole('dialog').waitFor({ state: 'detached' })
      await page.getByRole('button', { name: /^Reopen, unavailable/ }).focus()
    await page.keyboard.press('Enter')
      await page.getByRole('dialog').waitFor()
      await page.screenshot({ path: join(shots!, `command-bar-unavailable-popover-${theme}.png`) })
      await page.close()
    }
    const phone = await open('layout=phone&tabs=1', { width: 390, height: 140 })
    await phone.screenshot({ path: join(shots!, 'command-bar-phone.png') })
    await phone.close()
  }, 60_000)
})
