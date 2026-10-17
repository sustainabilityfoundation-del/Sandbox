// System Model in the real workspace on the real API + PostgreSQL: human workflow and AI workflow
// (demo assistant → service proposal → Apply → commit with provenance → explain → undo).
import { env, launchOptions, shotsDir, exampleUrl, demoAssistantContext } from '../lib/env.mjs'
import { chromium } from 'playwright-core'
const base = env.base
const API = `${env.api}/api/sysml/v1`
const P = `${API}/projects/a1c7e5d0-5153-4d4c-9a3e-000000000100`
const shots = shotsDir('sysml-modeler')
const browser = await chromium.launch({ ...launchOptions })
let failures = 0
const check = (cond, msg) => (console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`), cond || failures++)
const get = (path) => fetch(`${P}${path}`, { headers: { 'x-dev-user': 'eli' } }).then((r) => r.json())
const head = async () => (await get('/commits?limit=1'))[0]
const text = async () => (await get(`/commits/${(await head())['@id']}/text`)).text
const problems = []

const ctx = await demoAssistantContext(browser, { viewport: { width: 1600, height: 1000 } })
await ctx.addInitScript(() => localStorage.setItem('ews.services.v1', JSON.stringify({ requirementsMode: 'api', devUser: 'eli' })))
const page = await ctx.newPage()
page.on('pageerror', (e) => problems.push(e.message))
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && problems.push(m.text().slice(0, 300)))
await page.goto(exampleUrl(`tool=sysml-modeler`))
await page.waitForSelector('.smod-canvas', { timeout: 40000 })
await page.waitForTimeout(800)
check((await page.locator('.smod-statusbar', { hasText: 'API (PostgreSQL)' }).count()) === 1, 'workspace: System Model opened in API mode')
const start = await head()
check((await page.locator('.smod-statusbar', { hasText: `commit #${start.number}` }).count()) === 1, `status bar shows the API head (#${start.number})`)
await page.screenshot({ path: `${shots}/1-workspace.png` })

// ---- human workflow: edit a value through Properties -------------------------------------------
const row = (name) => page.locator('.smod-tree-row', { has: page.locator('.smod-tree-name', { hasText: new RegExp(`^${name}$`) }) }).first()
await row('ActuatorSystem').locator('.smod-twisty').click()
await row('Mechanical').locator('.smod-twisty').click()
await row('Rod').locator('.smod-twisty').click()
await row('stroke').click()
const stroke = 151 + (Date.now() % 40)
await page.getByLabel('Value', { exact: true }).fill(`${stroke} [mm]`)
await page.getByRole('button', { name: 'Save value' }).click()
await page.waitForTimeout(1200)
const afterEdit = await head()
check(afterEdit.number === start.number + 1 && afterEdit.actor === 'eli' && afterEdit.source.kind === 'user', `edit committed through the API as #${afterEdit.number} by eli (user)`)
check((await text()).includes(`attribute stroke : LengthValue = ${stroke} [mm];`), 'the API model has the new value')

// ---- requirements: link a SysML requirement usage to a managed requirement ----
await row('Requirements').locator('.smod-twisty').click()
await row('load').click()
await page.waitForTimeout(500)
const unlink = page.getByRole('button', { name: 'Unlink' })
if (await unlink.count()) { await unlink.click(); await page.waitForTimeout(1200) }
const combo = page.getByRole('combobox', { name: 'Link a managed requirement' })
await combo.fill('REQ-001')
await page.waitForTimeout(500)
await page.keyboard.press('ArrowDown')
await page.keyboard.press('Enter')
await page.waitForTimeout(1500)
check((await page.locator('.smod-req', { hasText: 'REQ-001' }).count()) === 1, 'requirements: REQ-001 linked; canonical text shown from Requirements')
check(/requirementId = "[0-9a-f-]{36}";/.test(await text()), 'requirements: the model stores the UUID (ManagedRequirement metadata), not the text')
await page.screenshot({ path: `${shots}/1b-requirement-link.png` })

// ---- bring managed requirements into the System Model (AUD-5): Matrix dialog, idempotent ----------
const bridgeTitle = `Bridge test ${Date.now().toString(36)}`
const createdReq = await fetch(`${env.api}/api/requirements/v1/projects/PRJ-ACT100/requirements`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-user': 'eli', 'idempotency-key': `aud5-${Date.now()}` }, body: JSON.stringify({ title: bridgeTitle, statement: 'The System Model shall show this requirement once it is brought in.', type: 'functional' }) })
check(createdReq.ok, 'AUD-5: a new managed requirement exists in Requirements Management but not in the model')
// The Matrix tab can sit in the toolbar overflow ("More actions").
if (await page.getByRole('button', { name: 'Matrix', exact: true }).count()) await page.getByRole('button', { name: 'Matrix', exact: true }).first().click()
else {
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: /Matrix/ }).click()
}
await page.getByRole('button', { name: 'Bring in managed requirements' }).first().click()
const importList = page.locator('.smod-import-list li')
await importList.first().waitFor({ timeout: 15000 })
const importCount = await importList.count()
const inModel = importList.filter({ hasText: 'in the model' })
const notInModel = importList.filter({ hasText: bridgeTitle })
check((await inModel.count()) >= 1 && (await notInModel.count()) === 1, `AUD-5: the dialog lists ${importCount} managed requirements and marks those already in the model (${await inModel.count()})`)
const beforeImport = await head()
await inModel.first().locator('label').first().click()
await page.getByRole('button', { name: 'Bring into the model' }).click()
await page.waitForTimeout(1200)
check((await page.getByRole('dialog').getByText(/already in the model/).count()) > 0 && (await head()).number === beforeImport.number, 'AUD-5: bringing in a requirement that is already in the model changes nothing (idempotent, no second element)')
await inModel.first().locator('label').first().click()
const fresh = notInModel.first()
const freshLabel = (await fresh.locator('.smod-mono').first().textContent())?.trim()
await fresh.locator('label').first().click()
await page.getByRole('button', { name: 'Preview' }).click()
await page.waitForSelector('.smod-changes', { timeout: 15000 })
check((await head()).number === beforeImport.number, 'AUD-5: preview writes nothing')
await page.screenshot({ path: `${shots}/1c-import-dialog.png` })
await page.getByRole('button', { name: 'Bring into the model' }).click()
await page.waitForTimeout(1800)
const afterImport = await head()
const importedText = await text()
check(afterImport.number === beforeImport.number + 1 && importedText.includes(`requirementKey = "${freshLabel}";`) && importedText.split(`requirement <'${freshLabel}'>`).length === 2, `AUD-5: ${freshLabel} was brought into the model as one requirement with its key, revision and title (commit #${afterImport.number})`)
check((await page.locator('table[aria-label="satisfy matrix"] th', { hasText: freshLabel }).count()) === 1, `AUD-5: the matrix shows the stable ID ${freshLabel} as the row header`)
await page.screenshot({ path: `${shots}/1d-matrix-bridged.png` })
await page.getByRole('button', { name: 'Bring in managed requirements' }).first().click()
await importList.first().waitFor({ timeout: 15000 })
await importList.filter({ hasText: freshLabel }).first().locator('label').first().click()
await page.getByRole('button', { name: 'Bring into the model' }).click()
await page.waitForTimeout(1200)
check((await head()).number === afterImport.number, 'AUD-5: a second import of the same requirement writes nothing')
await page.keyboard.press('Escape')
await page.getByRole('button', { name: 'Cancel' }).click().catch(() => undefined)

