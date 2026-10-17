// CAD inside the workspace (port 5199): open the tool, AI workflow through the demo assistant
// (proposal card with kernel-predicted result → Apply → the view shows the body), then a human edit
// and an assistant follow-up that respects the version, help (F1 content), capability inventory.
import { env, launchOptions, shotsDir, exampleUrl, demoAssistantContext } from '../lib/env.mjs'
import { chromium } from 'playwright-core'
const base = env.base
const shots = shotsDir('cad-modeler')
const browser = await chromium.launch({ ...launchOptions, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await (await demoAssistantContext(browser, { viewport: { width: 1600, height: 1000 } })).newPage()
const problems = []
page.on('console', (m) => m.type() === 'error' && !/favicon|404|ERR_CONNECTION_REFUSED|\/api\/|Failed to fetch|503|502|500/.test(m.text()) && problems.push(m.text()))
page.on('pageerror', (e) => problems.push(e.message))
let failures = 0
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`)
  if (!cond) failures++
}
const lastReply = () => page.locator('.as-assistant').last()
async function ask(text) {
  await page.fill('.as-input textarea, .as-input input', text)
  await page.press('.as-input textarea, .as-input input', 'Enter')
  await page.waitForFunction(() => {
    const msgs = [...document.querySelectorAll('.as-assistant')]
    const last = msgs[msgs.length - 1]
    return last && !last.querySelector('.as-thinking') && (last.querySelector('.as-text') || last.querySelector('.as-note'))
  }, null, { timeout: 60000 })
  await page.waitForTimeout(300)
  return lastReply()
}

await page.goto(exampleUrl())
await page.evaluate(() => localStorage.clear())
await page.goto(exampleUrl())
await page.waitForSelector('.ws-app')
await page.waitForTimeout(1500)

// Open the CAD from the command palette.
await page.click('[data-rail-tool="cad-modeler"]')
await page.getByRole('button', { name: 'New part' }).waitFor({ timeout: 30000 })
check(true, 'CAD opens in the workspace (start page)')
await page.screenshot({ path: `${shots}/ws-01-start.png` })

// AI path: the demo assistant plans typed commands; the card shows the kernel prediction.
await page.click('[data-dock-tab="assistant"]')
await page.waitForSelector('.as-root')
const reply = await ask('Create a plate 80 x 40 x 10 with a 12 mm hole in the CAD modeler')
console.log('reply:', ((await reply.textContent()) ?? '').replace(/s+/g, ' ').slice(0, 600))
const card = reply.locator('.as-card')
await card.waitFor({ timeout: 5000 })
const cardText = (await card.textContent()) ?? ''
console.log('card:', cardText.replace(/\s+/g, ' ').slice(0, 400))
check(/Demo planner/.test((await reply.textContent()) ?? ''), 'reply is labelled as demo planning')
check(cardText.includes('create_parameter') && cardText.includes('extrude_profile'), 'card lists the typed commands')
check(cardText.includes('30869.03 mm³'), 'card shows the kernel-predicted volume before Apply')
check((await page.getByText('30869').count()) === 1, 'nothing applied yet (the view does not show the body)')
await page.screenshot({ path: `${shots}/ws-02-proposal.png` })
await card.locator('button:has-text("Apply")').click()
await card.locator(':text("Applied")').first().waitFor({ timeout: 60000 })
check(true, 'Apply runs the commands (proposal applied)')
await page.getByText('30869 mm³').first().waitFor({ timeout: 60000 })
check(true, 'the CAD view shows the applied body (30869 mm³)')
await page.waitForTimeout(1500)
await page.screenshot({ path: `${shots}/ws-03-applied.png` })

// Human edit, then an assistant change prepared on the new version.
await page.getByRole('textbox', { name: 'Expression of thickness' }).fill('20')
await page.getByRole('textbox', { name: 'Expression of thickness' }).press('Enter')
await page.getByText('61738.1 mm³').first().waitFor({ timeout: 60000 })
check(true, 'human parameter edit regenerates (thickness 20 → 61738.1 mm³)')
const r2 = await ask('Set width to 100')
const card2 = r2.locator('.as-card')
await card2.waitFor({ timeout: 60000 })
check(((await card2.textContent()) ?? '').includes('set_parameter'), 'assistant prepares set_parameter on the current version')
await card2.locator('button:has-text("Apply")').click()
await card2.locator(':text("Applied")').first().waitFor({ timeout: 60000 })
await page.getByText(`${Number((100 * 40 * 20 - Math.PI * 36 * 20).toFixed(1))} mm³`).first().waitFor({ timeout: 60000 }).then(() => check(true, 'assistant change applied and regenerated'), () => check(false, 'assistant change applied and regenerated'))
const r3 = await ask('Describe the CAD part')
check(((await r3.textContent()) ?? '').length > 0 && (await r3.locator(':text("Read CAD model")').count()) >= 0, 'describe request answered')
await page.screenshot({ path: `${shots}/ws-04-describe.png` })

// Operation log shows the assistant as source.
await page.getByRole('tab', { name: 'Diagnostics' }).click()
check((await page.locator('.cadm-log').getByText('assistant').count()) >= 2, 'operation log records assistant transactions')

// ---- Click-to-draw sketching (CAD sprint C1.1): closed profiles by clicks, taps and the keyboard ----------------------------
// The sketch area maps 1:1 from the viewBox, so a sketch point (x, y) is clicked at a computed pixel.
const svg = () => page.locator('svg.cadm-sketch')
const px = (x, y) => svg().evaluate((el, [sx, sy]) => {
  const [vx, vy, vw, vh] = el.getAttribute('viewBox').split(' ').map(Number)
  const r = el.getBoundingClientRect()
  const s = Math.min(r.width / vw, r.height / vh)
  return { x: r.left + (r.width - vw * s) / 2 + (sx - vx) * s, y: r.top + (r.height - vh * s) / 2 + (-sy - vy) * s }
}, [x, y])
const clickAt = async (x, y) => {
  const p = await px(x, y)
  await page.mouse.click(p.x, p.y)
}
const tool = (name) => page.locator('.cadm-draw-bar').getByRole('radio', { name, exact: true }).click()
const entityCount = () => svg().locator('.cadm-sk-entity').count()
const newSketch = async () => {
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await page.getByRole('button', { name: 'Create sketch' }).click()
  await svg().waitFor()
}
const editTab = async () => page.getByRole('tab', { name: 'Edit' }).click()

await newSketch()
check((await svg().getAttribute('data-draw-tool')) === null, 'click-to-draw: the drawing tools start in Select mode (entities stay selectable)')
await page.screenshot({ path: `${shots}/cd-01-sketch.png` })

// 1. Rectangle by two clicks: a closed profile, two degrees of freedom left (position), dimensions added.
await tool('Rectangle')
check((await svg().getAttribute('data-draw-tool')) === 'rectangle' && (await svg().getAttribute('data-grid-step')) === '2', 'click-to-draw: Rectangle tool shows the grid (2 mm step)')
await clickAt(10, 10)
await page.getByTestId('draw-hint').getByText(/opposite corner/).waitFor()
check(true, 'click-to-draw: the hint asks for the opposite corner after the first click')
await clickAt(50, 30)
await editTab()
await page.getByText(/Closed profile: 1 region\(s\), area 800/).waitFor({ timeout: 30000 })
check(true, 'click-to-draw: two clicks draw a closed 40 × 20 profile (area 800 mm²)')
await page.locator('.cadm-draw-bar').getByText(/Under-constrained, 2 DOF/).waitFor()
check(true, 'click-to-draw: the degrees of freedom are shown (Under-constrained, 2 DOF)')
check((await entityCount()) === 4, 'click-to-draw: four lines were drawn')
await page.screenshot({ path: `${shots}/cd-02-rectangle.png` })

// The profile extrudes: the typed commands are the ones the forms and the assistant use.
await page.getByRole('button', { name: 'Extrude this sketch' }).click()
await page.getByRole('button', { name: 'Create', exact: true }).click()
await page.getByRole('tab', { name: 'Model', exact: true }).click()
await page.getByText('8000 mm³').first().waitFor({ timeout: 60000 })
check(true, 'click-to-draw: the clicked profile extrudes into a solid (8000 mm³)')

// 2. A closed chain of lines: each segment starts where the last ended; clicking the first point closes it.
await newSketch()
await tool('Line')
for (const [x, y] of [[10, 10], [50, 10], [50, 30], [10, 30]]) {
  await clickAt(x, y)
  await page.waitForTimeout(250)
}
await page.getByTestId('draw-hint').getByText(/close the shape/).waitFor({ timeout: 30000 })
await clickAt(10, 10)
await editTab()
await page.getByText(/Closed profile: 1 region\(s\), area 800/).waitFor({ timeout: 30000 })
check(true, 'click-to-draw: a line chain closed on its first point makes a closed profile (area 800 mm²)')
check((await entityCount()) === 4, 'click-to-draw: four lines share four points (snapped to each other)')
await page.locator('.cadm-draw-bar').getByText(/Under-constrained, 4 DOF/).waitFor()
check(true, 'click-to-draw: horizontal and vertical lines were made exact (Under-constrained, 4 DOF)')
check((await page.getByTestId('draw-hint').textContent())?.includes('start of the line'), 'click-to-draw: the chain ended after closing (the hint asks for a new start)')

// 3. Circle and polygon, and the keyboard path.
await newSketch()
await tool('Circle')
await clickAt(15, 20)
await clickAt(21, 20)
await tool('Polygon')
await clickAt(45, 20)
await clickAt(51, 20)
await editTab()
await page.getByText(/Closed profile: 2 region\(s\)/).waitFor({ timeout: 30000 })
check(true, 'click-to-draw: a circle (⌀12) and a hexagon give two closed regions')
check((await svg().locator('.cadm-sk-dim').count()) >= 2, 'click-to-draw: the diameter and polygon dimensions are drawn')
await tool('Line')
await svg().focus()
const before = await entityCount()
await page.keyboard.press('Home')
await page.keyboard.press('Enter')
for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
await page.keyboard.press('ArrowUp')
await page.keyboard.press('Enter')
await page.waitForFunction((n) => document.querySelectorAll('svg.cadm-sketch .cadm-sk-entity').length > n, before, { timeout: 30000 })
check(true, 'click-to-draw: the keyboard draws a line (Home, Enter, arrow keys, Enter)')
await page.keyboard.press('Escape')
await page.getByTestId('draw-hint').getByText(/start of the line/).waitFor()
await page.screenshot({ path: `${shots}/cd-03-circle-polygon.png` })

// Undo takes a whole shape back (each shape is one transaction).
await tool('Select')
await page.keyboard.press('Control+z')
await page.waitForFunction((n) => document.querySelectorAll('svg.cadm-sketch .cadm-sk-entity').length === n, before, { timeout: 30000 })
check(true, 'click-to-draw: undo removes the last drawn shape')

// 4. Touch: tapping places points (no hover, no dragging) on a phone-sized screen.
const phone = await (await demoAssistantContext(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage()
phone.on('pageerror', (e) => problems.push(e.message))
await phone.goto(exampleUrl())
await phone.waitForSelector('.ws-app')
await phone.waitForTimeout(1500)
await phone.goto(exampleUrl('tool=cad-modeler'))
await phone.getByRole('button', { name: 'New part' }).waitFor({ timeout: 30000 })
await phone.getByRole('button', { name: 'New part' }).tap()
await phone.getByRole('button', { name: 'Create sketch' }).tap()
const phoneSvg = phone.locator('svg.cadm-sketch')
await phoneSvg.waitFor({ timeout: 30000 })
await phone.locator('.cadm-draw-bar').getByRole('radio', { name: 'Rectangle', exact: true }).tap()
const tapAt = async (x, y) => {
  await phoneSvg.scrollIntoViewIfNeeded()
  const p = await phoneSvg.evaluate((el, [sx, sy]) => {
    const [vx, vy, vw, vh] = el.getAttribute('viewBox').split(' ').map(Number)
    const r = el.getBoundingClientRect()
    const s = Math.min(r.width / vw, r.height / vh)
    return { x: r.left + (r.width - vw * s) / 2 + (sx - vx) * s, y: r.top + (r.height - vh * s) / 2 + (-sy - vy) * s }
  }, [x, y])
  await phone.touchscreen.tap(p.x, p.y)
}
await tapAt(10, 10)
await tapAt(40, 30)
await phone.waitForFunction(() => document.querySelectorAll('svg.cadm-sketch .cadm-sk-entity').length === 4, null, { timeout: 30000 })
check(true, 'click-to-draw on a phone: two taps draw a rectangle')
check((await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)), 'click-to-draw on a phone: no horizontal page scroll')
await phone.screenshot({ path: `${shots}/cd-04-phone.png` })
await phone.close()

// ---- Repair reference (CAD sprint C1.3): the person chooses the replacement ---------------------------------------------------
// A block with a row of slots (the pattern count is the parameter n) and a fillet on two strip edges of the top face is opened
// from a native file. Reducing n removes the last strip, so the fillet loses its edge. The fixture is validated against the real
// kernel in packages/cad-kernel/src/repair.test.ts.
const fixture = `${env.repoFs}/tests/e2e/fixtures/cad/slotted-block.ewscad`
async function openFixture(p) {
  const openButton = p.getByRole('button', { name: 'Open', exact: true }).first()
  if (await openButton.isVisible().catch(() => false)) await openButton.click()
  else {
    await p.getByRole('button', { name: 'More actions' }).first().click()
    await p.getByRole('menuitem', { name: 'Open' }).first().click()
  }
  const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'Open file…' }).click()])
  await chooser.setFiles(fixture)
  await p.getByText(/Opened slotted-block\.ewscad/).first().waitFor({ timeout: 60000 })
}
await openFixture(page)
await page.getByRole('tab', { name: 'Diagnostics' }).click()
await page.getByText('No regeneration problems').waitFor({ timeout: 60000 })
check(true, 'repair reference: the fixture regenerates without problems (4 slots, fillet on two strip edges)')
await page.getByRole('tab', { name: 'Model', exact: true }).click()
const nField = page.getByRole('textbox', { name: 'Expression of n' })
await nField.fill('2')
await nField.press('Enter')
await page.getByRole('tab', { name: 'Diagnostics' }).click()
await page.getByText('Repair reference (1)').waitFor({ timeout: 60000 })
check(true, 'repair reference: with n = 2 the fillet loses an edge and Diagnostics lists it under Repair reference')
const row = page.getByTestId('repair-row')
check((await row.locator('.cadm-repair-lost').textContent())?.includes('cap-end~5'), 'repair reference: the lost edge is named (edge(ext-19/cap-end~5|ext-19/side:ln-8))')
check((await page.getByText(/Fillet strip edges.*reference lost/).count()) >= 1 && (await page.getByText(/no longer exists? on the body/).count()) >= 1, 'repair reference: the failure message says the edge no longer exists')
check(await row.getByRole('button', { name: 'Preview' }).isDisabled(), 'repair reference: nothing is chosen for you (Preview and Repair stay disabled)')
await page.screenshot({ path: `${shots}/rr-01-lost.png` })
await row.locator('button[aria-haspopup]').first().click()
await page.getByRole('option').filter({ hasText: 'cap-end~3|ext-19/side:ln-8' }).first().click()
await row.getByRole('button', { name: 'Preview' }).click()
await page.getByText('The model regenerates without problems with this replacement.').waitFor({ timeout: 60000 })
check(true, 'repair reference: Preview shows the result of the chosen replacement without committing it')
check((await page.getByText('Repair reference (1)').count()) === 1, 'repair reference: the preview changed nothing (the lost edge is still listed)')
await page.screenshot({ path: `${shots}/rr-02-preview.png` })
await row.getByRole('button', { name: 'Repair reference' }).click()
await page.getByText('No regeneration problems').waitFor({ timeout: 60000 })
check(true, 'repair reference: applying the chosen replacement regenerates the model without problems')
check((await page.locator('.cadm-log').getByText('Repair reference').count()) >= 1, 'repair reference: the repair is one entry in the operation log')
await page.keyboard.press('Escape')

// The same panel on a phone-sized screen.
const phone2 = await (await demoAssistantContext(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage()
await phone2.goto(exampleUrl('tool=cad-modeler'))
await phone2.getByRole('button', { name: 'New part' }).waitFor({ timeout: 30000 })
await openFixture(phone2)
await phone2.getByRole('tab', { name: 'Model', exact: true }).tap()
const nField2 = phone2.getByRole('textbox', { name: 'Expression of n' })
await nField2.fill('2')
await nField2.press('Enter')
await phone2.getByRole('tab', { name: 'Diagnostics' }).tap()
await phone2.getByText('Repair reference (1)').waitFor({ timeout: 60000 })
await phone2.getByText('Repair reference (1)').scrollIntoViewIfNeeded()
check(await phone2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'repair reference on a phone: no horizontal page scroll')
await phone2.screenshot({ path: `${shots}/rr-03-phone.png` })
await phone2.close()

problems.forEach((p) => console.log('PROBLEM', p.slice(0, 900)))
check(problems.length === 0, 'no console errors')
console.log(failures ? `${failures} FAILED` : 'ALL PASSED')
await browser.close()
process.exit(failures ? 1 : 0)
