// Project Management (CR-PM-WS-1, C12, C13): Project Home, New Project wizard, a blank project that is empty in every
// module with the real modules as default tabs, reopening after reload and in a fresh session, the overview with
// module provisioning states, and switching back to the example project with its data intact.
// Creates one new project per run (unique key); the example project is not changed.
import { env, launchOptions, shotsDir } from '../lib/env.mjs'
import { chromium } from 'playwright-core'

const base = env.base
const shots = shotsDir('projects')
const b = await chromium.launch({ ...launchOptions })
const uniqueKey = `E${Date.now().toString(36).toUpperCase().slice(-6)}`
let failures = 0
const check = (tag, cond, msg) => {
  console.log(`[${tag}] ${cond ? 'PASS' : 'FAIL'} ${msg}`)
  if (!cond) failures++
}
const problems = []
const watch = (p) => {
  p.on('pageerror', (e) => problems.push(e.message))
  p.on('console', (m) => m.type() === 'error' && !/favicon|DevTools|404|status of 4/.test(m.text()) && problems.push(m.text().slice(0, 300)))
}
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } })
const page = await ctx.newPage()
watch(page)
await page.goto(base)
await page.waitForSelector('.ws-app')
await page.evaluate(() => localStorage.clear())
await page.goto(base)
await page.waitForSelector('.ws-app')
await page.waitForTimeout(2000)

// 1. The example project opens as before; the header shows the project switcher.
const switcher = page.locator('[data-help-id="projects.switcher"]')
check('legacy', (await switcher.textContent())?.includes('ACT100'), `switcher shows the example project (${(await switcher.textContent())?.trim()})`)
const legacyTabs = await page.getByRole('tab').allTextContents()
check('legacy', legacyTabs.some((t) => /Requirements/.test(t)), `example project tabs: ${legacyTabs.join(' | ')}`)

// 2. Project Home → New project wizard.
await switcher.click()
await page.getByRole('dialog').waitFor()
await page.screenshot({ path: `${shots}/1-home.png` })
check('home', await page.getByText('Your projects').isVisible(), 'Project Home lists projects')
await page.getByRole('tab', { name: 'New project' }).click()
await page.getByLabel('Project name').fill('Example Engineering Product')
const key = await page.getByLabel('Key').inputValue()
check('wizard', key === 'EEP', `the key is suggested from the name (${key})`)
await page.getByLabel('Key').fill(uniqueKey)
await page.getByRole('checkbox', { name: 'Mechanical' }).check({ force: true })
await page.screenshot({ path: `${shots}/2-wizard.png` })
await Promise.all([page.waitForURL(/project=/, { timeout: 20000 }), page.getByRole('button', { name: 'Create and open' }).click()])
await page.waitForSelector('.ws-app')
await page.waitForTimeout(3000)
const projectId = new URL(page.url()).searchParams.get('project')
check('open', /^[0-9a-f-]{36}$/.test(projectId ?? ''), `opened the new project ${projectId}`)
check('open', (await switcher.textContent())?.includes(uniqueKey), `switcher shows ${uniqueKey} (${(await switcher.textContent())?.trim()})`)
const tabs = await page.getByRole('tab').allTextContents()
check('C12', ['Requirements', 'Conceptualize', 'SysML Modeler', 'CAD Modeler'].every((n) => tabs.some((t) => t.includes(n))), `real modules open by default: ${tabs.join(' | ')}`)
check('C12', !tabs.some((t) => /^SysML$|^CAD$/.test(t.trim())), 'illustrative SysML and mock CAD are not opened by default')
const treeText = await page.locator('.ws-app').textContent()
check('empty', !/ACT-100|ROD-120|Actuator assembly/.test(treeText ?? ''), 'no example data anywhere in the new project')
await page.screenshot({ path: `${shots}/3-new-project.png` })

// 3. Reopen after a reload (fresh page) and in a new browser session (fresh storage, same project URL).
await page.reload()
await page.waitForSelector('.ws-app')
await page.waitForTimeout(2500)
check('reopen', (await switcher.textContent())?.includes(uniqueKey), 'the remembered project reopens after reload')
const fresh = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
watch(fresh)
await fresh.goto(`${base}?project=${projectId}`)
await fresh.waitForSelector('.ws-app')
await fresh.waitForTimeout(2500)
check('reopen', (await fresh.locator('[data-help-id="projects.switcher"]').textContent())?.includes(uniqueKey), 'a fresh browser session opens the project from the server')

// 4. Overview: module states and members.
await switcher.click()
await page.getByRole('tab', { name: 'This project' }).click()
await page.waitForTimeout(1500)
const overview = await page.locator('[data-help-id="projects.overview"]').textContent()
check('overview', /Requirements/.test(overview ?? '') && /not-needed/.test(overview ?? ''), 'overview lists module provisioning states')
check('overview', /Eli/.test(overview ?? ''), 'overview lists the creator as member')
await page.screenshot({ path: `${shots}/4-overview.png` })

// 5. Phone layout of Project Home.
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(500)
await page.screenshot({ path: `${shots}/5-phone.png` })
await page.setViewportSize({ width: 1600, height: 1000 })

// 6. Switch back to the example project from the list.
await page.getByRole('tab', { name: 'Projects' }).click()
await page.waitForTimeout(1200)
const row = page.locator('[data-help-id="projects.home.project"]', { hasText: 'ACT-100 Linear actuator' }).first()
await Promise.all([page.waitForURL(/project=PRJ-ACT100/, { timeout: 20000 }), row.getByRole('button', { name: 'Open' }).click()])
await page.waitForSelector('.ws-app')
await page.waitForTimeout(2500)
check('switch', (await switcher.textContent())?.includes('ACT100'), 'switched back to the example project')
const back = await page.locator('.ws-app').textContent()
check('switch', /ACT-100|Actuator/.test(back ?? ''), 'the example data is intact')

check('console', problems.length === 0, `no page errors${problems.length ? `: ${problems.slice(0, 5).join(' || ')}` : ''}`)
await b.close()
console.log(failures ? `${failures} FAILED` : 'ALL PASSED')
process.exit(failures ? 1 : 0)
