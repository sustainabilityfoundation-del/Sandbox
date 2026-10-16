// Acceptance flow for the modular platform. Usage: node platform-flow.mjs [baseUrl]
import { env, launchOptions, shotsDir, exampleUrl, demoAssistantContext } from '../lib/env.mjs'
import { chromium } from 'playwright-core'

const base = env.base
const shots = shotsDir('platform')
const browser = await chromium.launch({ ...launchOptions })
let failures = 0
const check = (tag, cond, msg) => {
  console.log(`[${tag}] ${cond ? 'PASS' : 'FAIL'} ${msg}`)
  if (!cond) failures++
}

const context = await demoAssistantContext(browser, { viewport: { width: 1600, height: 1000 } })
const page = await context.newPage()
const problems = []
const watch = (p) => {
  p.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return
    const t = m.text()
    if (/React DevTools|\[vite\]|favicon|Simulated rendering failure|stopped working|The above error occurred|failed to render/.test(t)) return
    problems.push(`${m.type()}: ${t.slice(0, 200)}`)
  })
  p.on('pageerror', (e) => !/Simulated rendering failure/.test(e.message) && problems.push(`pageerror: ${e.message}`))
}
watch(page)

const shot = (name, p = page) => p.screenshot({ path: `${shots}/pf-${name}.png` })
// Tools are switched from the navigation rail (the top document tabs were removed, 16 October 2026).
const tab = (id) => page.locator(`[data-rail-tool="${id}"]`)
const LOCKED_RAIL = '[data-rail-tool][aria-label*="not in your subscription"]'
const tree = (id) => page.locator(`.ws-tree-item[data-object-id="${id}"]`).first()
// Requirements are identified by UUID (Requirements service); people see their key.
const REQ = { 'REQ-001': '5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001', 'REQ-003': '5b1c7e2a-0003-4e6a-9c1d-6f0a3d2b1003' }
const inspected = () => page.getAttribute('.ws-insp-object', 'data-inspected-id').catch(() => null)
const revision = async () => Number(await page.textContent('[data-testid="model-revision"]'))
const toast = () => page.locator('[role="alert"], [role="status"]').filter({ hasText: 'not included in your subscription' })
async function setPlan(name) {
  await page.getByRole('button', { name: /^Subscription:/ }).click()
  await page.getByRole('button', { name: /Subscription \(demo\)/ }).click()
  await page.getByRole('option', { name: new RegExp(`^${name}`) }).click()
  // The listbox closes first; an Escape sent while it is closing can be consumed, so repeat
  // until the subscription popover itself has gone.
  for (let i = 0; i < 5 && (await page.locator('.ws-overlay').count()) > 0; i++) {
    await page.waitForTimeout(200)
    await page.keyboard.press('Escape')
  }
  await page.waitForSelector('.ws-overlay', { state: 'detached', timeout: 3000 }).catch(() => {})
  await page.getByRole('button', { name: /^Subscription:/ }).waitFor({ timeout: 8000 })
  await page.waitForTimeout(300)
}
async function palette() {
  await page.keyboard.press('Control+k')
  await page.waitForSelector('.ws-launcher')
}
async function closePalette() {
  await page.keyboard.press('Escape')
  await page.waitForSelector('.ws-launcher', { state: 'detached', timeout: 3000 }).catch(() => {})
}

