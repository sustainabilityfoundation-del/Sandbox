// Coordinator integration: workspace Requirements tool on the real API, service menu, demo mode, user switch.
import { env, launchOptions, shotsDir, exampleUrl, demoAssistantContext } from '../lib/env.mjs'
import { chromium } from 'playwright-core'

const base = env.base
const shots = shotsDir('integration')
const browser = await chromium.launch({ ...launchOptions })
let failures = 0
const check = (tag, cond, msg) => {
  console.log(`[${tag}] ${cond ? 'PASS' : 'FAIL'} ${msg}`)
  if (!cond) failures++
}
const context = await demoAssistantContext(browser, { viewport: { width: 1600, height: 1000 } })
const page = await context.newPage()
const problems = []
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !/DevTools|\[vite\]|favicon/.test(m.text()) && problems.push(m.text().slice(0, 200)))
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
const shot = (name, p = page) => p.screenshot({ path: `${shots}/if-${name}.png` })

await page.goto(exampleUrl())
await page.waitForSelector('.ws-app')
await page.evaluate(() => localStorage.clear())
await page.goto(exampleUrl(`tool=requirements`))
await page.waitForSelector('.ws-app')
await page.waitForTimeout(2500)
const body = await page.locator('body').textContent()
check('api', !/not available here/i.test(body), 'Requirements tool has the service in the workspace')
check('api', /REQ-001/.test(body) && /Operating load/.test(body), 'requirements load from the API')
await page.getByRole('button', { name: /^Requirements service:/ }).click()
await page.waitForSelector('[data-testid="services-menu"]')
await page.waitForTimeout(800)
const state = await page.getAttribute('[data-testid="services-menu"]', 'data-service-state')
check('menu', state === 'ok', `service menu reports the API reachable (${state})`)
await shot('1-api')
await page.keyboard.press('Escape')

// Switch to the reader: editing actions must not be offered or must be refused by the server.
await page.evaluate(() => localStorage.setItem('ews.services.v1', JSON.stringify({ requirementsMode: 'api', devUser: 'rho' })))
await page.reload()
await page.waitForSelector('.ws-app')
await page.waitForTimeout(2500)
check('reader', /API as rho/.test(await page.getByRole('button', { name: /^Requirements service:/ }).getAttribute('aria-label')), 'header shows the reader identity')
await shot('2-reader')

// Explicit demo mode.
await page.evaluate(() => localStorage.setItem('ews.services.v1', JSON.stringify({ requirementsMode: 'demo', devUser: 'eli' })))
await page.reload()
await page.waitForSelector('.ws-app')
await page.waitForTimeout(2000)
check('demo', /Demo data/.test(await page.locator('header.ws-header').textContent()), 'header labels demo mode')
check('demo', /REQ-001/.test(await page.locator('body').textContent()), 'demo requirements shown')
await shot('3-demo')

check('console', problems.length === 0, `no console errors${problems.length ? ': ' + problems.join(' | ') : ''}`)
console.log(`\n${failures} failure(s)`)
await browser.close()
process.exit(failures ? 1 : 0)
