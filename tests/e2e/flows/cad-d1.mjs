// CAD Modeler D1 building blocks in the workspace UI: a regular polygon (fully constrained) on a face, a
// pocket cut, and a linear pattern of it; the volume matches the analytic value. Fixture: the built-in
// example plate (no product data). Run against `npm run dev` in API or demo mode.
import { env, launchOptions, shotsDir, exampleUrl } from '../lib/env.mjs'
import { chromium } from 'playwright-core'
const base = env.base
const shots = shotsDir('cad-d1')
const browser = await chromium.launch({ ...launchOptions, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const problems = []
page.on('console', (m) => m.type() === 'error' && !/favicon|404|ERR_CONNECTION_REFUSED|Failed to fetch/.test(m.text()) && problems.push(m.text()))
page.on('pageerror', (e) => problems.push(e.message))
let failures = 0
const check = (c, msg) => {
  console.log(`${c ? 'PASS' : 'FAIL'} ${msg}`)
  if (!c) failures++
}
const btn = (name) => page.getByRole('button', { name, exact: true }).first()
async function tool(name) {
  const b = btn(name)
  if (await b.isVisible().catch(() => false)) return b.click()
  await page.getByRole('button', { name: 'More actions' }).first().click()
  await page.getByRole('menuitem', { name }).first().click()
}
async function choose(label, option) {
  await page.getByRole('button', { name: new RegExp(label) }).first().click()
  await page.getByRole('option', { name: option }).first().click()
}
async function volume() {
  await page.getByRole('tab', { name: 'Model', exact: true }).click()
  const t = await page.locator('.cadm-tree-button:has-text("mm³")').first().textContent()
  return Number(/([\d.]+) mm³/.exec(t ?? '')?.[1])
}
const fill = (label, value) => page.getByRole('textbox', { name: label, exact: true }).fill(value)

await page.goto(exampleUrl())
await page.evaluate(() => localStorage.clear())
await page.goto(exampleUrl())
await page.waitForSelector('.ws-app')
await page.keyboard.press('Control+k')
await page.waitForSelector('.ws-launcher')
await page.keyboard.type('CAD Modeler')
await page.keyboard.press('Enter')
await page.getByRole('button', { name: 'Example: plate with hole' }).click()
// The first regeneration loads the OCCT WASM in the worker.
await page.getByText('30869 mm³').first().waitFor({ timeout: 120000 })
const v0 = await volume()

// Hexagon (across flats 6, flats perpendicular to x) on the top face at model x 12, y 20 (face sketches use
// model coordinates on faces parallel to a standard plane).
await tool('Sketch')
await choose('Plane', /\/cap-end$/)
await btn('Create sketch').click()
await page.getByText('Add geometry').waitFor()
await page.getByRole('radio', { name: 'Polygon' }).click()
await fill('Centre x', '12')
await fill('Centre y', '20')
await fill('Sides', '6')
await fill('Across flats', '6')
await fill('Rotation', '30')
await btn('Add polygon').click()
await page.waitForTimeout(1000)
check((await page.getByText('Fully constrained, 0 DOF').count()) > 0, 'the polygon sketch is fully constrained (status badge: 0 DOF)')

// Pocket: cut 5 mm into the plate.
await btn('Extrude this sketch').click()
await fill('Distance', '5')
await choose('Direction', 'Reverse')
await choose('Operation', /^Cut/)
await btn('Create').click()
await page.waitForTimeout(2000)
const hexArea = (Math.sqrt(3) / 2) * 36
const v1 = await volume()
check(Math.abs(v0 - v1 - hexArea * 5) < 0.2, `hexagonal pocket cut (−${(v0 - v1).toFixed(1)} mm³, analytic ${(hexArea * 5).toFixed(1)})`)

// Linear pattern: 3 pockets, 8 mm apart along x.
await tool('Pattern')
await fill('Count', '3')
await fill('Spacing', '8')
await btn('Create').click()
await page.waitForTimeout(2500)
const v2 = await volume()
check(Math.abs(v0 - v2 - 3 * hexArea * 5) < 0.3, `linear pattern of 3 pockets (−${(v0 - v2).toFixed(1)} mm³, analytic ${(3 * hexArea * 5).toFixed(1)})`)
check((await page.locator('.cadm-tree-item:has-text("Linear pattern 1")').locator('text=OK').count()) === 1, 'Linear pattern 1 regenerates OK')
await page.screenshot({ path: `${shots}/pattern.png` }).catch(() => undefined)

check(problems.length === 0, `no console errors ${problems.slice(0, 3).join(' | ')}`)
console.log(failures ? `${failures} FAILED` : 'ALL PASSED')
await browser.close()
process.exit(failures ? 1 : 0)
