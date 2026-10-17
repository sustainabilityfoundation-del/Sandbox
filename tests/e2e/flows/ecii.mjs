// ECII increment 1 regression (docs/specifications/ecii-plan.md section 4, brief Tests A and D): engineering intent and
// clarification through the real workspace, assistant service, previews, Apply and the real Conceptualize service.
// The FAKE provider replays tests/e2e/fixtures/fake-scripts/ecii-a.json and ecii-d.json. These prove STRUCTURE and
// plumbing (the intent record, the deterministic gaps, the clarification question), NOT reasoning quality: whether a
// model interprets such a request well is a live evaluation against the rubric.
//
// Start the stack with the fake provider and its scripts: `npm run ai:dev:fake` (own ports: API_PORT, EMBEDDED_PG_PORT).
// Run: `npm run e2e -- ecii` (E2E_BASE / E2E_API for other ports). It resets the AI connection of development user eli
// and writes intents into PRJ-ACT100 (a development database, never real work).
import { env, launchOptions, shotsDir, exampleUrl } from '../lib/env.mjs'
import { chromium } from 'playwright-core'

const API = env.api
const H = { 'x-dev-user': 'eli' }
const P = 'PRJ-ACT100'
const shots = shotsDir('ecii')
let failures = 0
const check = (cond, msg) => (console.log(`[ecii] ${cond ? 'PASS' : 'FAIL'} ${msg}`), cond || failures++)
const get = async (path) => (await fetch(`${API}${path}`, { headers: H })).json()
const concepts = `/api/concepts/v1/projects/${P}`

const providers = await get('/api/assistant/v1/providers')
if (!providers.providers?.some((p) => p.id === 'fake')) {
  console.error('[ecii] FAIL the fake provider is not registered: start the stack with npm run ai:dev:fake.')
  process.exit(1)
}
await fetch(`${API}/api/assistant/v1/connection?projectId=${P}`, { method: 'DELETE', headers: H })
const connected = await fetch(`${API}/api/assistant/v1/connection/api-key?projectId=${P}`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'fake', apiKey: 'fake-ecii-structure-key' }) })
check(connected.status === 201, 'connected development user eli to the fake provider')

const browser = await chromium.launch({ ...launchOptions })
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
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

async function openAssistant() {
  await page.waitForSelector('.ws-app', { timeout: 60000 })
  await page.click('[data-dock-tab="assistant"]')
  await page.waitForSelector('[data-testid="assistant-connection"][data-assistant-kind="remote"]', { timeout: 30000 })
}
async function ask(text) {
  await page.fill('.as-input textarea', text)
  await page.press('.as-input textarea', 'Enter')
  await page.waitForFunction(() => {
    const msgs = [...document.querySelectorAll('.as-assistant')]
    const last = msgs[msgs.length - 1]
    return last && !last.querySelector('.as-thinking') && (last.querySelector('.as-text') || last.querySelector('.as-note'))
  }, null, { timeout: 120000 })
  await page.waitForTimeout(800)
  return page.locator('.as-assistant').last()
}
const operations = async (reply) => (await reply.locator('.as-step-name').allTextContents()).join(', ')
const answer = async (reply) => (await reply.locator('.as-text').last().textContent()) ?? ''
async function applyAll(reply, label, expected) {
  const events = []
  await reply.getByRole('button', { name: 'Apply', exact: true }).first().waitFor({ timeout: 20000 }).catch(() => {})
  for (let i = 0; i < 5; i++) {
    const button = reply.getByRole('button', { name: 'Apply', exact: true }).first()
    if (!(await button.count())) break
    const before = await page.locator('.as-event').count()
    await button.click()
    await page.waitForFunction((n) => document.querySelectorAll('.as-event').length > n, before, { timeout: 60000 })
    events.push(await page.locator('.as-event').last().textContent())
  }
  check(events.length === expected && events.every((e) => /^Applied /.test(e.trim())), `${label}: ${events.length}/${expected} proposal(s) applied (${events.map((e) => e.trim().slice(0, 100)).join(' | ')})`)
}
const newIntent = async (before) => (await get(`${concepts}/intents`)).find((i) => !before.has(i.id))
const countRecords = async () => ({ concepts: (await get(`${concepts}/concepts?limit=1`)).total, sets: (await get(`${concepts}/alternative-sets`)).length })