// ---- Upgrade of data saved by version 0.1 (non-destructive) ----------------------------
{
  const tag = 'upgrade'
  await page.goto(exampleUrl())
  await page.waitForSelector('.ws-app')
  await page.evaluate(async (repoFs) => {
    localStorage.clear()
    const fixture = await import(`/workspace/@fs/${repoFs}/packages/model-service/src/repository/__fixtures__/legacySeedV2.ts`)
    localStorage.setItem(
      'ews.demo-repository.v2',
      JSON.stringify({ schema: 1, model: fixture.legacyModelV2(), outputs: fixture.legacyOutputsV2(), activity: fixture.legacyActivityV2() }),
    )
  }, env.repoFs)
  const legacyRaw = await page.evaluate(() => localStorage.getItem('ews.demo-repository.v2'))
  await page.goto(exampleUrl())
  await page.waitForSelector('.ws-app')
  await page.waitForTimeout(500)
  check(tag, (await revision()) === 7, `legacy data loads and gains one upgrade revision (rev ${await revision()})`)
  check(tag, (await page.locator('.ws-tree-group', { hasText: 'Retired tool data' }).count()) === 1, 'retired Verification procedures are kept and listed read-only')
  check(tag, (await tree('SYS-003').count()) === 1 && (await tree('CAD-120').count()) === 1, 'SysML and CAD representations were added for existing components')
  check(tag, (await page.locator('.ws-activity-row', { hasText: 'Platform upgrade' }).count()) === 1, 'Activity records the upgrade')
  await tree('ROD-120').click()
  await page.waitForTimeout(200)
  const insp = await page.locator('.ws-inspector-body').textContent()
  check(tag, /Analysis \(retired\)/.test(insp) && insp.includes('OUT-0003'), 'artifacts saved by the retired Analysis tool remain visible')
  check(tag, (await page.evaluate(() => localStorage.getItem('ews.demo-repository.v2'))) === legacyRaw, 'the version 0.1 storage entry is untouched')
  await shot('0-upgraded')
  // Start the remaining checks from the fresh sample.
  await page.evaluate(() => localStorage.clear())
  await page.goto(exampleUrl())
  await page.waitForSelector('.ws-app')
  await page.waitForTimeout(400)
}

// ---- 9. Catalogue: Analysis and Verification are gone ----------------------------------
{
  const tag = 'catalogue'
  const tabs = await page.locator('[data-rail-tool]').evaluateAll((els) => els.map((e) => e.getAttribute('data-rail-tool')))
  check(tag, ['requirements', 'sysml', 'cad', 'conceptualize'].every((id) => tabs.includes(id)) && tabs.every((id) => !/analysis|verification/.test(id)), `rail entries: ${tabs.join(', ')}`)
  check(tag, (await page.locator('[role="tab"][data-tool-id]').count()) === 0, 'there is no second (top) tab strip')
  await palette()
  const text = await page.locator('.ws-launcher').textContent()
  check(tag, !/\bAnalysis\b/.test(text) && !/\bVerification\b/.test(text), 'palette lists no Analysis or Verification tool')
  await closePalette()
}

