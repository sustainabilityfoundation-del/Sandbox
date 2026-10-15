// Demonstration D1 PLUMBING test (docs/specifications/demo-ai-engineering.md). The FAKE provider replays a
// recorded tool-call script (tests/e2e/fixtures/fake-scripts/d1-plumbing.json) through the real workspace,
// assistant service, policy, previews, Apply and module services. It proves the plumbing; it is NOT a model run
// and does NOT count as D1 acceptance. The live run with a real model follows docs/modules/ai-interface/d1-live-run.md.
//
// Start the stack with the fake provider and its scripts: `npm run ai:dev:fake`
// (sets EWS_ASSISTANT_FAKE_PROVIDER=1 and EWS_ASSISTANT_FAKE_SCRIPTS=tests/e2e/fixtures/fake-scripts).
// Run: `npm run e2e -- demo-d1` (E2E_BASE / E2E_API for other ports). Resets the AI connection of development user eli.
import { readFileSync } from 'node:fs'
import { env, launchOptions, shotsDir } from '../lib/env.mjs'
import { chromium } from 'playwright-core'

/** D1 steps whose operations do not exist yet (owners in demo-ai-engineering.md §3). Reported, not failed. */
const PENDING = [
  'step 1  projects.create / open (D1-PM)',
  'step 3  requirements.create with origin, requirements.allocate (D1-REQ); drafts come from conceptualize.propose_requirement today',
  'step 4  architecture: product elements and SysML Modeler propose_commands headless (D1-PM, D1-SYS)',
  'step 5  decision on named alternatives (CR-AI-1); alternatives are placeholders from develop_alternatives today',
  'step 6  regular-polygon hex pocket, linear pattern, parameter bindings to constraints (D1-CAD); a round pocket is a labelled stand-in',
  'step 7  cad-modeler.check and conceptualize.record_evidence (D1-CAD, D1-CON)',
  'step 8  plain-language change: revise_constraint, check_bindings, review flags (D1-CON, D1-CAD)',
  'step 9  service restart (run the flow again after restarting: data is read back from the services below)',
]

const API = env.api
const P = 'PRJ-ACT100'
const H = { 'x-dev-user': 'eli' }
const shots = shotsDir('demo-d1')
let failures = 0
const check = (cond, msg) => (console.log(`[demo-d1] ${cond ? 'PASS' : 'FAIL'} ${msg}`), cond || failures++)
const json = async (r) => (r.headers.get('content-type')?.includes('json') ? r.json() : r.text())

// Preconditions: fake provider with the recorded script.
const providers = await json(await fetch(`${API}/api/assistant/v1/providers`, { headers: H }))
if (!providers.providers?.some((p) => p.id === 'fake')) {
  console.error('[demo-d1] FAIL the fake provider is not registered: start the stack with npm run ai:dev:fake.')
  process.exit(1)
}
await fetch(`${API}/api/assistant/v1/connection?projectId=${P}`, { method: 'DELETE', headers: H })
const connected = await fetch(`${API}/api/assistant/v1/connection/api-key?projectId=${P}`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'fake', apiKey: 'fake-d1-plumbing-key' }) })
check(connected.status === 201, 'connected development user eli to the fake provider')

const browser = await chromium.launch({ ...launchOptions })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true })
await context.addInitScript(() => {
  if (!sessionStorage.getItem('pw-init')) {
    localStorage.clear()
    sessionStorage.setItem('pw-init', '1')
  }
  localStorage.setItem('ews.services.v1', JSON.stringify({ requirementsMode: 'api', devUser: 'eli' }))
})
const page = await context.newPage()
const problems = []
page.on('pageerror', (e) => problems.push(e.message))
await page.goto(`${env.base}?tool=conceptualize`)
await page.waitForSelector('[data-testid="model-revision"]', { timeout: 60000 })
await page.click('[data-dock-tab="assistant"]')
await page.waitForSelector('[data-testid="assistant-connection"][data-assistant-kind="remote"]', { timeout: 20000 })

const lastReply = () => page.locator('.as-assistant').last()
async function ask(text) {
  await page.fill('.as-input textarea', text)
  await page.press('.as-input textarea', 'Enter')
  await page.waitForFunction(() => {
    const msgs = [...document.querySelectorAll('.as-assistant')]
    const last = msgs[msgs.length - 1]
    return last && !last.querySelector('.as-thinking') && (last.querySelector('.as-text') || last.querySelector('.as-note'))
  }, null, { timeout: 60000 })
  await page.waitForTimeout(800) // proposals are saved asynchronously
  return lastReply()
}
/** Applies every pending card of a reply, one by one; returns the events. */
async function applyAll(reply, label) {
  const events = []
  await reply.getByRole('button', { name: 'Apply', exact: true }).first().waitFor({ timeout: 15000 }).catch(() => {})
  for (let i = 0; i < 10; i++) {
    const button = reply.getByRole('button', { name: 'Apply', exact: true }).first()
    if (!(await button.count())) break
    const before = await page.locator('.as-event').count()
    await button.click()
    await page.waitForFunction((n) => document.querySelectorAll('.as-event').length > n, before, { timeout: 30000 })
    events.push(await page.locator('.as-event').last().textContent())
  }
  const ok = events.length > 0 && events.every((e) => /^Applied /.test(e.trim()))
  check(ok, `${label}: ${events.length} proposal(s) applied (${events.map((e) => e.trim().slice(0, 70)).join(' | ')})`)
  return events
}
const operations = async (reply) => (await reply.locator('.as-step-name').allTextContents()).join(', ')