try {
  await page.goto(exampleUrl())
  await openAssistant()
  const baseline = await countRecords()

  // ---- Test A: an accessory that attaches to an existing system -------------------------------------------------
  const beforeA = new Set((await get(`${concepts}/intents`)).map((i) => i.id))
  let reply = await ask('Design a drill-bit holder that attaches to my cordless drill.')
  check((await operations(reply)).includes('conceptualize.interpret_intent'), `A1 the assistant interprets the intent first (${await operations(reply)})`)
  check(!(await operations(reply)).includes('develop_alternatives') && !(await operations(reply)).includes('conceptualize.create'), 'A1 nothing is designed before the intent (no concept, no alternatives)')
  check((await newIntent(beforeA)) === undefined, 'A1 nothing is stored before Apply (preview policy)')
  await applyAll(reply, 'A1 engineering intent', 1)
  const a = await newIntent(beforeA)
  check(!!a && a.role === 'accessory' && a.integration === 'hosted', `A2 the intent is an accessory that integrates with an existing system (${a?.key}: ${a?.role}, ${a?.integration})`)
  const host = a?.externalSystems?.[0]
  check(host?.identified === false && host.owner === 'external' && host.relation === 'mounts-to' && !host.productElement && host.description.length > 0, 'A2 the host is a description with identified false, no product element and no invented model')
  check(a?.basis === 'ai-hypothesis' && a.provenance?.sourceKind === 'assistant' && a.revision === 1, `A2 the basis is ai-hypothesis, written by the assistant (revision ${a?.revision})`)
  const gapsA = a ? await get(`${concepts}/intents/${a.id}/gaps`) : undefined
  check(gapsA?.counts?.essential === 1 && gapsA.gaps[0]?.text === 'identify host model and mounting features' && gapsA.gaps[0].tier === 'essential', `A3 one essential gap: "${gapsA?.gaps?.[0]?.text}"`)
  check(gapsA?.researchItems?.length === 0 && gapsA?.unaskedEssential?.length === 0, 'A3 nothing can be researched without an identity; the gap is covered by a question')
  const q = a?.questions?.[0]
  check(!!q && q.state === 'open' && q.impact === 'blocks' && q.why.length > 20 && q.options.length === 4 && /drill model/.test(q.text), `A4 a clarification question asks for the drill model with its reason and ${q?.options?.length} options`)
  reply = await ask('ECII A gaps')
  const ops = await operations(reply)
  check(ops.includes('conceptualize.read_context') && ops.includes('conceptualize.identify_gaps'), `A4 the assistant reads the context and identifies the gaps (${ops})`)
  const textA = await answer(reply)
  check(/identify host model and mounting features/.test(textA) && /Which cordless drill model/.test(textA) && /Why: /.test(textA) && /Options: \(1\) .*\(4\) /.test(textA), `A4 the answer asks the question with why and options: ${textA.slice(0, 260)}`)
  const afterA = await countRecords()
  check(afterA.concepts === baseline.concepts && afterA.sets === baseline.sets, 'A5 no concept and no hole-pattern alternatives were created before the host is identified')
  await page.screenshot({ path: `${shots}/01-test-a.png` })

  // ---- Test D: a standalone design object ------------------------------------------------------------------------
  const beforeD = new Set((await get(`${concepts}/intents`)).map((i) => i.id))
  reply = await ask('Design a freestanding drill-bit organizer for my workbench.')
  check((await operations(reply)).includes('conceptualize.interpret_intent'), 'D1 the assistant interprets the intent first')
  await applyAll(reply, 'D1 engineering intent', 1)
  const d = await newIntent(beforeD)
  check(!!d && d.role === 'standalone' && d.integration === 'standalone' && d.externalSystems.length === 0 && d.questions.length === 0, `D1 the intent is standalone with no external systems and no questions (${d?.key})`)
  const gapsD = d ? await get(`${concepts}/intents/${d.id}/gaps`) : undefined
  check(gapsD?.gaps?.length === 0 && gapsD.systemGaps.length === 0 && gapsD.researchItems.length === 0 && gapsD.unaskedEssential.length === 0, 'D2 a standalone intent has no gaps, no host gaps and no research items')
  reply = await ask('ECII D gaps')
  const textD = await answer(reply)
  check((await operations(reply)).includes('conceptualize.identify_gaps') && /0 essential, 0 concept/.test(textD) && /nothing to research/.test(textD), `D2 the assistant finds nothing to ask or research: ${textD.slice(0, 200)}`)
  const afterD = await countRecords()
  check(afterD.concepts === baseline.concepts, 'D2 no question was needed and no concept was created by the intent step')

  // ---- the operations are classified for the access policy ----------------------------------------------------------
  const ctx = await get(`${concepts}/intents/${a?.id}/context`)
  check(ctx.intent?.id === a?.id && ctx.questions?.length === 1 && Array.isArray(ctx.concepts) && Array.isArray(ctx.constraints) && ctx.gaps?.counts?.essential === 1, 'read_context returns the intent with its questions, constraints, concepts and gaps')
  let registered = false
  for (let i = 0; i < 20 && !registered; i++) {
    const registry = (await get(`/api/projects/v1/projects/${P}/artifacts?module=conceptualize&kind=intent&limit=200`)).items ?? []
    registered = registry.some((x) => x.ref?.kind === 'intent' && x.ref.id === a?.id)
    if (!registered) await new Promise((r) => setTimeout(r, 500))
  }
  check(registered, 'the intent is registered in the project artifact registry as kind intent')
} catch (e) {
  check(false, `flow aborted: ${e instanceof Error ? e.message.split('\n')[0] : e}`)
  await page.screenshot({ path: `${shots}/error.png` }).catch(() => undefined)
}

check(problems.length === 0, `no page errors${problems.length ? `: ${problems.join(' | ')}` : ''}`)
await fetch(`${API}/api/assistant/v1/connection?projectId=${P}`, { method: 'DELETE', headers: H })
await browser.close()
console.log(failures ? `[ecii] ${failures} FAILED (structure and plumbing; not reasoning quality)` : '[ecii] ALL PASSED (structure and plumbing; not reasoning quality)')
process.exit(failures ? 1 : 0)
