// CAD persistence in the workspace with the backend (contract C4 and related):
// - save, open and revisions in the CAD service;
// - a concurrent save refused (SSE notice) and the local change kept in a file;
// - fillet on stable edge names, edge picking, a sketch on a face, a datum plane, regeneration in the
//   kernel worker;
// - an assistant fillet and save with provenance;
// - opening revision 1, then the deep link ?tool=cad-modeler&document=<uuid>&revision=1;
// - the measurement-units setting.
// Run against `npm run dev` (workspace in API mode). It writes CAD documents to PRJ-ACT100 of the
// development database, and sets and then resets one user setting of the dev user.
import { env, launchOptions, shotsDir, exampleUrl, demoAssistantContext } from '../lib/env.mjs'
import { chromium } from 'playwright-core'
const base = env.base
const api = `${env.api}/api/cad/v1/projects/PRJ-ACT100/documents`
const devUser = process.env.E2E_DEV_USER ?? 'eli'
const shots = shotsDir('cad-modeler-persistence')
const browser = await chromium.launch({ ...launchOptions, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await (await demoAssistantContext(browser, { viewport: { width: 1600, height: 1000 } })).newPage()
const problems = []
page.on('console', (m) => m.type() === 'error' && !/favicon|404|status of 409|ERR_CONNECTION_REFUSED|Failed to fetch/.test(m.text()) && problems.push(m.text()))
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
const toast = (re) => page.getByText(re).first().waitFor({ timeout: 30000 })
const shot = (n) => page.screenshot({ path: `${shots}/${n}.png`, timeout: 60000 }).catch(() => undefined)
async function volume() {
  await page.getByRole('tab', { name: 'Model', exact: true }).click()
  const t = await page.locator('.cadm-tree-button:has-text("mm³")').first().textContent()
  return Number(/([\d.]+) mm³/.exec(t ?? '')?.[1])
}
async function ask(text) {
  await page.fill('.as-input textarea, .as-input input', text)
  await page.press('.as-input textarea, .as-input input', 'Enter')
  await page.waitForFunction(() => {
    const msgs = [...document.querySelectorAll('.as-assistant')]
    const last = msgs[msgs.length - 1]
    return last && !last.querySelector('.as-thinking') && (last.querySelector('.as-text') || last.querySelector('.as-note'))
  }, null, { timeout: 60000 })
  return page.locator('.as-assistant').last()
}

const before = new Set((await (await fetch(api, { headers: { 'X-Dev-User': devUser } })).json()).map((d) => d.id))
await page.goto(exampleUrl())
await page.evaluate(() => localStorage.clear())
await page.goto(exampleUrl())
await page.waitForSelector('.ws-app')
await page.waitForTimeout(1500)
await page.keyboard.press('Control+k')
await page.waitForSelector('.ws-launcher')
await page.keyboard.type('CAD')
await page.keyboard.press('Enter')
await page.getByRole('button', { name: 'Open from project' }).waitFor({ timeout: 30000 })
check(true, 'API mode: the start page offers Open from project')

// Example part, then Save → revision 1 in the service.
await page.getByRole('button', { name: 'Example: plate with hole' }).click()
// The first regeneration loads the OCCT WASM in the worker (slow on a cold dev server).
await page.getByText('30869 mm³').first().waitFor({ timeout: 120000 })
await btn('Save').click()
await toast(/Saved revision 1/)
check((await page.getByText('Revision 1', { exact: true }).count()) >= 1, 'Save stores revision 1 (header badge)')
const listed = (await (await fetch(api, { headers: { 'X-Dev-User': devUser } })).json()).filter((d) => !before.has(d.id))
check(listed.length === 1 && listed[0].revision === 1, `the service lists the document (${listed.map((d) => `${d.title} r${d.revision}`).join(', ')})`)
const docId = listed[0]?.id

// Fillet the four top outer edges by name.
await tool('Fillet')
await page.getByRole('textbox', { name: 'Filter edges', exact: true }).fill('cap-end')
const top = page.locator('.cadm-edge-list label').filter({ hasText: '/side:ln-' }).filter({ hasText: 'cap-end' })
const n = await top.count()
for (let i = 0; i < n; i++) await top.nth(i).click()
check(n === 4, `the edge list offers the 4 top outer edges by stable name (${n})`)
await page.getByRole('textbox', { name: 'Radius', exact: true }).fill('2')
await btn('Preview').click()
await page.getByText(/Preview \(not applied\)/).waitFor({ timeout: 30000 })
await btn('Create').click()
await page.waitForTimeout(1500)
const afterFillet = await volume()
check(30869 - afterFillet > 150 && 30869 - afterFillet < 260, `fillet applied: volume ${afterFillet} mm³ (removed ${(30869 - afterFillet).toFixed(1)}, analytic (1-π/4)·r²·L)`)
check((await page.locator('.cadm-tree-item:has-text("Fillet 1")').locator('text=OK').count()) === 1, 'Fillet 1 regenerates OK')
await shot('1-fillet')

// Edge picking: scan the view until an edge is picked (Inspect shows "Edge").
const box = await page.locator('.cadm-viewport-host').boundingBox()
let picked = false
for (let k = 0; k < 120 && !picked; k++) {
  const x = box.x + box.width * (0.25 + 0.5 * ((k * 37) % 100) / 100)
  const y = box.y + box.height * (0.25 + 0.5 * ((k * 61) % 100) / 100)
  await page.mouse.click(x, y)
  picked = (await page.locator('h3:text-is("Edge")').count()) > 0
}
check(picked, 'clicking an edge in the 3D view selects it (Inspect: Edge with stable name)')

// Sketch on the top face; boss joined; datum plane.
await tool('Sketch')
const planeSelect = page.getByRole('button', { name: /Plane/ }).first()
await planeSelect.click()
await page.getByRole('option', { name: /\/cap-end$/ }).click()
await btn('Create sketch').click()
await page.getByText('Add geometry').waitFor()
await page.locator('.cadm-side').getByRole('radio', { name: 'Circle' }).click().catch(async () => page.getByText('Circle', { exact: true }).first().click())
await page.getByRole('textbox', { name: 'Centre x', exact: true }).fill('60')
await page.getByRole('textbox', { name: 'Centre y', exact: true }).fill('20')
await page.getByRole('textbox', { name: 'Diameter', exact: true }).fill('8')
await btn('Add circle').click()
await page.waitForTimeout(800)
await btn('Extrude this sketch').click()
await page.getByRole('textbox', { name: 'Distance', exact: true }).fill('5')
await btn('Create').click()
await page.waitForTimeout(2000)
const boss = await volume()
check(Math.abs(boss - (afterFillet + Math.PI * 16 * 5)) < 0.2, `boss on the top face joined (+${(boss - afterFillet).toFixed(1)} mm³)`)
await tool('Datum plane')
await page.getByRole('textbox', { name: 'Offset along the normal', exact: true }).fill('40')
await btn('Create').click()
await page.waitForTimeout(800)
await page.getByRole('tab', { name: 'Model', exact: true }).click()
check((await page.locator('.cadm-tree-item:has-text("Datum plane 1")').locator('text=OK').count()) === 1, 'datum plane created and regenerated')
await page.getByRole('tab', { name: 'Diagnostics', exact: true }).click()
check((await page.getByText(/the kernel worker \(sketch solving and geometry off the UI thread\)/).count()) === 1, 'Diagnostics: regeneration runs in the kernel worker')
await shot('2-face-sketch')

// Save → revision 2; someone else saves revision 3; our next save is refused; notice offered.
await btn('Save').click()
await toast(/Saved revision 2/)
const current = await (await fetch(`${api}/${docId}`, { headers: { 'X-Dev-User': 'nia' } })).json()
const other = { ...current.document, metadata: { ...current.document.metadata, title: 'Edited by Nia' } }
const put = await fetch(`${api}/${docId}`, { method: 'PUT', headers: { 'X-Dev-User': 'nia', 'Content-Type': 'application/json', 'If-Match': '"2"' }, body: JSON.stringify({ document: other, message: 'renamed' }) })
check(put.status === 200, 'another user saves revision 3 through the API')
await page.getByText(/Revision 3 was saved by someone else/).waitFor({ timeout: 20000 }).then(() => check(true, 'the view is notified (SSE) that revision 3 exists'), () => check(false, 'the view is notified (SSE) that revision 3 exists'))
await page.getByRole('tab', { name: 'Model', exact: true }).click()
await page.getByRole('textbox', { name: /Expression of width/ }).fill('90')
await page.getByRole('textbox', { name: /Expression of width/ }).press('Enter')
await page.waitForTimeout(1200)
await btn('Save').click()
await toast(/saved by someone else/)
check(true, 'saving over a newer revision is refused (nothing overwritten)')
const revs = await (await fetch(`${api}/${docId}/revisions`, { headers: { 'X-Dev-User': devUser } })).json()
check(revs.length === 3 && revs[0].actor === 'nia' && revs[1].actor === devUser, `revisions in the service: ${revs.map((r) => `${r.revision}:${r.actor}`).join(' ')}`)
await shot('3-conflict')

// Keep the local change in a file, open the latest revision, assistant fillets and saves.
const [download] = await Promise.all([page.waitForEvent('download'), btn('Save file').click()])
check(/\.ewscad$/.test(download.suggestedFilename()), `Save file keeps the local change (${download.suggestedFilename()})`)
await page.getByRole('button', { name: 'Open the latest revision' }).click()
await page.getByText('Edited by Nia').first().waitFor({ timeout: 30000 })
check(true, 'opened the latest revision (title from the other user)')
await page.click('[data-dock-tab="assistant"]')
await page.waitForSelector('.as-root')
const r1 = await ask('Fillet the vertical edges of the CAD part with 3 mm')
const card = r1.locator('.as-card')
await card.waitFor({ timeout: 60000 })
check(((await card.textContent()) ?? '').includes('fillet_edges'), 'assistant proposes fillet_edges with stable edge names')
await card.locator('button:has-text("Apply")').click()
await card.locator(':text("Applied")').first().waitFor({ timeout: 60000 })
const r2 = await ask('Save the CAD document "rounded corners"')
const card2 = r2.locator('.as-card')
await card2.waitFor({ timeout: 60000 })
await card2.locator('button:has-text("Apply")').click()
await card2.locator(':text("Applied")').first().waitFor({ timeout: 60000 })
const revs2 = await (await fetch(`${api}/${docId}/revisions`, { headers: { 'X-Dev-User': devUser } })).json()
check(revs2[0].revision === 4 && revs2[0].source.sourceKind === 'assistant' && !!revs2[0].source.proposalId && revs2[0].message === 'rounded corners', `assistant save recorded with provenance (${JSON.stringify(revs2[0].source)})`)

// Open revision 1 from the project dialog.
await btn('Open').click()
await page.getByRole('dialog').waitFor()
await page.getByRole('dialog').getByRole('button', { name: /Revision/ }).click()
await page.getByRole('option', { name: /^Revision 1/ }).click()
await page.getByRole('dialog').getByRole('button', { name: 'Open', exact: true }).click()
await page.getByText('30869 mm³').first().waitFor({ timeout: 60000 }).then(() => check(true, 'Open → revision 1 regenerates the original example (30869 mm³)'), () => check(false, 'Open → revision 1'))
await shot('4-open-rev1')

// Deep link into revision 1 in a fresh page load (C5 navigable artifacts).
await page.goto(exampleUrl(`tool=cad-modeler&document=${docId}&revision=1`))
await page.waitForSelector('.ws-app')
await page.getByText('30869 mm³').first().waitFor({ timeout: 90000 }).then(() => check(true, 'deep link ?tool=cad-modeler&document=…&revision=1 opens revision 1'), () => check(false, 'deep link opens revision 1'))
check(!/document=/.test(page.url()), 'the deep link parameters are removed from the address bar')

// Measurement units (SDK 1.6 setting, display only): cm, then back to the default.
const settings = `${env.api}/api/settings/v1`
async function setUnits(value) {
  const cur = await (await fetch(`${settings}/values?projectId=PRJ-ACT100`, { headers: { 'X-Dev-User': devUser } })).json()
  const r = await fetch(`${settings}/users/me/values?projectId=PRJ-ACT100`, { method: 'PUT', headers: { 'X-Dev-User': devUser, 'Content-Type': 'application/json', 'If-Match': cur.user.etag }, body: JSON.stringify({ values: { 'cad-modeler.units.measurements': value } }) })
  return r.status
}
check((await setUnits('cm')) === 200, 'the settings service accepts the CAD units setting')
await page.goto(exampleUrl(`tool=cad-modeler&document=${docId}&revision=1`))
await page.waitForSelector('.ws-app')
await page.getByText('30.9 cm³').first().waitFor({ timeout: 90000 }).then(() => check(true, 'measured volume shown in cm³ (30869 mm³ = 30.9 cm³)'), () => check(false, 'volume shown in cm³'))
await shot('5-units-cm')
check((await setUnits(null)) === 200, 'units setting reset to the default')

check(problems.length === 0, `no console errors ${problems.slice(0, 3).join(' | ')}`)
console.log(failures ? `${failures} FAILED` : 'ALL PASSED')
await browser.close()
process.exit(failures ? 1 : 0)
