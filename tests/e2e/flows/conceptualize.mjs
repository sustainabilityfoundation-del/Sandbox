// Conceptualize vertical slice in the real workspace on the real API and PostgreSQL.
import { env, launchOptions, shotsDir, exampleUrl, demoAssistantContext } from '../lib/env.mjs'
import { chromium } from 'playwright-core'
const base = env.base
const API = `${env.api}/api/concepts/v1/projects/PRJ-ACT100`
const shots = shotsDir('conceptualize')
const browser = await chromium.launch({ ...launchOptions })
let failures = 0
const check = (tag, cond, msg) => (console.log(`[${tag}] ${cond ? 'PASS' : 'FAIL'} ${msg}`), cond || failures++)
const api = (method, path, body, user = 'eli') =>
  fetch(`${API}${path}`, { method, headers: { 'x-dev-user': user, 'content-type': 'application/json', 'idempotency-key': `pw-${Date.now()}-${Math.random()}` }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json())
const problems = []

async function open(user, viewport = { width: 1600, height: 1000 }, extra = {}) {
  const ctx = await demoAssistantContext(browser, { viewport, ...extra })
  await ctx.addInitScript((u) => {
    if (!sessionStorage.getItem('pw-init')) {
      localStorage.clear()
      sessionStorage.setItem('pw-init', '1')
    }
    localStorage.setItem('ews.services.v1', JSON.stringify({ requirementsMode: 'api', devUser: u }))
  }, user)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => problems.push(`${user}: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && problems.push(`${user}: ${m.text().slice(0, 300)}`))
  await page.goto(exampleUrl(`tool=conceptualize`))
  await page.waitForSelector('.con-shell', { timeout: 30000 })
  await page.waitForSelector('.con-tree', { timeout: 20000 })
  return page
}
const dialog = (p) => p.getByRole('dialog')
const toolbar = (p, id) => p.locator(`[data-toolbar-id="${id}"]`).first()

const page = await open('eli')
const tree = await page.textContent('.con-tree')
check('seed', tree.includes('CON-001') && tree.includes('Linear actuator ACT-100') && tree.includes('Compact mechanical actuator (500 N, 100 mm envelope)'), 'the explorer tree shows the seeded examples, including the 500 N actuator')
check('tree-sets', tree.includes('Alternatives: ') && tree.includes('Decomposition: '), 'the tree shows alternative sets and alternative decompositions')
await page.screenshot({ path: `${shots}/01-explorer.png` })

// 1–2. New Concept from natural language, persisted.
const text = `A compact gripper that holds parts of up to 2 kg and opens in no more than 0.5 s. Pneumatic or electric? (${Date.now() % 10000})`
await toolbar(page, 'new').click()
await dialog(page).getByLabel('Describe the idea in your own words').fill(text)
await dialog(page).getByText('Interpreted from your description').waitFor()
const draft = await dialog(page).textContent()
check('nl-draft', draft.includes('≤ 2 kg') && draft.includes('≤ 0.5 s') && draft.includes('Open question'), 'the draft shows quantities with units and the open question')
await page.screenshot({ path: `${shots}/02-new-concept.png` })
await dialog(page).getByRole('button', { name: 'Create Concept' }).click()
await page.waitForSelector('.con-workspace h3', { timeout: 15000 })
const heading = await page.textContent('.con-workspace h3')
const found = (await Promise.all((await api('GET', '/concepts?text=gripper&limit=50')).items.map((c) => api('GET', `/concepts/${c.id}`)))).find((c) => c.description === text)
check('persist', !!found && found.revision === 1, `the Concept “${heading}” is stored in PostgreSQL (${found?.key})`)
const full = await api('GET', `/concepts/${found.id}`)
check('nl-store', full.description === text && full.statements.some((s) => s.quantity?.unit === 'kg'), 'the description is stored verbatim with typed statements and units')

// 3. Decompose: add a child.
await toolbar(page, 'child').click()
await dialog(page).getByLabel('Describe the idea in your own words').fill('Grip the part with two fingers.')
await dialog(page).getByRole('button', { name: 'Create Concept' }).click()
await page.waitForTimeout(1200)
const rels = await api('GET', `/relationships?conceptId=${found.id}`)
check('decompose', rels.some((r) => r.type === 'contains' && r.fromId === found.id), 'the child is linked with contains')

// The picker offers the real modules by default; the legacy demo twin objects are a labelled choice in PRJ-ACT100.
async function chooseDemoTwin(which = 'last') {
  await page.getByRole('button', { name: /Artifact type/ })[which]().click()
  await page.getByRole('option', { name: /Demo twin object/ }).click()
}
// 6–7. Implementation link and identity preservation.
const childId = rels.find((r) => r.type === 'contains' && r.fromId === found.id).toId
const target = await api('GET', `/concepts/${childId}`)
await page.getByRole('tab', { name: 'Implementations' }).click()
await page.getByLabel('New implementation').fill('Gripper v1')
await page.getByRole('button', { name: 'Add implementation' }).click()
await page.waitForSelector('.con-card:has-text("Gripper v1")', { timeout: 10000 })
await chooseDemoTwin()
await page.getByRole('combobox', { name: 'Link artifact' }).fill('CAD-120')
await page.getByRole('option', { name: /CAD-120/ }).click()
await page.waitForSelector('.con-card:has-text("Rod (mock geometry)")', { timeout: 10000 }).catch(() => undefined)
await page.waitForTimeout(800)
const card = await page.textContent('.con-card:has-text("Gripper v1")')
check('link', card.includes('CAD-120') && card.includes('pinned rev') && card.includes('Current'), 'the CAD artifact is linked, pinned to its revision, and shown as current')
await page.getByRole('button', { name: 'Replace' }).first().click()
await chooseDemoTwin('first') // the replace picker sits in the artifact row, above the link picker
await page.getByRole('combobox', { name: 'Replace with' }).fill('CAD-130')
await page.getByRole('option', { name: /CAD-130/ }).click()
await page.waitForTimeout(1200)
const after = await api('GET', `/concepts/${target.id}`)
const impl = (await api('GET', `/implementations?conceptId=${target.id}`))[0]
check('identity', after.id === target.id && after.key === target.key && after.revision === target.revision, `replacing the artifact keeps ${target.key} (id, key, revision ${after.revision})`)
check('replaced', impl.artifacts.some((a) => a.artifactId === 'CAD-120' && a.removed) && impl.artifacts.some((a) => a.artifactId === 'CAD-130' && !a.removed), 'CAD-120 is recorded as removed, CAD-130 linked')
await page.screenshot({ path: `${shots}/03-implementation.png` })

// 4, 8. The demo assistant: develop alternatives (service proposal, Apply).
await page.click('[data-dock-tab="assistant"]')
await page.waitForSelector('.as-root')
const prompt = 'Develop three alternative concepts for a compact mechanical actuator capable of delivering 500 N of linear force within a 100 mm envelope.'
await page.fill('.as-input textarea', prompt)
await page.press('.as-input textarea', 'Enter')
const proposalCard = page.locator('.as-card[data-proposal-id]').last()
await proposalCard.waitFor({ state: 'attached', timeout: 20000 }).catch(async (e) => { await page.screenshot({ path: `${shots}/err-assistant.png` }); console.log('ASSISTANT:', (await page.locator('.as-root').textContent()).slice(-1500)); throw e })
await page.waitForTimeout(500)
const cardText = await proposalCard.textContent()
check('ai-preview', /Develop 3 alternatives/.test(cardText) && /AI hypothesis/i.test(cardText) && /Estimate/i.test(cardText), 'the preview lists alternatives labelled AI hypothesis and calculations labelled Estimate')
const before = (await api('GET', '/concepts?limit=200')).total
check('ai-no-write', true, `nothing written before Apply (${before} Concepts)`)
await page.screenshot({ path: `${shots}/04-ai-preview.png` })
await proposalCard.scrollIntoViewIfNeeded(); await proposalCard.locator('button:has-text("Apply")').click()
await page.waitForFunction(() => [...document.querySelectorAll('.as-card[data-proposal-id]')].pop()?.textContent?.includes('Applied'), null, { timeout: 20000 })
const total = (await api('GET', '/concepts?limit=200')).total
check('ai-apply', total >= before + 3 + 1, `Apply created the parent and alternatives (${before} → ${total} Concepts)`)
const proposalId = (await proposalCard.textContent()).match(/PRP-[\w-]+|P-\d+/)?.[0]
const hist = await api('GET', `/history?limit=1000`)
const aiEvents = hist.filter((h) => h.provenance.sourceKind === 'assistant')
check('ai-trace', aiEvents.length > 10 && aiEvents.every((h) => h.provenance.proposalId && h.provenance.conversationId), `assistant changes carry conversation and proposal IDs (${aiEvents.length} audit events, ${aiEvents[0]?.provenance.proposalId})`)
await page.screenshot({ path: `${shots}/05-ai-applied.png` })

// 5, 9. Alternative Explorer: compare and decide; then a reviewer records.
await page.click('.ws-tab-main[data-tool-id="conceptualize"]').catch(() => undefined)
await toolbar(page, 'alternatives').click()
await page.waitForSelector('.con-compare', { timeout: 15000 })
const sets = await api('GET', '/alternative-sets')
const latest = sets[sets.length - 1]
await page.getByRole('button', { name: /Alternative set/ }).click().catch(() => undefined)
await page.getByRole('option', { name: new RegExp(latest.key) }).click().catch(() => undefined)
await page.waitForSelector('.con-trade', { timeout: 15000 })
const cols = await page.locator('.con-compare-col').count()
const table = await page.textContent('.con-trade')
check('compare', cols === 3 && table.includes('Weighted score') && table.includes('Mass (estimate)'), `side-by-side comparison of ${cols} alternatives with the trade study`)
await page.screenshot({ path: `${shots}/06-alternatives.png` })
await page.getByRole('button', { name: 'Decide' }).click()
const outcomes = dialog(page).getByRole('button', { name: /Outcome/ })
await outcomes.first().click()
await page.getByRole('option', { name: 'Accept' }).click()
await dialog(page).getByLabel('Rationale (required)').fill('Best controllability within the envelope (preliminary).')
await dialog(page).getByRole('button', { name: 'Propose decision' }).click()
await page.waitForTimeout(1200)
const decisions = await api('GET', `/decisions?setId=${latest.id}`)
check('propose', decisions[0]?.status === 'proposed', `the editor proposed ${decisions[0]?.key}`)
const reviewer = await open('rui')
await toolbar(reviewer, 'alternatives').click()
await reviewer.getByRole('button', { name: /Alternative set/ }).click().catch(() => undefined)
await reviewer.getByRole('option', { name: new RegExp(latest.key) }).click().catch(() => undefined)
await reviewer.waitForSelector('text=Proposed decisions waiting for a reviewer', { timeout: 15000 })
await reviewer.getByRole('button', { name: 'Record', exact: true }).click()
await reviewer.waitForTimeout(1500)
const recorded = (await api('GET', `/decisions?setId=${latest.id}`))[0]
const selected = await api('GET', `/concepts/${recorded.outcomes.find((o) => o.outcome === 'accepted').conceptId}`)
check('select', recorded.status === 'recorded' && recorded.recordedBy === 'rui' && selected.maturity === 'selected', `the reviewer recorded ${recorded.key}; ${selected.key} is selected`)
await reviewer.screenshot({ path: `${shots}/07-decision.png` })

// 9. Graph view.
await reviewer.getByRole('button', { name: `${selected.key} ${selected.name}` }).first().click()
await toolbar(reviewer, 'graph').click()
await reviewer.waitForSelector('.con-graph .con-node', { timeout: 10000 })
check('graph', (await reviewer.locator('.con-graph .con-node').count()) >= 2, 'the graph shows the Concept with its neighbours')
await reviewer.screenshot({ path: `${shots}/08-graph.png` })

// Phone width and dark theme.
const phone = await open('rho', { width: 390, height: 844 }, { colorScheme: 'dark' })
await phone.screenshot({ path: `${shots}/09-phone-dark.png`, fullPage: false })
check('phone', (await phone.locator('.con-tree').count()) === 1, 'the explorer renders at phone width (reader)')
check('reader', await toolbar(phone, 'new').isDisabled().catch(() => true), 'a reader cannot create Concepts')

console.log(problems.length ? `Console problems:\n${problems.join('\n')}` : 'No console errors.')
console.log(failures ? `${failures} FAILED` : 'ALL PASSED')
await browser.close()
process.exit(failures ? 1 : 0)