// Step 2: concept from the need, then functions, constraints and an assumption.
let reply = await ask('D1 concept: a holder block for six hex-shank bits on a cordless drill')
check((await operations(reply)).includes('conceptualize.create'), 'the model requested conceptualize.create; nothing changed before Apply')
await applyAll(reply, 'concept')
reply = await ask('D1 functions and constraints')
check((await operations(reply)).includes('conceptualize.create_constraint') && (await operations(reply)).includes('conceptualize.record_assumption'), `read before proposing, then function, constraints and assumption requested (${await operations(reply)})`)
await applyAll(reply, 'function, constraints and assumption')
await page.screenshot({ path: `${shots}/01-concept.png` })

// Step 3: draft requirements.
reply = await ask('D1 requirements')
await applyAll(reply, 'draft requirements')

// Step 5: alternatives.
reply = await ask('D1 alternatives')
await applyAll(reply, 'alternatives')

// Step 6: native CAD (the CAD Modeler view is opened by the person).
await page.goto(`${env.base}?tool=cad-modeler`)
await page.waitForSelector('[data-testid="model-revision"]', { timeout: 60000 })
await page.click('[data-dock-tab="assistant"]').catch(() => {})
await page.waitForTimeout(3000)
reply = await ask('D1 CAD')
await applyAll(reply, 'CAD commands')
await page.screenshot({ path: `${shots}/02-cad.png` })

// Step 9 (part): save the native document to the CAD service, then export STEP.
reply = await ask('D1 save')
await applyAll(reply, 'save the CAD document')
reply = await ask('D1 export')
const downloadPromise = page.waitForEvent('download', { timeout: 60000 }).catch(() => null)
await applyAll(reply, 'STEP export')
const download = await downloadPromise
check(!!download && /\.(step|stp)$/i.test(download.suggestedFilename()), `a STEP file was produced (${download?.suggestedFilename() ?? 'none'})`)

// Evidence: the exported transcript holds every operation with its arguments and a replayable script.
const transcriptPromise = page.waitForEvent('download', { timeout: 20000 })
await page.getByTestId('export-transcript').click()
const transcriptFile = await (await transcriptPromise).path()
const transcript = JSON.parse(readFileSync(transcriptFile, 'utf8'))
const ops = transcript.messages.filter((m) => m.role === 'assistant').flatMap((m) => m.operations)
check(transcript.format === 'ews-assistant-transcript' && ops.length >= 9 && ops.every((o) => o.arguments) && transcript.replayScript.turns.length >= 7, `the transcript records ${ops.length} operations with arguments and a ${transcript.replayScript.turns.length}-turn replay script`)

// Fresh browser session: the committed artifacts are read back from the services, not from browser memory.
const fresh = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
await fresh.addInitScript(() => localStorage.setItem('ews.services.v1', JSON.stringify({ requirementsMode: 'api', devUser: 'eli' })))
const page2 = await fresh.newPage()
await page2.goto(`${env.base}?tool=conceptualize`)
await page2.waitForSelector('[data-testid="model-revision"]', { timeout: 60000 })
const concepts = await json(await fetch(`${API}/api/concepts/v1/projects/${P}/concepts?text=${encodeURIComponent('Drill bit holder block')}&limit=50`, { headers: H }))
check((concepts.items ?? []).length > 0, `the concept is stored in Conceptualize (${(concepts.items ?? []).map((c) => c.key).slice(-3).join(', ')})`)
const documents = await json(await fetch(`${API}/api/cad/v1/projects/${P}/documents`, { headers: H }))
check(Array.isArray(documents) && documents.length > 0, `the CAD document is stored by the CAD service (${Array.isArray(documents) ? documents.length : 0} document(s))`)
await page2.screenshot({ path: `${shots}/03-fresh-session.png` })
await fresh.close()

console.log('[demo-d1] PENDING (operations not available yet, not counted):')
for (const p of PENDING) console.log(`[demo-d1]   ${p}`)
check(problems.length === 0, `no page errors${problems.length ? `: ${problems.join(' | ')}` : ''}`)
await fetch(`${API}/api/assistant/v1/connection?projectId=${P}`, { method: 'DELETE', headers: H })
await browser.close()
console.log(failures ? `[demo-d1] ${failures} FAILED (plumbing test; not D1 acceptance)` : '[demo-d1] ALL PASSED (plumbing test; not D1 acceptance)')
process.exit(failures ? 1 : 0)
