// @vitest-environment node
// The command surfaces (MenuBar, ToolPalette, ContextCommands, CommandSessionStrip, DockPanel, the CommandBar additions)
// in a real browser: fixtures/command-bar/surfaces.tsx is served by Vite and driven with playwright-core and the installed
// Chrome. Like CommandBar.browser.test.ts it fails in CI when Chrome is missing and is skipped locally (set CHROME_PATH).
// With COMMAND_SURFACE_SHOTS=<dir> it also saves a screenshot of each surface in light, dark and phone.
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright-core'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const chrome = process.env.CHROME_PATH ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome')
const shots = process.env.COMMAND_SURFACE_SHOTS

const haveChrome = existsSync(chrome)
if (!haveChrome) {
  const message = `Command surface browser tests need Chrome at ${chrome}; set CHROME_PATH`
  if (process.env.CI) throw new Error(message)
  console.warn(`SKIPPED: ${message}`)
}

declare global {
  interface Window {
    __calls: string[]
    __help: string[]
  }
}

/** Waits until every running CSS animation and transition has finished, then two frames (a state wait, not a fixed delay). */
const settled = (page: Page) =>
  page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))).then(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))))

// 60 s per test: under full-suite load the first interactions can be slow; the page default (15 s) bounds each wait.
describe.skipIf(!haveChrome)('command surfaces in a browser', { timeout: 60_000 }, () => {
  let server: ViteDevServer
  let browser: Browser
  let base = ''
  const pages = new Set<Page>()

  beforeAll(async () => {
    server = await createServer({
      root: join(here, 'fixtures', 'command-bar'),
      configFile: false,
      logLevel: 'error',
      plugins: [react(), tailwindcss()],
      server: { port: 25291, strictPort: false, host: '127.0.0.1' },
      optimizeDeps: { include: ['react', 'react-dom/client', 'react-aria-components', 'lucide-react'] },
    })
    await server.listen()
    base = server.resolvedUrls!.local[0]
    browser = await chromium.launch({ executablePath: chrome, headless: true })
    // Warm-up: Vite transforms the fixture and Tailwind on demand; load the page once so no test pays for it.
    const warmPage = await browser.newPage()
    try {
      warmPage.setDefaultTimeout(60_000)
      await warmPage.goto(`${base}surfaces.html?c=bar`, { timeout: 80_000 })
      await warmPage.locator('#root > *').first().waitFor({ timeout: 80_000 })
    } finally {
      await warmPage.close()
    }
    if (shots) mkdirSync(shots, { recursive: true })
  }, 120_000)

  // 60 s: closing Chromium and the Vite server can take well over the default hook timeout when several
  // suites (or agents) run in parallel on one machine (see the testTimeout note in vitest.config.ts).
  afterEach(async () => {
    await Promise.all([...pages].map((p) => p.close().catch(() => undefined)))
    pages.clear()
  })

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  }, 60_000)

  async function open(query: string, viewport = { width: 1000, height: 600 }): Promise<Page> {
    const page = await browser.newPage({ viewport })
    pages.add(page)
    page.setDefaultTimeout(15_000)
    await page.goto(`${base}surfaces.html?${query}`, { timeout: 30_000 })
    await page.locator('#root > *').first().waitFor()
    return page
  }
  const calls = (page: Page) => page.evaluate(() => window.__calls)
  const focusInMenu = (page: Page) => expect.poll(() => page.evaluate(() => document.activeElement?.closest('[role="menu"]') !== null)).toBe(true)
  const activeLabel = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent)

  // ---- MenuBar --------------------------------------------------------------------------------------

  describe('MenuBar', () => {
    it('is a menubar with one tab stop; arrows, Home and End move between menus', async () => {
      const page = await open('c=menubar&layout=desktop')
      const bar = page.getByRole('menubar', { name: 'Main menu' })
      await bar.waitFor()
      expect(await page.getByRole('menuitem').count()).toBe(3)
      await page.getByRole('menuitem', { name: 'File' }).focus()
      await page.keyboard.press('ArrowRight')
      expect(await activeLabel(page)).toBe('Edit')
      await page.keyboard.press('End')
      expect(await activeLabel(page)).toBe('View')
      await page.keyboard.press('ArrowRight')
      expect(await activeLabel(page)).toBe('File')
      await page.keyboard.press('ArrowLeft')
      expect(await activeLabel(page)).toBe('View')
      await page.keyboard.press('Home')
      expect(await activeLabel(page)).toBe('File')
      // Tab leaves the bar in one step.
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => document.activeElement?.id)).toBe('after')
      await page.close()
    })

    it('opens with ArrowDown, moves the open menu with Left and Right, and Escape returns to the menu', async () => {
      const page = await open('c=menubar&layout=desktop')
      await page.getByRole('menuitem', { name: 'File' }).focus()
      await page.keyboard.press('ArrowDown')
      await page.getByRole('menu', { name: 'File' }).waitFor()
      await focusInMenu(page)
      await page.keyboard.press('ArrowRight')
      await page.getByRole('menu', { name: 'Edit' }).waitFor()
      await focusInMenu(page)
      await page.keyboard.press('ArrowLeft')
      await page.getByRole('menu', { name: 'File' }).waitFor()
      await focusInMenu(page)
      await page.keyboard.press('Escape')
      await page.getByRole('menu').waitFor({ state: 'detached' })
      await expect.poll(() => activeLabel(page), { timeout: 5000 }).toBe('File')
      await page.close()
    })

    it('does not move to the next menu when Right opens a submenu', async () => {
      const page = await open('c=menubar&layout=desktop')
      await page.getByRole('menuitem', { name: 'File' }).focus()
      await page.keyboard.press('ArrowDown')
      await page.getByRole('menu', { name: 'File' }).waitFor()
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowDown')
      expect(await activeLabel(page)).toBe('Export')
      await page.keyboard.press('ArrowRight')
      await page.getByRole('menu', { name: 'Export' }).waitFor()
      expect(await page.getByRole('menu', { name: 'Edit' }).count()).toBe(0)
      await page.keyboard.press('ArrowLeft')
      await page.getByRole('menu', { name: 'Export' }).waitFor({ state: 'detached' })
      await page.getByRole('menu', { name: 'File' }).waitFor()
      await page.close()
    })

    it('underlines mnemonics only while key tips are active, and a mnemonic letter opens the menu', async () => {
      const off = await open('c=menubar&layout=desktop')
      expect(await off.locator('u[data-mnemonic]').count()).toBe(0)
      // Without key tips a menu's mnemonic letter is inert: it does not open the menu.
      await off.getByRole('menuitem', { name: 'File' }).focus()
      await off.keyboard.press('v')
      await settled(off) // a frame round-trip: the key would have opened the menu by now
      expect(await off.getByRole('menu').count()).toBe(0)
      expect(await activeLabel(off)).toBe('File')
      await off.close()
      const page = await open('c=menubar&layout=desktop&keytips=1')
      expect(await page.locator('[role="menubar"] u[data-mnemonic]').allTextContents()).toEqual(['F', 'E', 'V'])
      await page.getByRole('menuitem', { name: 'File' }).focus()
      await page.keyboard.press('v')
      await page.getByRole('menu', { name: 'View' }).waitFor()
      await page.keyboard.press('Escape')
      await page.getByRole('menuitem', { name: 'File' }).focus()
      await page.keyboard.press('f')
      await page.getByRole('menu', { name: 'File' }).waitFor()
      await focusInMenu(page)
      // An item mnemonic invokes the item while key tips are active.
      await page.keyboard.press('s')
      await expect.poll(() => calls(page)).toEqual(['save'])
      await page.close()
    })

    it('supports sections, submenus, separators and checked items', async () => {
      const page = await open('c=menubar&layout=desktop')
      await page.getByRole('menuitem', { name: 'View' }).click()
      await page.getByRole('menu', { name: 'View' }).waitFor()
      expect(await page.getByRole('menuitemcheckbox', { name: 'Grid' }).getAttribute('aria-checked')).toBe('true')
      expect(await page.getByRole('menuitemcheckbox', { name: 'Axes' }).getAttribute('aria-checked')).toBe('false')
      await page.keyboard.press('Escape')
      await page.getByRole('menuitem', { name: 'File' }).click()
      expect(await page.getByRole('separator').count()).toBeGreaterThan(0)
      await page.getByRole('menuitem', { name: 'Export' }).hover()
      await page.getByRole('menuitem', { name: 'STEP, partial: geometry only' }).waitFor()
      await page.getByRole('menuitem', { name: 'IGES, planned' }).waitFor()
      await page.close()
    })

    it('announces each state and never invokes a planned or unavailable entry', async () => {
      const page = await open('c=menubar&layout=desktop')
      await page.getByRole('menuitem', { name: 'Edit' }).click()
      await page.getByRole('menuitem', { name: 'Fillet, planned' }).click()
      await page.getByRole('dialog', { name: /Fillet/ }).waitFor()
      expect(await calls(page)).toEqual([])
      await page.keyboard.press('Escape')
      await page.getByRole('menuitem', { name: 'File' }).click()
      await page.getByRole('menuitem', { name: 'Reopen, unavailable: Open a document first' }).focus()
      await page.keyboard.press('Enter')
      await page.getByRole('dialog', { name: /Reopen/ }).waitFor()
      expect(await calls(page)).toEqual([])
      await page.close()
    })

    it('on a tablet is one Menu button with submenus', async () => {
      const page = await open('c=menubar&layout=tablet', { width: 700, height: 500 })
      expect(await page.getByRole('menubar').count()).toBe(0)
      await page.getByRole('button', { name: 'Menu', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Edit' }).click()
      await page.getByRole('menuitem', { name: 'Fillet, planned' }).click()
      await page.getByRole('dialog', { name: /Fillet/ }).waitFor()
      expect(await calls(page)).toEqual([])
      await page.close()
    })

    it('on a phone is a full-screen sheet with search first; a planned result explains and invokes nothing', async () => {
      const page = await open('c=menubar&layout=phone', { width: 390, height: 700 })
      await page.getByRole('button', { name: 'Menu', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Menu' })
      await dialog.waitFor()
      await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('INPUT')
      await page.keyboard.type('fillet')
      const row = dialog.getByRole('button', { name: 'Fillet, planned' })
      await row.click({ force: true })
      await dialog.getByRole('note').waitFor()
      expect(await calls(page)).toEqual([])
      await page.getByRole('searchbox', { name: 'Search commands' }).fill('save')
      await dialog.getByRole('button', { name: 'Save', exact: true }).click()
      expect(await calls(page)).toEqual(['save'])
      await page.close()
    })
  })

  // ---- ToolPalette ----------------------------------------------------------------------------------

  describe('ToolPalette', () => {
    it('is a vertical toolbar; a tool arms with aria-pressed and Escape disarms it', async () => {
      const page = await open('c=palette&layout=desktop')
      const toolbar = page.getByRole('toolbar', { name: 'Sketch tools' })
      await toolbar.waitFor()
      expect(await toolbar.getAttribute('aria-orientation')).toBe('vertical')
      const line = page.getByRole('button', { name: 'Line', exact: true })
      expect(await line.getAttribute('aria-pressed')).toBe('false')
      await line.click()
      expect(await line.getAttribute('aria-pressed')).toBe('true')
      expect(await calls(page)).toEqual(['arm:line'])
      await line.focus()
      await page.keyboard.press('Escape')
      await expect.poll(() => line.getAttribute('aria-pressed')).toBe('false')
      expect(await calls(page)).toEqual(['arm:line', 'disarm:line'])
      await page.close()
    })

    it('moves between tools with the arrow keys and collapses groups', async () => {
      const page = await open('c=palette&layout=desktop')
      await page.getByRole('button', { name: 'Line', exact: true }).focus()
      await page.keyboard.press('ArrowDown')
      expect(await activeLabel(page)).toBe('Circle')
      const draw = page.getByRole('button', { name: 'Draw', exact: true })
      expect(await draw.getAttribute('aria-expanded')).toBe('true')
      await draw.click()
      expect(await draw.getAttribute('aria-expanded')).toBe('false')
      expect(await page.getByRole('button', { name: 'Line', exact: true }).count()).toBe(0)
      const pattern = page.getByRole('button', { name: 'Pattern', exact: true })
      expect(await pattern.getAttribute('aria-expanded')).toBe('false')
      await pattern.click()
      await page.getByRole('button', { name: 'Linear pattern, planned' }).waitFor()
      await page.close()
    })

    it('announces planned tools and never arms one', async () => {
      const page = await open('c=palette&layout=desktop')
      const spline = page.getByRole('button', { name: 'Spline, planned' })
      expect(await spline.getAttribute('aria-disabled')).toBe('true')
      expect(await spline.getAttribute('aria-pressed')).toBeNull()
      await spline.focus()
      await page.keyboard.press('Enter')
      await page.getByRole('dialog', { name: /Spline/ }).waitFor()
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Tangent, planned' }).click({ force: true })
      expect(await calls(page)).toEqual([])
      await page.close()
    })

    it('on a phone collapses to an Add button and sheet; choosing a tool arms it and closes the sheet', async () => {
      const page = await open('c=palette&layout=phone', { width: 390, height: 700 })
      expect(await page.getByRole('toolbar').count()).toBe(0)
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      const sheet = page.getByRole('dialog', { name: 'Add' })
      await sheet.waitFor()
      await settled(page) // the sheet slides in
      await sheet.getByRole('button', { name: 'Spline, planned' }).click({ force: true })
      await sheet.getByRole('note').waitFor()
      expect(await calls(page)).toEqual([])
      await sheet.getByRole('button', { name: 'Circle', exact: true }).click()
      await sheet.waitFor({ state: 'detached' })
      expect(await calls(page)).toEqual(['arm:circle'])
      await page.getByRole('button', { name: 'Add: Circle armed' }).waitFor()
      await page.close()
    })
  })

  // ---- ContextCommands ------------------------------------------------------------------------------

  describe('ContextCommands', () => {
    it('floating: icon buttons announce their state; a planned one explains and invokes nothing', async () => {
      const page = await open('c=context&layout=desktop')
      const toolbar = page.getByRole('toolbar', { name: 'Selection commands' })
      await toolbar.waitFor()
      await toolbar.getByRole('button', { name: 'Delete', exact: true }).click()
      expect(await calls(page)).toEqual(['delete'])
      await toolbar.getByRole('button', { name: 'Fillet edge, planned' }).click({ force: true })
      await page.getByRole('dialog', { name: /Fillet edge/ }).waitFor()
      await page.keyboard.press('Escape')
      await toolbar.getByRole('button', { name: 'Isolate, unavailable: Open a document first' }).click({ force: true })
      await page.getByRole('dialog', { name: /Isolate/ }).waitFor()
      expect(await calls(page)).toEqual(['delete'])
      await page.close()
    })

    it('menu: opens next to the anchor; Escape closes; a planned item explains and invokes nothing', async () => {
      const page = await open('c=context&layout=tablet', { width: 700, height: 500 })
      const menu = page.getByRole('menu', { name: 'Selection commands' })
      await menu.waitFor()
      await page.keyboard.press('Escape')
      await menu.waitFor({ state: 'detached' })
      await page.locator('#open-context').click()
      await menu.waitFor()
      await menu.getByRole('menuitem', { name: 'Fillet edge, planned' }).click({ force: true })
      await page.getByRole('dialog', { name: /Fillet edge/ }).waitFor()
      expect(await calls(page)).toEqual([])
      await page.close()
    })

    it('sheet: bottom-sheet targets are at least 40 px; a planned row explains and invokes nothing', async () => {
      const page = await open('c=context&layout=phone', { width: 390, height: 700 })
      const sheet = page.getByRole('dialog', { name: 'Selection commands' })
      await sheet.waitFor()
      const rows = sheet.locator('[data-command-row] button')
      expect(await rows.count()).toBe(4)
      for (const box of await rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(40)
      await sheet.getByRole('button', { name: 'Fillet edge, planned' }).click({ force: true })
      await sheet.getByRole('note').waitFor()
      expect(await calls(page)).toEqual([])
      await sheet.getByRole('button', { name: 'Hide', exact: true }).click()
      expect(await calls(page)).toEqual(['hide'])
      await sheet.waitFor({ state: 'detached' })
      await page.close()
    })
  })

  // ---- CommandSessionStrip --------------------------------------------------------------------------

  describe('CommandSessionStrip', () => {
    it('Enter in a number field commits it and presses OK', async () => {
      const page = await open('c=session&layout=desktop')
      const field = page.getByRole('textbox', { name: 'Depth (mm)' })
      await field.waitFor()
      await field.fill('25')
      await page.keyboard.press('Enter')
      await page.locator('#closed').waitFor()
      expect(await calls(page)).toEqual(['ok:25'])
      await page.close()
    })

    it('Escape cancels', async () => {
      const page = await open('c=session&layout=desktop')
      await page.getByRole('textbox', { name: 'Depth (mm)' }).focus()
      await page.keyboard.press('Escape')
      await page.locator('#closed').waitFor()
      expect(await calls(page)).toEqual(['cancel'])
      await page.close()
    })

    it('Preview is a toggle; the arrow keys step the number by its step and the bounds clamp it', async () => {
      const page = await open('c=session&layout=desktop')
      const preview = page.getByRole('button', { name: 'Preview' })
      expect(await preview.getAttribute('aria-pressed')).toBe('false')
      await preview.click()
      expect(await preview.getAttribute('aria-pressed')).toBe('true')
      const field = page.getByRole('textbox', { name: 'Depth (mm)' })
      await field.focus()
      await page.keyboard.press('ArrowUp')
      expect(await field.inputValue()).toBe('10.5')
      await field.fill('9999')
      await page.keyboard.press('Tab')
      expect(await field.inputValue()).toBe('500')
      await page.close()
    })

    it('OK is unavailable with a reason: focusable, announced, and neither click nor Enter confirms', async () => {
      const page = await open('c=session&layout=desktop&blocked=1')
      const ok = page.getByRole('button', { name: 'OK, unavailable: Select a profile first' })
      expect(await ok.getAttribute('aria-disabled')).toBe('true')
      await page.getByText('Select a profile first').waitFor()
      await ok.click({ force: true })
      await page.getByRole('textbox', { name: 'Depth (mm)' }).focus()
      await page.keyboard.press('Enter')
      await settled(page)
      expect(await calls(page)).toEqual([])
      await page.close()
    })

    it('OK becomes unavailable when the host sets a reason for the current value', async () => {
      const page = await open('c=session&layout=desktop')
      await page.getByRole('textbox', { name: 'Depth (mm)' }).fill('0')
      await page.keyboard.press('Tab')
      await page.getByRole('button', { name: 'OK, unavailable: Depth must be greater than 0' }).waitFor()
      await page.close()
    })
  })

  // ---- DockPanel ------------------------------------------------------------------------------------

  describe('DockPanel', () => {
    it('docks inline on a desktop and closes from its header', async () => {
      const page = await open('c=dock&layout=desktop')
      const panel = page.getByRole('complementary', { name: 'Browser' })
      await panel.waitFor()
      await panel.getByRole('button', { name: 'Close browser' }).click()
      await panel.waitFor({ state: 'detached' })
      await page.close()
    })

    it('is a drawer on a tablet and a sheet on a phone', async () => {
      const tablet = await open('c=dock&layout=tablet', { width: 700, height: 500 })
      await tablet.getByRole('dialog', { name: 'Browser' }).waitFor()
      await tablet.keyboard.press('Escape')
      await tablet.getByRole('dialog').waitFor({ state: 'detached' })
      await tablet.close()
      const phone = await open('c=dock&layout=phone', { width: 390, height: 700 })
      await phone.getByRole('dialog', { name: 'Browser' }).waitFor()
      await phone.close()
    })
  })

  // ---- MenuSection ----------------------------------------------------------------------------------

  describe('MenuSection', () => {
    it('reports selection changes of its checked items through onSelectionChange', async () => {
      const page = await open('c=section')
      await page.getByRole('button', { name: 'Show' }).click()
      await page.getByRole('menu').waitFor()
      expect(await page.getByRole('menuitemcheckbox', { name: 'Grid' }).getAttribute('aria-checked')).toBe('true')
      await page.getByRole('menuitemcheckbox', { name: 'Axes' }).click()
      await expect.poll(() => calls(page)).toEqual(['select:axes,grid'])
      await page.close()
    })
  })

  // ---- CommandBar additions -------------------------------------------------------------------------

  describe('CommandBar additions', () => {
    it('toggle and tool commands expose aria-pressed; an exclusive group keeps the active command', async () => {
      const page = await open('c=bar&layout=desktop')
      expect(await page.getByRole('button', { name: 'Sketch', exact: true }).getAttribute('aria-pressed')).toBe('true')
      const select = page.getByRole('button', { name: 'Select', exact: true })
      const pan = page.getByRole('button', { name: 'Pan', exact: true })
      expect(await select.getAttribute('aria-pressed')).toBe('true')
      expect(await pan.getAttribute('aria-pressed')).toBe('false')
      await select.click()
      expect(await calls(page)).toEqual([])
      await pan.click()
      expect(await pan.getAttribute('aria-pressed')).toBe('true')
      expect(await select.getAttribute('aria-pressed')).toBe('false')
      expect(await calls(page)).toEqual(['mode:pan'])
      await page.close()
    })

    it('split: the main part and each child have their own state', async () => {
      const page = await open('c=bar&layout=desktop')
      await page.getByRole('button', { name: 'Extrude', exact: true }).click()
      expect(await calls(page)).toEqual(['extrude'])
      await page.getByRole('button', { name: 'Extrude: more options' }).click()
      await page.getByRole('menuitem', { name: 'Thin extrude, planned' }).waitFor()
      await page.getByRole('menuitem', { name: 'Extrude surface, partial: geometry only' }).waitFor()
      await page.getByRole('menuitem', { name: 'Thin extrude, planned' }).click()
      await page.getByRole('dialog', { name: /Thin extrude/ }).waitFor()
      expect(await calls(page)).toEqual(['extrude'])
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Extrude: more options' }).click()
      await page.getByRole('menuitem', { name: 'Extrude cut', exact: true }).click()
      expect(await calls(page)).toEqual(['extrude', 'extrude-cut'])
      await page.close()
    })

    it('shows counts in the group description', async () => {
      const page = await open('c=bar&layout=desktop')
      const group = page.getByRole('group', { name: 'Create' })
      const described = await group.getAttribute('aria-describedby')
      expect(await page.locator(`[id="${described}"]`).textContent()).toBe('2 of 2 available')
      expect(await page.getByRole('group', { name: 'Mode' }).getAttribute('aria-describedby')).toBeTruthy()
      await page.close()
    })

    it('an all-planned group is one muted button with a count listing its planned commands', async () => {
      const page = await open('c=bar&layout=desktop')
      const button = page.getByRole('button', { name: 'Simulation: 0 of 6 available, planned' })
      await button.waitFor()
      expect(await button.textContent()).toContain('0 of 6')
      expect(await page.getByRole('button', { name: 'Static, planned' }).count()).toBe(0)
      await button.click()
      expect(await page.getByRole('menuitem').count()).toBe(6)
      await page.getByRole('menuitem', { name: 'Modal, planned' }).click()
      await page.getByRole('dialog', { name: /Modal/ }).waitFor()
      expect(await calls(page)).toEqual([])
      await page.close()
    })

    it('puts the tabs that do not fit into a More tabs menu and keeps the chosen tab visible', async () => {
      const page = await open('c=bar&many=1', { width: 520, height: 400 })
      const more = page.getByRole('button', { name: 'More tabs' })
      await more.waitFor()
      const shown = await page.getByRole('tab').count()
      expect(shown).toBeLessThan(9)
      await more.click()
      await page.getByRole('menuitem', { name: 'Automation' }).click()
      await page.getByRole('tab', { name: 'Automation', selected: true }).waitFor()
      expect(await page.getByRole('tab').count()).toBe(shown)
      await page.close()
      const wide = await open('c=bar&many=1', { width: 1400, height: 400 })
      await wide.getByRole('tab', { name: 'Automation' }).waitFor()
      expect(await wide.getByRole('button', { name: 'More tabs' }).count()).toBe(0)
      await wide.close()
    })

    it('a quick bar leads the row with icon-only commands that announce their state', async () => {
      const page = await open('c=bar&layout=desktop&quick=1')
      const quick = page.getByRole('toolbar', { name: 'Quick access' })
      await quick.waitFor()
      await quick.getByRole('button', { name: 'Save', exact: true }).click()
      expect(await calls(page)).toEqual(['q-save'])
      await quick.getByRole('button', { name: 'Redo, planned' }).click({ force: true })
      await page.getByRole('dialog', { name: /Redo/ }).waitFor()
      expect(await calls(page)).toEqual(['q-save'])
      const order = await page.evaluate(() => {
        const q = document.querySelector('[aria-label="Quick access"]')!.getBoundingClientRect().left
        const t = document.querySelector('[aria-label="Demo toolbar"]')!.getBoundingClientRect().left
        return q < t
      })
      expect(order).toBe(true)
      await page.close()
    })
  })

  // ---- Widths ----------------------------------------------------------------------------------------

  describe('widths', () => {
    for (const width of [520, 840]) {
      it(`${width} px: no horizontal page scroll on any surface`, async () => {
        for (const query of ['c=bar&many=1&quick=1', 'c=menubar', 'c=palette', 'c=session', 'c=dock', 'c=context']) {
          const page = await open(query, { width, height: 700 })
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
          expect(overflow, `${query} at ${width}`).toBeLessThanOrEqual(0)
          await page.close()
        }
      })
    }

    it('520 px is the tablet layout and 840 px the desktop layout', async () => {
      const tablet = await open('c=menubar', { width: 520, height: 400 })
      await tablet.getByRole('button', { name: 'Menu', exact: true }).waitFor()
      await tablet.close()
      const desktop = await open('c=menubar', { width: 840, height: 400 })
      await desktop.getByRole('menubar').waitFor()
      await desktop.close()
      const phone = await open('c=menubar', { width: 519, height: 400 })
      await phone.getByRole('button', { name: 'Menu', exact: true }).click()
      await phone.getByRole('dialog', { name: 'Menu' }).waitFor()
      await phone.close()
    })
  })

  // ---- Screenshots -----------------------------------------------------------------------------------

  it.skipIf(!shots)('saves a screenshot of each surface in light, dark and phone', async () => {
    const take = async (name: string, query: string, viewport: { width: number; height: number }, act?: (page: Page) => Promise<void>) => {
      const page = await open(query, viewport)
      if (act) await act(page)
      await settled(page)
      await page.screenshot({ path: join(shots!, `${name}.png`) })
      await page.close()
    }
    for (const theme of ['light', 'dark']) {
      const t = `theme=${theme}`
      await take(`menubar-${theme}`, `c=menubar&layout=desktop&keytips=1&${t}`, { width: 700, height: 260 }, async (p) => {
        await p.getByRole('menuitem', { name: 'File' }).click()
        await p.getByRole('menuitem', { name: 'Export' }).hover()
      })
      await take(`palette-${theme}`, `c=palette&layout=desktop&${t}`, { width: 520, height: 420 }, async (p) => {
        await p.getByRole('button', { name: 'Line', exact: true }).click()
      })
      await take(`context-floating-${theme}`, `c=context&layout=desktop&${t}`, { width: 520, height: 260 })
      await take(`context-menu-${theme}`, `c=context&layout=tablet&${t}`, { width: 700, height: 420 })
      await take(`session-${theme}`, `c=session&layout=desktop&blocked=1&${t}`, { width: 900, height: 120 })
      await take(`dock-${theme}`, `c=dock&layout=desktop&${t}`, { width: 700, height: 380 })
      await take(`command-bar-${theme}`, `c=bar&layout=desktop&quick=1&many=1&${t}`, { width: 1000, height: 220 }, async (p) => {
        await p.getByRole('button', { name: 'Extrude: more options' }).click()
      })
      await take(`command-bar-planned-group-${theme}`, `c=bar&layout=desktop&${t}`, { width: 900, height: 260 }, async (p) => {
        await p.getByRole('button', { name: /^Simulation/ }).click()
      })
    }
    const phone = { width: 390, height: 720 }
    await take('menubar-phone', 'c=menubar&layout=phone', phone, async (p) => {
      await p.getByRole('button', { name: 'Menu', exact: true }).click()
      await p.getByRole('dialog').waitFor()
    })
    await take('menubar-tablet', 'c=menubar&layout=tablet', { width: 700, height: 360 }, async (p) => {
      await p.getByRole('button', { name: 'Menu', exact: true }).click()
      await p.getByRole('menuitem', { name: 'Edit' }).click()
    })
    await take('palette-phone', 'c=palette&layout=phone', phone, async (p) => {
      await p.getByRole('button', { name: 'Add', exact: true }).click()
      await p.getByRole('button', { name: 'Spline, planned' }).click({ force: true })
    })
    await take('context-sheet-phone', 'c=context&layout=phone', phone)
    await take('session-phone', 'c=session&layout=phone&blocked=1', { width: 390, height: 260 })
    await take('dock-phone', 'c=dock&layout=phone', phone)
    await take('command-bar-tablet-more-tabs', 'c=bar&many=1&quick=1', { width: 520, height: 260 })
  }, 180_000)
})
