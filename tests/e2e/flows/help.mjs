// Unified help system: Help menu, dynamic module submenus, Help Centre, F1, tour, fallbacks, phone.
import { env, launchOptions, shotsDir } from '../lib/env.mjs'
import { chromium } from 'playwright-core'

const base = env.base
const shots = shotsDir('help')
const b = await chromium.launch({ ...launchOptions })
let failures = 0
const check = (tag, cond, msg) => { console.log(`[${tag}] ${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++ }
const problems = []
const watch = (p) => {
  p.on('pageerror', (e) => problems.push(e.message))
  p.on('console', (m) => m.type() === 'error' && !/favicon|DevTools/.test(m.text()) && problems.push(m.text().slice(0, 200)))
}
const page = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()
watch(page)
await page.goto(base); await page.waitForSelector('.ws-app'); await page.evaluate(() => localStorage.clear())
await page.goto(`${base}?tool=requirements`); await page.waitForSelector('.ws-app'); await page.waitForTimeout(2500)
const closeHelp = async () => { await page.locator('[data-testid="help-centre"]').locator('xpath=ancestor::*[@role="dialog"]').getByRole('button', { name: /^Close/ }).first().click(); await page.waitForTimeout(300) }

// 1. Help button: visible, labelled, top right.
const helpBtn = page.getByRole('button', { name: 'Help', exact: true })
check('button', await helpBtn.isVisible(), 'Help button is visible with an accessible name')
const box = await helpBtn.boundingBox()
check('button', box && box.x > 1500 && box.y < 60, `Help button sits in the upper-right corner (${box && Math.round(box.x)},${box && Math.round(box.y)})`)

// 2. Menu and dynamic module submenus.
await helpBtn.click()
const items = await page.getByRole('menuitem').allTextContents()
for (const label of ['Help Centre', 'Contextual help', 'Getting started', 'Keyboard shortcuts', 'Requirements', 'SysML', 'CAD', 'AI Interface', 'API documentation', 'About and versions']) {
  check('menu', items.some((t) => t.includes(label)), `menu has “${label}”`)
}
await page.getByRole('menuitem', { name: /^Requirements/ }).hover()
await page.waitForTimeout(400)
const sub = await page.locator('[role="menu"]').last().getByRole('menuitem').allTextContents()
check('submenu', ['User guide', 'Feature reference', 'Tutorial: Create your first requirement', 'Keyboard shortcuts', 'Troubleshooting', 'API documentation'].every((l) => sub.some((t) => t.includes(l))), `Requirements submenu: ${sub.join(' | ')}`)
await page.screenshot({ path: `${shots}/help-1-menu.png` })
await page.getByRole('menuitem', { name: /^SysML(?! Modeler)/ }).hover()
await page.waitForTimeout(400)
const sysml = await page.locator('[role="menu"]').last().getByRole('menuitem').allTextContents().catch(() => [])
check('fallback', sysml.some((t) => t.includes('No documentation yet')), `a module without documentation says so (${sysml.join(' | ')})`)
await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(300)

// 3. Help Centre from the Requirements submenu, search, navigation.
await helpBtn.click()
await page.getByRole('menuitem', { name: /^Requirements/ }).hover(); await page.waitForTimeout(400)
await page.getByRole('menuitem', { name: 'User guide' }).click()
await page.waitForSelector('[data-testid="help-centre"]')
check('centre', (await page.getAttribute('[data-help-topic]', 'data-help-topic')) === 'requirements.overview', 'User guide opens the Requirements overview')
await page.getByRole('link', { name: 'Lifecycle and reviews' }).first().click()
check('centre', (await page.getAttribute('[data-help-topic]', 'data-help-topic')) === 'requirements.lifecycle', 'help: links navigate between topics')
await page.getByRole('searchbox', { name: 'Search help' }).fill('baseline')
await page.waitForSelector('[data-help-result]')
const results = await page.locator('[data-help-result]').evaluateAll((els) => els.map((e) => e.getAttribute('data-help-result')))
check('search', results.includes('platform.baselines') && results.includes('requirements.baselines'), `search spans modules (${results.join(', ')})`)
await page.screenshot({ path: `${shots}/help-2-centre.png` })
await closeHelp()

// 4. F1 on the toolbar Add button opens its topic.
await page.locator('[data-toolbar-id="add"]').first().focus()
await page.keyboard.press('F1')
await page.waitForSelector('[data-testid="help-centre"]')
check('f1', (await page.getAttribute('[data-help-topic]', 'data-help-topic')) === 'requirements.requirement.create', 'F1 on Add opens “Create a requirement”')
await closeHelp()
// F1 with nothing focused in a tool: the active tool's guide.
await page.locator('body').click({ position: { x: 5, y: 990 } }).catch(() => {})
await page.keyboard.press('F1')
await page.waitForSelector('[data-testid="help-centre"]')
const f1Tool = await page.getAttribute('[data-help-topic]', 'data-help-topic')
check('f1', ['requirements.overview', 'platform.getting-started'].includes(f1Tool), `F1 elsewhere opens a sensible topic (${f1Tool})`)
await closeHelp()

// 5. Guided tour.
await helpBtn.click()
await page.getByRole('menuitem', { name: /^Requirements/ }).hover(); await page.waitForTimeout(400)
await page.getByRole('menuitem', { name: /Tutorial: Create your first requirement/ }).click()
await page.waitForSelector('.driver-popover', { timeout: 8000 }).catch(() => {})
check('tour', (await page.locator('.driver-popover-title').textContent().catch(() => '')) === 'Add a requirement', 'the tour starts at the Add button')
const highlighted = await page.evaluate(() => document.querySelector('.driver-active-element')?.getAttribute('data-help-id'))
check('tour', highlighted === 'requirements.requirement.create', `the Add button is highlighted (${highlighted})`)
await page.waitForTimeout(900); await page.screenshot({ path: `${shots}/help-3-tour.png` })
await page.keyboard.press('Escape'); await page.waitForTimeout(300)

// 6. Missing topic: graceful fallback.
await page.evaluate(() => { window.location.hash = '' })
await helpBtn.click(); await page.getByRole('menuitem', { name: 'About and versions' }).click()
await page.waitForSelector('[data-testid="help-about"]')
const about = await page.locator('[data-testid="help-about"]').textContent()
check('about', /SDK 1.[0-9]+.[0-9]+/.test(about) && /Not available yet/.test(about), 'About lists versions and modules without documentation')
await closeHelp()

// 7. Subscription: Requirements only hides SysML and CAD from the menu.
await page.getByRole('button', { name: /^Subscription:/ }).click()
await page.getByRole('button', { name: /Subscription \(demo\)/ }).click()
await page.getByRole('option', { name: /^Requirements only/ }).click()
await page.waitForTimeout(150)
await page.keyboard.press('Escape')
await page.waitForSelector('.ws-overlay', { state: 'detached', timeout: 3000 }).catch(() => {})
await page.waitForTimeout(700)
await helpBtn.click()
const limited = await page.getByRole('menuitem').allTextContents()
check('subscription', !limited.some((t) => /^SysML|^CAD/.test(t.trim())) && limited.some((t) => t.includes('Requirements')), `menu follows the subscription (${limited.filter((t) => /SysML|CAD|Requirements/.test(t)).join(', ')})`)
await page.keyboard.press('Escape')

// 8. Phone.
const phone = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage()
watch(phone)
await phone.goto(base); await phone.waitForSelector('.ws-app'); await phone.waitForTimeout(1500)
await phone.getByRole('button', { name: 'Help', exact: true }).click()
await phone.getByRole('menuitem', { name: 'Help Centre' }).click()
await phone.waitForSelector('[data-testid="help-centre"]'); await phone.waitForTimeout(700)
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
check('phone', !overflow, 'Help Centre fits a phone without horizontal scrolling')
await phone.screenshot({ path: `${shots}/help-4-phone.png` })

check('console', problems.length === 0, `no console errors ${problems.join(' | ')}`)
console.log(`${failures} failure(s)`)
await b.close()
process.exit(failures ? 1 : 0)
