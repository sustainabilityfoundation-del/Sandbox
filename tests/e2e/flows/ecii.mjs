// ECII increments 1 and 2 regression (docs/specifications/ecii-plan.md section 4, brief Tests A, D and E): engineering intent,
// clarification, architecture-first alternatives, the diversity assessment and the readiness gate through the real workspace,
// assistant service, previews, Apply and the real Conceptualize service.
// The FAKE provider replays tests/e2e/fixtures/fake-scripts/ecii-a.json, ecii-d.json, ecii-e-sensor.json and ecii-e-fan.json.
// These prove STRUCTURE and plumbing (the intent record, the deterministic gaps, the clarification question, the architecture
// blocks, the diversity and readiness computations), NOT reasoning quality: whether a model interprets such a request or
// proposes good architectures is a live evaluation against the rubric.
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
/** The alternatives (current revision) under the Concept whose name matches, with their definitions. */
async function alternativesOf(name) {
  const parent = ((await get(`${concepts}/concepts?text=${encodeURIComponent(name)}&limit=20`)).items ?? []).find((c) => c.name === name)
  if (!parent) return { parent: undefined, members: [] }
  const sets = await get(`${concepts}/alternative-sets?conceptId=${parent.id}`)
  const ids = [...new Set(sets.filter((s) => s.parentId === parent.id).flatMap((s) => s.members.filter((m) => m.status !== 'withdrawn').map((m) => m.conceptId)))]
  return { parent, members: await Promise.all(ids.map((id) => get(`${concepts}/concepts/${id}`))) }
}
const diversity = (parentId) => get(`${concepts}/diversity?parentId=${parentId}&minimum=3`)
const readiness = (intentId, activity, conceptId) => get(`${concepts}/readiness?intentId=${intentId}&activity=${activity}${conceptId ? `&conceptId=${conceptId}` : ''}`)
const DIMENSION = /\b\d+(\.\d+)?\s?(mm|cm|m|in|kg|N)\b/

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

  // ---- Test A, A6 to A8 (increment 2): architectures before dimensions, diversity, readiness -----------------------------
  reply = await ask('ECII A architectures')
  check((await operations(reply)).includes('conceptualize.develop_alternatives'), `A6 the assistant proposes mounting architectures (${await operations(reply)})`)
  const previewA = (await reply.textContent()) ?? ''
  check(/Readiness \(advisory\)/.test(previewA) && /Provisional: readiness is Exploratory/.test(previewA), 'A7 the preview labels the architectures provisional: readiness is Exploratory')
  check((await alternativesOf('Holder mounting architectures')).parent === undefined, 'A6 nothing is stored before Apply (preview policy)')
  await applyAll(reply, 'A6 mounting architectures', 1)
  const archA = await alternativesOf('Holder mounting architectures')
  const blocksA = archA.members.map((m) => m.definition?.architecture)
  check(archA.members.length === 3 && blocksA.every((b) => b?.level === 'architecture' && b.hostInterface && b.attachmentPrinciple && b.loadPath && b.installationRemoval), `A6 three architectures, each with a host interface, attachment principle, load path and installation (${archA.members.map((m) => m.key).join(', ')})`)
  check(blocksA.every((b) => b?.evidenceRequired?.length && b.assumptions?.length && b.disadvantages?.length && b.risks?.length), 'A7 each architecture names its assumptions, risks, disadvantages and the evidence required (host-specific verification)')
  check(archA.members.every((m) => m.provenance?.sourceKind === 'assistant') && !DIMENSION.test(JSON.stringify(blocksA)), 'A8 recorded by the assistant, and no host dimension is invented in the architecture fields')
  const divA = archA.parent ? await diversity(archA.parent.id) : undefined
  check(divA?.distinctCount === 3 && divA.verdict === 'diverse' && divA.variants.length === 0, `A8 the service finds three distinct architectures (${divA?.distinctCount}, ${divA?.verdict})`)
  const gateA = a ? await readiness(a.id, 'host-specific-concepts', archA.members[0]?.id) : undefined
  const archGateA = a ? await readiness(a.id, 'architecture-concepts', archA.members[0]?.id) : undefined
  check(gateA?.level === 'exploratory' && gateA.activities[0].met === false && /identify host model and mounting features/.test(JSON.stringify(gateA.activities[0].unmet)) && archGateA?.activities[0].met === true, 'A7 readiness is Exploratory: architecture concepts are allowed, host-specific concepts wait for the host to be identified')
  reply = await ask('ECII A readiness')
  const textAR = await answer(reply)
  check(/3 distinct architectures \(diverse\)/.test(textAR) && /Readiness: exploratory/.test(textAR) && /identify host model and mounting features/.test(textAR) && /provisional/i.test(textAR), `A7 the assistant reports diversity, readiness and what is unmet: ${textAR.slice(0, 240)}`)
  reply = await ask('ECII A variants')
  await applyAll(reply, 'A8 variants of one architecture', 1)
  reply = await ask('ECII A variant check')
  const textAV = await answer(reply)
  const variantsA = await alternativesOf('Holder mounting architectures')
  const divAV = variantsA.parent ? await diversity(variantsA.parent.id) : undefined
  check(variantsA.members.length === 5 && divAV?.distinctCount === 3 && divAV.variants.length === 2 && divAV.variants.every((v) => v.parentId) && /Still 3 distinct architectures/.test(textAV), `A8 two parameter-only layouts are variants of one architecture, not new architectures (${divAV?.distinctCount} distinct, ${divAV?.variants?.length} variants): ${textAV.slice(0, 160)}`)
  await page.screenshot({ path: `${shots}/02-test-a-architectures.png` })

  // ---- Test D: a standalone design object ------------------------------------------------------------------------
  const baselineD = await countRecords()
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
  check(afterD.concepts === baselineD.concepts, 'D2 no question was needed and no concept was created by the intent step')
  // D3: standalone concepts, without any host interface.
  reply = await ask('ECII D architectures')
  await applyAll(reply, 'D3 standalone architectures', 1)
  const archD = await alternativesOf('Organizer architectures')
  const blocksD = archD.members.map((m) => m.definition?.architecture)
  check(archD.members.length === 3 && blocksD.every((b) => b?.level === 'architecture' && b.hostInterface === ''), 'D3 three standalone architectures, none with a host interface')
  const divD = archD.parent ? await diversity(archD.parent.id) : undefined
  check(divD?.distinctCount === 3 && divD.verdict === 'diverse', 'D3 the service finds them distinct')
  const gateD = d ? await readiness(d.id, 'cad-handoff', archD.members[0]?.id) : undefined
  check(gateD?.level === 'interfaces-verified' && gateD.provisional === false, 'D3 a standalone design object has no outside interface to verify: not provisional')
  reply = await ask('ECII D readiness')
  const textDR = await answer(reply)
  check(/3 distinct standalone architectures \(diverse\)/.test(textDR) && /Interfaces Verified; 4 of 4 activities are ready/.test(textDR), `D3 the assistant reports it: ${textDR.slice(0, 200)}`)

  // ---- Test E: two unrelated integration problems ---------------------------------------------------------------------
  const beforeS = new Set((await get(`${concepts}/intents`)).map((i) => i.id))
  reply = await ask('Design a bracket that mounts a vibration sensor to an existing industrial machine.')
  check((await operations(reply)).includes('conceptualize.interpret_intent'), 'E1 (sensor bracket) the assistant interprets the intent first')
  await applyAll(reply, 'E1 sensor intent', 1)
  const s = await newIntent(beforeS)
  check(s?.integration === 'hosted' && s.externalSystems?.[0]?.identified === false && s.externalSystems[0].relation === 'mounts-to', 'E1 (sensor bracket) an accessory of a machine that is not identified')
  reply = await ask('ECII E sensor architectures')
  await applyAll(reply, 'E2 sensor architectures', 1)
  const archS = await alternativesOf('Sensor mounting architectures')
  check(archS.members.length === 3 && archS.members.every((m) => m.definition?.architecture?.hostInterface && m.definition.architecture.evidenceRequired.length), 'E2 (sensor bracket) three architectures with their host interface and evidence required')
  reply = await ask('ECII E sensor readiness')
  const textES = await answer(reply)
  check(/3 distinct architectures \(diverse\)/.test(textES) && /Provisional: readiness is Exploratory/.test(textES), `E3 (sensor bracket) distinct architectures, readiness Exploratory and provisional: ${textES.slice(0, 200)}`)

  const beforeF = new Set((await get(`${concepts}/intents`)).map((i) => i.id))
  reply = await ask('Design a cooling fan module that integrates into my electronic enclosure.')
  check((await operations(reply)).includes('conceptualize.interpret_intent'), 'E1 (fan module) the assistant interprets the intent first')
  await applyAll(reply, 'E1 fan intent', 1)
  const f = await newIntent(beforeF)
  check(f?.integration === 'embedded' && f.externalSystems?.[0]?.identified === true && f.externalSystems[0].owner === 'project', 'E1 (fan module) embedded in an identified enclosure owned by the project')
  const gapsF = f ? await get(`${concepts}/intents/${f.id}/gaps`) : undefined
  check(gapsF?.counts?.essential === 0 && gapsF.counts.detail === 1, 'E1 (fan module) no essential gap; the hole pattern is a detail to measure')
  reply = await ask('ECII E fan architectures')
  await applyAll(reply, 'E2 fan architectures', 1)
  const archF = await alternativesOf('Fan integration architectures')
  check(archF.members.length === 3, 'E2 (fan module) three architectures')
  reply = await ask('ECII E fan readiness')
  const textEF = await answer(reply)
  const gateF = f ? await readiness(f.id, 'host-specific-concepts', archF.members[0]?.id) : undefined
  const cadF = f ? await readiness(f.id, 'cad-handoff', archF.members[0]?.id) : undefined
  check(/3 distinct architectures \(diverse\)/.test(textEF) && /Provisional: readiness is Context Established/.test(textEF) && gateF?.level === 'context-established' && gateF.activities[0].met === true && cadF?.activities[0].met === false, `E3 (fan module) the same workflow reaches Context Established and stays provisional for the CAD handoff: ${textEF.slice(0, 200)}`)

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