// ---- AI workflow ----------------------------------------------------------------------------------
await page.click('[data-dock-tab="assistant"]')
await page.waitForSelector('.as-root')
await page.getByRole('button', { name: 'New conversation' }).click().catch(() => undefined)
async function ask(textIn) {
  const before = await page.locator('.as-assistant').count()
  await page.fill('.as-input textarea', textIn)
  await page.press('.as-input textarea', 'Enter')
  await page.waitForFunction((n) => document.querySelectorAll('.as-assistant').length > n, before, { timeout: 30000 })
  // Wait until the reply stops changing (the demo assistant streams its text).
  let last = ''
  for (let k = 0; k < 40; k++) {
    await page.waitForTimeout(500)
    const now = await page.locator('.as-assistant').last().textContent()
    if (now === last && !/thinking|Running/i.test(now)) break
    last = now
  }
  return page.locator('.as-assistant').last()
}
const r1 = await ask('What SysML commands can you use?')
check(/describe|commands/i.test(await r1.textContent()), 'AI: schema discovery answered')
await ask('What uses BrushlessMotor?')
check((await page.locator('.as-root', { hasText: 'LinearActuator' }).count()) > 0, 'AI: impact analysis lists LinearActuator')

const cardsBefore = await page.locator('.as-card[data-proposal-id]').count()
const beforeAsk = await head()
await ask('Add a part definition named Brake to ActuatorSystem::Mechanical')
await page.waitForFunction((n) => document.querySelectorAll('.as-card[data-proposal-id]').length > n, cardsBefore, { timeout: 20000 })
const card = page.locator('.as-card[data-proposal-id]').last()
const preview = await card.textContent()
check(preview.includes('ActuatorSystem::Mechanical::Brake'), 'AI: proposal previews the new element')
check((await head()).number === beforeAsk.number, 'AI: nothing written before Apply')
await page.screenshot({ path: `${shots}/2-proposal.png` })
await card.scrollIntoViewIfNeeded()
await card.locator('button:has-text("Apply")').click()
await page.waitForFunction(() => /Applied/.test([...document.querySelectorAll('.as-card[data-proposal-id]')].pop()?.textContent ?? ''), null, { timeout: 20000 })
const applied = await head()
const proposalId = await card.getAttribute('data-proposal-id')
check(applied.source.kind === 'assistant' && applied.source.proposalId === proposalId && applied.actor === 'eli', `AI: commit #${applied.number} records assistant provenance (${proposalId})`)
check((await text()).includes('part def Brake;'), 'AI: the API model contains Brake')
await page.waitForTimeout(1500)
check((await page.locator('.smod-tree-name', { hasText: /^Brake$/ }).count()) > 0, 'AI: the open view shows Brake (same session refreshed)')

