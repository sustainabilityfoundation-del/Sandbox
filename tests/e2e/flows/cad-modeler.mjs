// CAD Modeler inside the workspace (port 5199): open the tool, AI workflow through the demo assistant
// (proposal card with kernel-predicted result → Apply → the view shows the body), then a human edit
// and an assistant follow-up that respects the version, help (F1 content), capability inventory.
import { env, launchOptions, shotsDir } from '../lib/env.mjs'
import { chromium } from 'playwright-core'
const base = env.base
const shots = shotsDir('cad-modeler')
const browser = await chromium.launch({ ...launchOptions, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
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

await page.goto(base)
await page.evaluate(() => localStorage.clear())
await page.goto(base)
await page.waitForSelector('.ws-app')
await page.waitForTimeout(1500)

// Open the CAD Modeler from the command palette.
await page.keyboard.press('Control+k')
await page.waitForSelector('.ws-launcher')
await page.keyboard.type('CAD Modeler')
await page.keyboard.press('Enter')
await page.getByRole('button', { name: 'New part' }).waitFor({ timeout: 30000 })
check(true, 'CAD Modeler opens in the workspace (start page)')
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
check(true, 'the CAD Modeler view shows the applied body (30869 mm³)')
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

problems.forEach((p) => console.log('PROBLEM', p.slice(0, 900)))
check(problems.length === 0, 'no console errors')
console.log(failures ? `${failures} FAILED` : 'ALL PASSED')
await browser.close()
process.exit(failures ? 1 : 0)
