// Architecture vision Phase 1 flow: baseline, verification, stale evidence, compare, impact, about.
import { env, launchOptions, shotsDir, exampleUrl, demoAssistantContext } from '../lib/env.mjs'
import { chromium } from 'playwright-core'

const base = env.base
const shots = shotsDir('vision')
const browser = await chromium.launch({ ...launchOptions })
let failures = 0
const check = (tag, cond, msg) => {
  console.log(`[${tag}] ${cond ? 'PASS' : 'FAIL'} ${msg}`)
  if (!cond) failures++
}
const page = await (await demoAssistantContext(browser, { viewport: { width: 1600, height: 1000 } })).newPage()
const problems = []
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/DevTools|\[vite\]|favicon/.test(m.text()) && problems.push(m.text().slice(0, 200)))
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
const shot = (name) => page.screenshot({ path: `${shots}/vf-${name}.png` })
const tree = (id) => page.locator(`.ws-tree-item[data-object-id="${id}"]`).first()
const reqRow = (key) => page.locator(`.req-table [data-req-key="${key}"]`)
const REQ001 = '5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001'

await page.goto(exampleUrl())
await page.waitForSelector('.ws-app')
await page.evaluate(() => localStorage.clear())
await page.goto(exampleUrl(`tool=requirements`))
await page.waitForSelector('.req-table')
await page.waitForTimeout(300)

// About dialog labels capabilities honestly.
{
  await page.keyboard.press('Control+k')
  await page.waitForSelector('.ws-launcher')
  await page.keyboard.type('About this platform')
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-capability-status]')
  const planned = await page.locator('[data-capability-status="planned"]').count()
  const implemented = await page.locator('[data-capability-status="implemented"]').count()
  check('about', planned >= 10 && implemented >= 4, `capabilities labelled (implemented ${implemented}, planned ${planned})`)
  await shot('1-about')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
}

// Create a baseline from the header menu.
{
  await page.getByRole('button', { name: 'Baselines' }).click()
  await page.getByRole('menuitem', { name: /Create baseline/ }).click()
  await page.getByLabel('Name').fill('Design review 1')
  await page.getByRole('button', { name: 'Create baseline' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Baselines' }).click()
  check('baseline', (await page.getByRole('menuitem', { name: /Compare/ }).getAttribute('aria-disabled')) !== 'true' && /1 baseline/.test(await page.getByRole('menu').textContent()), 'baseline created; compare is enabled')
  await page.keyboard.press('Escape')
}

// Record a verification result for REQ-001 against the baseline.
{
  await page.getByRole('button', { name: 'Show all' }).click().catch(() => {})
  await page.waitForSelector('.req-table [data-req-key="REQ-001"]', { timeout: 15000 })
  check('verify', /Not verified/.test(await reqRow('REQ-001').textContent()), 'REQ-001 starts as Not verified')
  await reqRow('REQ-001').click()
  await page.keyboard.press('Enter')
  await page.waitForSelector('.req-detail h3:has-text("REQ-001")')
  await page.getByRole('tab', { name: 'Verification' }).click()
  await page.getByRole('button', { name: 'Record result' }).click()
  await page.getByRole('textbox', { name: /Procedure/ }).fill('TP-12 run 1')
  await page.getByRole('button', { name: /Baseline \(configured article\)/ }).click()
  await page.getByRole('option', { name: /BL-001/ }).click()
  await shot('2-record-form')
  await page.getByRole('button', { name: 'Record result' }).click()
  await page.waitForSelector('[data-record-id]')
  const rec = await page.locator('[data-record-id]').first().textContent()
  check('verify', /TP-12 run 1/.test(rec) && /baseline BL-001/.test(rec) && /REQ-001 rev \d+/.test(rec), `record pins revision and baseline: ${rec.replace(/\s+/g, ' ').slice(0, 140)}`)
  check('verify', /Verified/.test(await reqRow('REQ-001').textContent()), 'table shows Verified')
  await shot('3-verified')
}

// Edit the requirement: the record becomes stale.
{
  const stamp = `14 kN (run ${Date.now() % 100000})`
  await page.getByRole('tab', { name: 'Edit' }).click()
  await page.getByLabel('Statement (normative text)').fill(`The actuator shall deliver ${stamp}.`)
  await page.getByLabel('Reason for this change').fill('Vision flow edit')
  await page.getByRole('button', { name: 'Save revision' }).click()
  // The table refreshes from the service's change event; allow for a busy development database.
  const staleShown = await reqRow('REQ-001').filter({ hasText: 'Stale evidence' }).waitFor({ timeout: 10000 }).then(() => true, () => false)
  check('stale', staleShown, 'table shows Stale evidence after the edit')
  await page.getByRole('tab', { name: 'Verification' }).click()
  await page.waitForSelector('[data-record-id][data-stale]')
  await page.getByRole('button', { name: 'Show verified statement' }).click()
  await page.waitForSelector('.req-verified-text')
  const verified = await page.locator('.req-verified-text').textContent()
  check('stale', !verified.includes(stamp) && verified.length > 20, `verified statement shown from history: ${verified.slice(0, 90)}`)
  await shot('4-stale')
}

// Inspector change impact and history.
{
  await tree(REQ001).click()
  await page.waitForTimeout(300)
  const impact = await page.locator('[data-testid="change-impact"]').textContent().catch(() => '')
  check('impact', /OUT-\d+/.test(impact) && /BL-001/.test(impact), `change impact lists the record and baseline: ${impact.replace(/\s+/g, ' ').slice(0, 160)}`)
  const ownedBy = await page.locator('.ws-inspector').textContent()
  check('impact', /owned by/i.test(ownedBy), 'inspector shows the owning module')
  await page.locator('[data-testid="revision-history"]').waitFor({ timeout: 3000 }).catch(() => {})
  check('impact', /Requirements service/.test(await page.locator('[data-testid="revision-history"]').textContent().catch(() => '')), 'history points to the Requirements service, which owns it')
  await shot('5-inspector')
}

// Compare with the baseline.
{
  await page.getByRole('button', { name: 'Baselines' }).click()
  await page.getByRole('menuitem', { name: /Compare with a baseline/ }).click()
  await page.waitForSelector('[data-testid="baseline-compare"]')
  await page.waitForTimeout(300)
  check('compare', (await page.locator(`[data-testid="baseline-compare"] [data-changed-id="${REQ001}"]`).count()) === 1, 'comparison shows REQ-001 changed')
  await shot('6-compare')
  await page.keyboard.press('Escape')
}

check('console', problems.length === 0, `no console errors${problems.length ? ': ' + problems.join(' | ') : ''}`)
console.log(`\n${failures} failure(s)`)
await browser.close()
process.exit(failures ? 1 : 0)