// ---- 1. Requirements only ---------------------------------------------------------------
{
  const tag = 'req-only'
  await setPlan('Requirements only')
  check(tag, (await page.getByRole('button', { name: /^Subscription:/ }).textContent()).includes('Requirements only'), 'header shows the plan')
  // Navigation: tabs stay but explain.
  await tab('cad').click()
  await page.waitForTimeout(250)
  check(tag, (await toast().count()) > 0, 'choosing CAD in the rail explains why it is locked instead of opening it')
  check(tag, (await page.locator('.cad-canvas').count()) === 0, 'the CAD view is not rendered')
  for (const id of ['sysml', 'cad', 'conceptualize']) {
    check(tag, (await page.locator(`[data-rail-tool="${id}"][aria-label*="not in your subscription"]`).count()) === 1, `the ${id} rail entry says it is not in the subscription`)
  }
  await shot('1-locked-tab')
  await tab('requirements').click()
  // Palette: locked items are listed, disabled and explained.
  await palette()
  await page.keyboard.type('CAD')
  await page.waitForTimeout(150)
  const cadItem = page.locator('[role="menuitem"]', { hasText: 'Locked: not in your subscription' }).first()
  check(tag, (await cadItem.getAttribute('aria-disabled')) === 'true', 'palette shows CAD locked and disabled, with the reason')
  await shot('1-palette-locked')
  await closePalette()
  // Search: choosing a locked tool explains instead of opening.
  await page.getByRole('combobox', { name: 'Search objects, outputs and tools' }).fill('sysml')
  await page.waitForTimeout(250)
  await page.getByRole('option', { name: /SysML/ }).first().click()
  await page.waitForTimeout(300)
  check(tag, (await page.locator('[data-rail-tool][aria-current="page"]').getAttribute('data-rail-tool')) === 'requirements', 'search does not open SysML')
  check(tag, (await toast().count()) > 0, 'a notification explains why')
  // Direct route.
  await page.goto(exampleUrl(`tool=cad`))
  await page.waitForSelector('.ws-app')
  await page.waitForTimeout(600)
  check(tag, (await page.locator('[data-rail-tool][aria-current="page"]').getAttribute('data-rail-tool')) !== 'cad', 'direct route ?tool=cad does not open CAD')
  check(tag, (await toast().count()) > 0, 'the direct route explains why')
  // Detached window for a locked tool.
  const detached = await context.newPage()
  watch(detached)
  await detached.goto(exampleUrl(`window=wtest1&kind=tool&tool=sysml`))
  await detached.waitForSelector('.ws-detached')
  await detached.waitForTimeout(400)
  check(tag, (await detached.locator('[data-locked-tool="sysml"]').count()) === 1 && (await detached.locator('.sysml-canvas').count()) === 0, 'a detached SysML window shows the locked explanation')
  await detached.close()
  // ChatGPT cannot reach CAD.
  await page.click('[data-dock-tab="assistant"]')
  await page.waitForSelector('.as-input textarea')
  const before = await revision()
  await page.fill('.as-input textarea', 'Change the rod diameter to 30 mm.')
  await page.press('.as-input textarea', 'Enter')
  await page.waitForFunction(() => [...document.querySelectorAll('.as-assistant .as-text')].some((e) => e.textContent.includes('subscription')), null, { timeout: 15000 })
  check(tag, (await revision()) === before && (await page.locator('[data-proposal-id]').count()) === 0, 'ChatGPT explains instead of preparing a CAD change')
  // Requirements still works.
  await tab('requirements').click()
  check(tag, (await page.locator('.req-table').count()) === 1, 'Requirements opens')
}

// ---- 2. All tools -----------------------------------------------------------------------
{
  const tag = 'all-tools'
  await setPlan('All tools'); await page.waitForTimeout(500)
  for (const id of ['requirements', 'sysml', 'cad']) {
    await tab(id).click()
    await page.waitForTimeout(400)
    const ok = await page.locator(`.ws-tool-host[data-tool="${id}"]`).count()
    check(tag, ok === 1 && (await page.locator(`[data-locked-tool="${id}"]`).count()) === 0, `${id} opens`)
  }
  check(tag, (await page.locator(LOCKED_RAIL).count()) === 0, 'no tab shows a lock')
}

// ---- 3. Selecting the rod in CAD and switching tools ---------------------------------------
{
  const tag = 'shared-context'
  await tab('cad').click()
  await page.waitForSelector('.cad-part[data-object-id="ROD-120"]')
  await page.locator('.cad-part[data-object-id="ROD-120"]').click()
  await page.waitForTimeout(250)
  check(tag, (await inspected()) === 'ROD-120', 'clicking the rod in CAD selects ROD-120')
  await tab('requirements').click()
  await page.waitForTimeout(500)
  await page.waitForSelector('.req-table [data-req-key]', { timeout: 15000 }).catch(() => {})
  const rows = await page.locator('.req-table [role="row"][data-req-key]').evaluateAll((els) => els.map((e) => e.getAttribute('data-req-key')))
  // Allocation comes from the Requirements service seed: REQ-001 and REQ-004 are allocated to the rod.
  check(tag, JSON.stringify(rows) === '["REQ-001","REQ-004"]', `Requirements shows the rod's allocated requirements (${rows.join(', ')})`)
  await tab('sysml').click()
  await page.waitForTimeout(500)
  check(tag, (await page.locator('.sysml-node[data-object-id="SYS-003"]').getAttribute('aria-pressed')) === 'true', 'SysML highlights the rod part SYS-003')
  check(tag, (await page.getAttribute('.sysml-props', 'data-inspected-id')) === 'SYS-003', 'the SysML property inspector shows SYS-003')
  check(tag, (await inspected()) === 'ROD-120', 'the shared selection is still ROD-120')
  await shot('3-sysml-rod')
  // A component without a SysML representation keeps the selection and explains.
  await tree(REQ['REQ-003']).click()
  await page.waitForTimeout(300)
  check(tag, (await page.locator('.sysml-notices', { hasText: 'not referenced' }).count()) === 1 && (await inspected()) === REQ['REQ-003'], 'an unrepresented selection is kept and explained')
}

