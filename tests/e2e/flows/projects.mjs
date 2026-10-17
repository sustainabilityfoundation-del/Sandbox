// Project Management (CR-PM-WS-1, C12, C13): Project Home, New Project wizard, a blank project that is empty in every
// module with the real modules as default tabs, reopening after reload and in a fresh session, the overview with
// module provisioning states, and switching back to the example project with its data intact.
// Creates one new project per run (unique key); the example project is not changed.
import { env, exampleUrl, launchOptions, shotsDir, demoAssistantContext } from '../lib/env.mjs'
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
const ctx = await demoAssistantContext(b, { viewport: { width: 1600, height: 1000 } })
const page = await ctx.newPage()
watch(page)
await page.goto(exampleUrl())
await page.waitForSelector('.ws-app')
await page.evaluate(() => localStorage.clear())
await page.goto(exampleUrl())
await page.waitForSelector('.ws-app')
await page.waitForTimeout(2000)

// 1. The example project opens as before; the header shows the project switcher.
const switcher = page.locator('[data-help-id="projects.switcher"]')
check('legacy', (await switcher.textContent())?.includes('ACT100'), `switcher shows the example project (${(await switcher.textContent())?.trim()})`)
// The open tools are no longer shown as top tabs (16 October 2026); read them from the store, and the active one from the rail.
const openToolNames = () =>
  page.evaluate(async () => {
    const { useWorkspaceStore } = await import('/workspace/src/platform/store.ts')
    const { getTool } = await import('/workspace/src/platform/registry.ts')
    return useWorkspaceStore.getState().openToolIds.map((id) => getTool(id)?.name ?? id)
  })
const legacyTabs = await openToolNames()
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
const tabIds = await page.evaluate(async () => (await import('/workspace/src/platform/store.ts')).useWorkspaceStore.getState().openToolIds)
const tabs = await openToolNames()
check('C12', ['Requirements', 'Conceptualize', 'System Model', 'CAD Modeler'].every((n) => tabs.some((t) => t.includes(n))), `real modules open by default: ${tabs.join(' | ')}`)
check('C12', !tabIds.some((id) => id === 'sysml' || id === 'cad'), 'illustrative SysML and mock CAD are not opened by default')
const treeText = await page.locator('.ws-app').textContent()
check('empty', !/ACT-100|ROD-120|Actuator assembly/.test(treeText ?? ''), 'no example data anywhere in the new project')
await page.screenshot({ path: `${shots}/3-new-project.png` })

// 2b. Project explorer: artifacts created in the modules (here through their APIs, as the assistant would) appear
//     in the left panel, grouped by module, without a reload; choosing a concept opens Conceptualize.
const explorer = page.locator('[data-help-id="projects.explorer"]')
check('explorer', await explorer.isVisible(), 'new projects show the project explorer instead of the example product tree')
const api = async (path, body) => {
  const res = await fetch(`${env.api}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-user': 'eli', 'idempotency-key': `flow-${Date.now()}-${Math.random()}` }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res.json()
}
await api(`/api/concepts/v1/projects/${projectId}/concepts`, { name: 'Explorer concept' })
await api(`/api/concepts/v1/projects/${projectId}/functions`, { name: 'Explorer function' })
await api(`/api/requirements/v1/projects/${projectId}/requirements`, { title: 'Explorer requirement', statement: 'The part shall be visible in the explorer.', type: 'functional' })
let explorerText = ''
for (let i = 0; i < 40; i++) {
  explorerText = (await explorer.textContent()) ?? ''
  if (/Explorer concept/.test(explorerText) && /Explorer function/.test(explorerText) && /Explorer requirement/.test(explorerText)) break
  await page.waitForTimeout(500)
}
check('explorer', /Explorer concept/.test(explorerText) && /Explorer function/.test(explorerText), 'concepts and functions appear without a reload (registry events)')
check('explorer', /Explorer requirement/.test(explorerText), 'requirements appear without a reload')
check('explorer', /Concepts and design knowledge/.test(explorerText) && /Requirements/.test(explorerText), 'grouped by module')
await page.screenshot({ path: `${shots}/3b-explorer.png` })
await explorer.getByRole('row', { name: /Explorer concept/ }).click()
await page.waitForTimeout(1500)
const selectedTab = await page.locator('[data-rail-tool][aria-current="page"]').first().getAttribute('aria-label')
check('explorer', /Conceptualize/.test(selectedTab ?? ''), `choosing a concept opens Conceptualize (${selectedTab?.trim()})`)

// 3. Reopen after a reload (fresh page) and in a new browser session (fresh storage, same project URL).
await page.reload()
await page.waitForSelector('.ws-app')
await page.waitForTimeout(2500)
check('reopen', (await switcher.textContent())?.includes(uniqueKey), 'the remembered project reopens after reload')
check('reopen', /Explorer concept/.test((await page.locator('[data-help-id="projects.explorer"]').textContent()) ?? ''), 'the explorer lists the artifacts again after the reload')
const fresh = await (await demoAssistantContext(b, { viewport: { width: 1280, height: 900 } })).newPage()
watch(fresh)
// No ?project= and no stored choice: the most recently opened project on the server reopens.
await fresh.goto(base)
await fresh.waitForURL(/project=/, { timeout: 20000 })
await fresh.waitForSelector('.ws-app')
await fresh.waitForTimeout(2500)
check('reopen', (await fresh.locator('[data-help-id="projects.switcher"]').textContent())?.includes(uniqueKey), 'a fresh browser (no stored project) reopens the most recently opened project from the server')

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