const r3 = await ask('Explain the last SysML change')
const explained = await r3.textContent()
check(/Brake/.test(explained), 'AI: explains the last change')
await page.screenshot({ path: `${shots}/3-explain.png` })

const undoButton = card.locator('button:has-text("Undo")')
if (await undoButton.count()) {
  await undoButton.first().click()
  await page.waitForTimeout(1500)
  const confirm = page.getByRole('dialog').getByRole('button', { name: /Undo/ })
  if (await confirm.count()) await confirm.first().click()
  await page.waitForTimeout(1500)
  check(!(await text()).includes('part def Brake;') && (await head()).source.revertedCommitId === applied['@id'], 'AI: proposal undo reverted the commit (compensating commit)')
} else check(false, 'AI: proposal card offers Undo')

const cards2 = await page.locator('.as-card[data-proposal-id]').count()
await ask('Add a cooling subsystem')
await page.waitForFunction((n) => document.querySelectorAll('.as-card[data-proposal-id]').length > n, cards2, { timeout: 20000 })
const card2 = page.locator('.as-card[data-proposal-id]').last()
check((await card2.textContent()).includes('ActuatorSystem::Thermal'), 'AI: elaboration proposal (text) previews the Thermal package')
await card2.scrollIntoViewIfNeeded()
await card2.locator('button:has-text("Apply")').click()
await page.waitForFunction(() => /Applied/.test([...document.querySelectorAll('.as-card[data-proposal-id]')].pop()?.textContent ?? ''), null, { timeout: 20000 })
check((await text()).includes('package Thermal {'), 'AI: elaboration applied')
await page.screenshot({ path: `${shots}/4-elaboration.png` })

// ---- help discovered by the Help menu ----------------------------------------------------------
await page.keyboard.press('Escape')
const helpButton = page.getByRole('button', { name: /^Help/ }).first()
await helpButton.click()
await page.waitForTimeout(500)
check((await page.locator('text=System Model').count()) > 0, 'Help menu lists the System Model documentation')
await page.screenshot({ path: `${shots}/5-help.png` })
await page.keyboard.press('Escape')

// ---- devices and themes --------------------------------------------------------------------------
await page.click('[data-rail-tool="sysml-modeler"]').catch(() => undefined)
for (const [w, h, name] of [[1024, 768, 'tablet'], [390, 844, 'phone']]) {
  await page.setViewportSize({ width: w, height: h })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${shots}/6-${name}.png` })
}
await page.setViewportSize({ width: 1600, height: 1000 })
await page.emulateMedia({ colorScheme: 'dark' })
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
await page.waitForTimeout(800)
await page.screenshot({ path: `${shots}/7-dark.png` })

console.log(problems.length ? `Console problems:\n${problems.slice(0, 10).join('\n')}` : 'No console errors')
if (problems.length) failures++
await browser.close()
console.log(failures ? `${failures} FAILED` : 'ALL PASSED')
process.exit(failures ? 1 : 0)