// ---- 4. A requirement edit appears in other views ----------------------------------------
{
  const tag = 'requirement-edit'
  await tab('requirements').click()
  await page.getByRole('button', { name: 'Filter' }).first().click().catch(() => {})
  await page.waitForTimeout(200)
  const row = page.locator('.req-table [role="row"][data-req-key="REQ-001"]')
  await row.click()
  await page.keyboard.press('Enter')
  await page.waitForSelector('.req-detail h3:has-text("REQ-001")')
  const statement = page.getByLabel('Statement (normative text)')
  const stamp = Date.now() % 100000
  await statement.fill(`The actuator shall withstand 13 kN in the maximum-load scenario (edited in Requirements ${stamp}).`)
  await page.getByLabel('Reason for this change').fill('Platform flow edit')
  await page.getByRole('button', { name: 'Save revision' }).click()
  await page.waitForTimeout(1500)
  check(tag, (await page.locator('.req-detail [role="alert"]').count()) === 0, 'saved as a new requirement revision in the Requirements service')
  await tab('sysml').click()
  await page.waitForTimeout(300)
  await page.locator('[data-toolbar-id="text"]').first().click()
  await page.waitForTimeout(200)
  check(tag, (await page.locator('.sysml-text pre').textContent()).includes(`edited in Requirements ${stamp}`), 'the SysML text view shows the edited statement (canonical text, refreshed by the change event)')
  await page.locator('[data-toolbar-id="text"]').first().click()
  await tree(REQ['REQ-001']).click()
  await page.waitForTimeout(200)
  check(tag, (await page.locator('.ws-insp-statement').textContent()).includes(`edited in Requirements ${stamp}`), 'the inspector shows the edit')
  check(tag, (await tree(REQ['REQ-001']).textContent()).includes('REQ-001'), 'the product tree shows the key, not the UUID')
}

// ---- 5. A CAD dimension edit persists and is recorded --------------------------------------
{
  const tag = 'cad-dimension'
  await tab('cad').click()
  await page.waitForSelector('.cad-part[data-object-id="ROD-120"]')
  await page.locator('.cad-part[data-object-id="ROD-120"]').click()
  await page.locator('.ws-pane-main [data-toolbar-id="dimensions"]').first().click()
  await page.waitForSelector('.cad-panel')
  const diameter = page.locator('.cad-panel').getByLabel('Diameter')
  await diameter.fill('31')
  check(tag, (await page.locator('.cad-panel').textContent()).includes('Also updates ROD-120 diameter'), 'the panel states the explicit mapping')
  await page.locator('.cad-panel').getByRole('button', { name: 'Apply' }).click()
  await page.waitForTimeout(900)
  await shot('5-cad-dimension')
  check(tag, (await page.locator('.ws-activity-row', { hasText: 'CAD dimension edit on CAD-120' }).count()) >= 1, 'Activity records the dimension edit')
  await page.locator('.cad-panel').getByRole('button', { name: 'Save snapshot' }).click()
  await page.waitForTimeout(900)
  check(tag, (await page.locator('.cad-artifacts li').count()) >= 1, 'a representation artifact is saved against the rod')
  await page.reload()
  await page.waitForSelector('.ws-app')
  await page.waitForTimeout(600)
  await tree('CAD-120').click()
  await page.waitForTimeout(200)
  const props = await page.locator('.ws-inspector-body').textContent()
  check(tag, props.includes('31 mm'), 'the dimension persists after reload')
  await tree('ROD-120').click()
  await page.waitForTimeout(200)
  check(tag, (await page.locator('.ws-inspector-body').textContent()).includes('31 mm'), 'the mapped component property changed too')
}

// ---- 7. Detached windows retain context and follow entitlement changes ----------------------
{
  const tag = 'detached'
  await tab('cad').click()
  await page.waitForTimeout(300)
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.ws-pane-main .ws-view-controls').getByRole('button', { name: 'Open in separate window' }).click(),
  ])
  watch(popup)
  await popup.waitForSelector('.ws-detached')
  await popup.waitForSelector('.cad-part[data-object-id="ROD-120"]')
  check(tag, (await popup.locator('.cad-part[data-object-id="ROD-120"]').getAttribute('aria-pressed')) === 'true', 'the detached CAD window shows the selected rod')
  await setPlan('Requirements only')
  await popup.waitForSelector('[data-locked-tool="cad"]', { timeout: 4000 }).catch(() => {})
  check(tag, (await popup.locator('[data-locked-tool="cad"]').count()) === 1, 'the detached window locks when the subscription loses CAD')
  await shot('7-detached-locked', popup)
  await setPlan('All tools')
  await popup.waitForSelector('.cad-canvas', { timeout: 4000 }).catch(() => {})
  check(tag, (await popup.locator('.cad-canvas').count()) === 1, 'and returns when access is restored, with nothing lost')
  await popup.close()
}

// ---- 8. A tool rendering failure is contained ------------------------------------------------
{
  const tag = 'failure'
  await tab('sysml').click()
  await page.waitForTimeout(300)
  await palette()
  await page.keyboard.type('Simulate')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-tool-error="sysml"]', { timeout: 4000 }).catch(() => {})
  check(tag, (await page.locator('[data-tool-error="sysml"]').count()) === 1, 'the SysML view shows an error notice')
  await shot('8-failure')
  await tree('HSG-110').click()
  await page.waitForTimeout(200)
  check(tag, (await inspected()) === 'HSG-110', 'the tree and inspector keep working')
  await tab('requirements').click()
  await page.waitForTimeout(300)
  await page.waitForSelector('.req-table', { timeout: 10000 }).catch(() => {})
  check(tag, (await page.locator('.req-table').count()) === 1, 'other tools keep working')
  await tab('sysml').click()
  await page.getByRole('button', { name: 'Reload tool' }).click()
  await page.waitForTimeout(400)
  check(tag, (await page.locator('.sysml-canvas').count()) === 1, 'Reload tool restores the view')
}

// ---- 10. One icon system --------------------------------------------------------------------
{
  const tag = 'icons'
  const stray = await page.evaluate(() =>
    [...document.querySelectorAll('.ws-header svg, .ws-pane-bar svg, .ws-rail svg, .ws-toolbar svg, .ws-tree svg, .ws-inspector svg, .ws-dock svg, .ws-mobile-nav svg')]
      // AppIcon marks every registry icon (Lucide or custom glyph) with data-icon="<semantic name>".
      .filter((s) => !s.hasAttribute('data-icon')).length,
  )
  check(tag, stray === 0, `every interface icon in the shell is from the shared icon registry (${stray} other)`)
  const unlabeled = await page.evaluate(() =>
    [...document.querySelectorAll('button')].filter((b) => b.offsetParent && !b.textContent.trim() && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby')).length,
  )
  check(tag, unlabeled === 0, `icon-only buttons have accessible names (${unlabeled} without)`)
}

check('console', problems.length === 0, `no console errors (${problems.slice(0, 4).join(' || ')})`)
await browser.close()
console.log(`\n${failures} failure(s)`)
process.exit(failures ? 1 : 0)
