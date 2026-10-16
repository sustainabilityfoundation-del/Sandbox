// Visual concept exploration (concept-visualization.md §9) in the real workspace on the real API and PostgreSQL:
// a clean project, an engineering problem and constraint, three alternatives with structured layouts proposed by
// the assistant operation and applied, comparison cards, annotation and refinement into new revisions, staleness,
// selection and rejection with rationale, CAD handoff, illustration refusal and the FAKE TEST image port, reopen.
//
// The assistant operations run headless through the workspace executor with model-style arguments from
// fixtures/concept-visual/drill-holder.json (no model). The illustration part uses an in-page FAKE port labelled
// TEST until services/visualization is on main (then: the service's fake-test adapter). Never a real account.
//
// Start the stack first (`npm run dev`). Run: `npm run e2e -- concept-visual`.
import { readFileSync } from 'node:fs'
import { env, launchOptions, shotsDir, demoAssistantContext } from '../lib/env.mjs'
import { chromium } from 'playwright-core'

const fixture = JSON.parse(readFileSync(new URL('../fixtures/concept-visual/drill-holder.json', import.meta.url), 'utf8'))
const shots = shotsDir('concept-visual')
const stamp = Date.now().toString(36).toUpperCase().slice(-5)
const KEY = `CV-${stamp}`
const H = { 'x-dev-user': 'eli', 'content-type': 'application/json' }
let failures = 0
const check = (cond, msg) => (console.log(`[concept-visual] ${cond ? 'PASS' : 'FAIL'} ${msg}`), cond || failures++)
const call = async (method, path, body) => {
  const r = await fetch(`${env.api}${path}`, { method, headers: { ...H, 'idempotency-key': `cv-${Date.now()}-${Math.random()}` }, body: body ? JSON.stringify(body) : undefined })
  const text = await r.text()
  return { status: r.status, body: text ? JSON.parse(text) : undefined }
}

// 1. A clean project.
const project = await call('POST', '/api/projects/v1/projects', { key: KEY, name: `Concept visual flow ${stamp}`, description: 'tests/e2e/flows/concept-visual.mjs', templateId: 'blank' })
check(project.status === 201, `clean project ${KEY} created (${project.status})`)
const PID = project.body?.id ?? project.body?.key ?? KEY
const CON = `/api/concepts/v1/projects/${encodeURIComponent(PID)}`

// The illustration request is an "external generation" operation (off by default): allow it for eli in this
// project for the duration of the flow, restored at the end. The FAKE TEST port never reaches a provider.
const settings = async (value) => {
  const cur = await fetch(`${env.api}/api/settings/v1/values?projectId=${encodeURIComponent(PID)}`, { headers: H }).then((r) => r.json())
  const r = await fetch(`${env.api}/api/settings/v1/users/me/values?projectId=${encodeURIComponent(PID)}`, { method: 'PUT', headers: { ...H, 'if-match': cur.user.etag }, body: JSON.stringify({ values: { 'ai.operations.external-generation': value } }) })
  return r.status
}
const previous = await fetch(`${env.api}/api/settings/v1/values?projectId=${encodeURIComponent(PID)}`, { headers: H }).then((r) => r.json())
const previousValue = previous.user?.values?.['ai.operations.external-generation'] ?? null
check((await settings(true)) === 200, 'external generation allowed for the flow (restored at the end)')

const browser = await chromium.launch({ ...launchOptions })
const problems = []
async function open() {
  const ctx = await demoAssistantContext(browser, { viewport: { width: 1600, height: 1100 } })
  await ctx.addInitScript(() => {
    if (!sessionStorage.getItem('pw-init')) {
      localStorage.clear()
      sessionStorage.setItem('pw-init', '1')
    }
    localStorage.setItem('ews.services.v1', JSON.stringify({ requirementsMode: 'api', devUser: 'eli' }))
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => problems.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && problems.push(m.text().slice(0, 300)))
  await page.goto(`${env.base}?project=${encodeURIComponent(PID)}&tool=conceptualize`)
  await page.waitForSelector('.con-shell', { timeout: 60000 })
  return page
}
let page = await open()

// Headless assistant operations through the workspace executor (same validation as the UI), applied like Apply.
const assistant = (name, args, apply = true) =>
  page.evaluate(
    async ({ name, args, apply }) => {
      const { executeToolCall } = await import('/workspace/src/assistant/executor.ts')
      const { createWorkspaceEnvironment } = await import('/workspace/src/assistant/environment.ts')
      const { captureContext } = await import('/workspace/src/assistant/conversation.ts')
      const { serviceHandlers } = await import('/workspace/src/assistant/serviceProposals.ts')
      const proposals = new Map()
      let seq = 0
      const envw = createWorkspaceEnvironment({ createProposal: (d) => { const p = { ...d, id: `CV-${Date.now()}-${++seq}`, status: 'pending', changes: d.changes ?? [] }; proposals.set(p.id, p); return p }, getProposal: (id) => proposals.get(id) })
      const out = await executeToolCall({ id: `cv-${name}`, name, arguments: args }, { captured: captureContext(false), source: { kind: 'conversation', conversationId: 'C-CONCEPT-VISUAL', messageId: 'M1', label: 'concept-visual flow' }, env: envw })
      if (!out.ok || !apply || !out.proposalId) return { ok: out.ok, error: out.error, data: out.data, proposalId: out.proposalId }
      const h = serviceHandlers(out.proposalId)
      const res = await h.apply({ conversationId: 'C-CONCEPT-VISUAL', proposalId: out.proposalId, messageId: 'M1' })
      return { ok: true, summary: res.summary, createdIds: res.createdIds }
    },
    { name, args, apply },
  )

// 2–4. Problem, constraint, three alternatives with layouts (assistant operation, applied).
const missing = await assistant('conceptualize.develop_alternatives', { text: fixture.text }, false)
check(!missing.ok && /name and summary each/.test(missing.error ?? ''), 'develop_alternatives refuses without model-written alternatives')
const developed = await assistant('conceptualize.develop_alternatives', { text: fixture.text, name: fixture.name, statements: fixture.statements, alternatives: fixture.alternatives, tradeStudy: fixture.tradeStudy, visuals: { layout: true } })
check(developed.ok && /Visuals: CON-\d+: layout VIS-\d+; CON-\d+: layout VIS-\d+; CON-\d+: layout VIS-\d+/.test(developed.summary ?? ''), `three alternatives with layouts recorded (${developed.summary ?? developed.error})`)
const sets = (await call('GET', `${CON}/alternative-sets`)).body
const set = sets.find((s) => s.name.includes(fixture.name))
const cards = (await call('GET', `${CON}/alternative-sets/${set.id}/cards`)).body.cards
const [A, B, C] = cards
const parent = set.parentId
const cst = await call('POST', `${CON}/constraints`, { kind: 'dimensional', statement: 'Length along the drill at most 85 mm', bound: { symbol: 'block_l', operator: '<=', quantity: { value: 85, unit: 'mm' } }, subjects: cards.map((c) => ({ module: 'conceptualize', type: 'concept', id: c.concept.id })) })
check(cst.status === 201, 'an initial constraint (length at most 85 mm) applies to every alternative')

// 5. Compare in the UI.
await page.getByRole('radiogroup', { name: 'Conceptualize page' }).getByText('Visual comparison').click()
await page.waitForSelector('.cv-card svg.cv-layout', { timeout: 30000 })
await page.waitForFunction(() => document.querySelectorAll('.cv-card svg.cv-layout').length >= 3, null, { timeout: 30000 })
const shown = await page.$$eval('.cv-card', (els) => els.map((e) => ({ key: e.getAttribute('data-concept-key'), dims: [...e.querySelectorAll('.cv-dimension text')].map((t) => t.textContent), ids: [...e.querySelectorAll('[data-component-id]')].map((g) => g.getAttribute('data-component-id')), diff: e.querySelectorAll('.cv-diff, .cv-highlight').length })))
check(shown.length === 3, `three concept cards (${shown.map((s) => s.key).join(', ')})`)
const label = (p) => `${p.symbol} = ${p.value} ${p.unit}`
const expectDims = (card) => card.visuals[0] && fixture.alternatives.find((a) => a.name === card.concept.name).definition.layout.dimensions.map((d) => label(card.parameters.find((p) => p.id === d.parameterId)))
for (const [i, card] of cards.entries()) {
  const s = shown.find((x) => x.key === card.concept.key)
  check(JSON.stringify(s?.dims.map((d) => d.replace(' (n.t.s.)', ''))) === JSON.stringify(expectDims(card)), `${card.concept.key}: dimension labels equal their parameters (${s?.dims.join(' | ')})`)
  check(JSON.stringify(s?.ids) === JSON.stringify(fixture.alternatives[i].definition.layout.items.map((it) => it.componentId)), `${card.concept.key}: layout elements carry the stable component IDs`)
}
check(shown.every((s) => s.diff > 0), 'differences between the alternatives are highlighted on every card')
const cardText = await page.locator('.cv-card').first().textContent()
check(/Intended/.test(cardText) && /Benefits and trade-offs/.test(cardText) && /Components and interfaces/.test(cardText), 'cards show components, benefits and trade-offs, and the constraint as intended (no check recorded)')
await page.screenshot({ path: `${shots}/01-comparison.png`, fullPage: true })

// 6. Annotate and refine option A in the UI.
const cardA = page.locator(`.cv-card[data-concept-key="${A.concept.key}"]`)
await cardA.getByRole('button', { name: 'Refine' }).click()
await page.waitForSelector('.cv-refine svg.cv-layout')
const c1 = page.locator('.cv-refine svg.cv-layout [data-component-id="C1"] rect')
await c1.scrollIntoViewIfNeeded()
const box = await c1.boundingBox()
// A point on the block outside the pocket row (C2 lies inside C1).
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.1)
const picked = await page.locator('.cv-refine').textContent()
check(/on C1 \(structured component ID\)/.test(picked), 'a pin on the layout names the structured component C1')
await page.locator('.cv-refine').getByLabel('Instruction').fill('Shorten the block to fit the 85 mm limit')
await page.locator('.cv-refine').getByRole('button', { name: /Save annotation on revision 1/ }).click()
await page.waitForFunction(() => document.querySelectorAll('.cv-refine .cv-annotation[data-annotation]').length === 1, null, { timeout: 15000 })
await page.locator('.cv-refine').getByLabel('block_l (mm)').fill('78')
await page.locator('.cv-refine').getByRole('button', { name: /Apply: new Concept revision/ }).click()
await page.locator('.cv-refine').getByText(/is now revision/).waitFor({ timeout: 20000 })
const visA = (await call('GET', `${CON}/visuals?conceptId=${A.concept.id}`)).body.find((v) => v.kind === 'layout')
const v1 = (await call('GET', `${CON}/visuals/${visA.id}?revision=1`)).body
check(visA.revision === 2 && visA.annotations.length === 0 && v1.annotations.length === 1 && visA.refinedFrom[0] === v1.annotations[0].id, `refinement made layout revision 2 from Concept revision ${visA.conceptRevision}; the annotation stays on revision 1 (${v1.annotations[0]?.instruction})`)
check(v1.annotations[0]?.componentId === 'C1' && v1.annotations[0]?.componentBasis === 'structured', 'the stored annotation has normalized coordinates and the structured component ID')
await page.waitForFunction((k) => [...document.querySelectorAll(`.cv-card[data-concept-key="${k}"] .cv-dimension text`)].some((t) => t.textContent.startsWith('block_l = 78 mm')), A.concept.key, { timeout: 20000 })
check(true, 'the card now shows block_l = 78 mm from the new revision')
await page.screenshot({ path: `${shots}/02-refined.png`, fullPage: true })
await page.locator('.cv-refine').getByRole('button', { name: 'Close' }).click()

// Staleness: a parameter change on B marks its layout possibly outdated; re-render on request.
const bNow = (await call('GET', `${CON}/concepts/${B.concept.id}`)).body
const params = bNow.definition.parameters.map((p) => (p.symbol === 'block_w' ? { ...p, value: 34 } : p))
await call('PATCH', `${CON}/concepts/${B.concept.id}`, { expectedRevision: bNow.revision, definition: { ...bNow.definition, idSeq: undefined, parameters: params }, reason: 'Wider block' })
const cardB = page.locator(`.cv-card[data-concept-key="${B.concept.key}"]`)
await cardB.getByText('Possibly outdated').waitFor({ timeout: 20000 })
check(/block_w = 34 mm/.test(await cardB.textContent()), 'the changed parameter is named in the "possibly outdated" notice; nothing was redrawn')
await cardB.getByRole('button', { name: 'Re-render as a new revision' }).click()
await cardB.getByText('Possibly outdated').waitFor({ state: 'detached', timeout: 20000 })
check(true, 're-rendering on request makes a new current layout revision')

// 7. Selection and rejection with rationale.
await cardA.getByRole('button', { name: 'Select' }).click()
await page.getByRole('dialog').getByLabel('Rationale (required)').fill('Shortest single-part option within the 85 mm limit')
await page.getByRole('dialog').getByRole('button', { name: /Record decision|Propose decision/ }).click()
await page.getByRole('dialog').waitFor({ state: 'detached' })
await page.locator(`.cv-card[data-concept-key="${C.concept.key}"]`).getByRole('button', { name: 'Reject…' }).click()
await page.getByRole('dialog').getByLabel('Rationale (required)').fill('Too many parts and an uncertain magnet')
await page.getByRole('dialog').getByRole('button', { name: /Record decision|Propose decision/ }).click()
await page.getByRole('dialog').waitFor({ state: 'detached' })
const decisions = (await call('GET', `${CON}/decisions`)).body
check(decisions.some((d) => d.outcomes.some((o) => o.conceptId === A.concept.id && o.outcome === 'accepted')) && decisions.some((d) => d.outcomes.some((o) => o.conceptId === C.concept.id && o.outcome === 'rejected' && /magnet/.test(o.rationale ?? ''))), 'the selection and the rejection are decisions with their rationale; the rejected alternative stays')

// 8. CAD handoff (UI) and through the assistant.
await cardA.getByRole('button', { name: 'CAD handoff' }).click()
await page.getByRole('dialog').getByRole('button', { name: /Build handoff/ }).click()
await page.getByRole('dialog').getByText(/^Unresolved \(/).waitFor({ timeout: 20000 })
await page.screenshot({ path: `${shots}/03-handoff.png` })
await page.getByRole('dialog').getByRole('button', { name: 'Close' }).last().click()
const handoffs = (await call('GET', `${CON}/handoffs?conceptId=${A.concept.id}`)).body
const pkg = handoffs.at(-1)?.package
check(pkg?.schema === 'conceptualize.cad-handoff/1' && pkg.parameters.some((p) => p.symbol === 'block_l' && p.value === 78) && pkg.decisions.some((d) => d.outcome === 'accepted') && pkg.constraints.length === 1, 'the handoff carries the refined parameters, the decision and the constraint')
check(pkg?.unresolved.some((u) => u.kind === 'open-question') && pkg.unresolved.some((u) => u.kind === 'unchecked-constraint'), 'missing information is listed as unresolved (open question, unchecked constraint), not invented')
const viaAi = await assistant('conceptualize.create_cad_handoff', { conceptId: A.concept.key })
check(viaAi.ok && /HND-\d+ built from/.test(viaAi.summary ?? ''), `the assistant builds the same handoff (${viaAi.summary ?? viaAi.error})`)

// Illustrations: refused with the reason when no visualization service is connected; then the FAKE TEST port.
const refused = await assistant('conceptualize.request_illustration', { conceptId: A.concept.key }, false)
check(!refused.ok && /not connected/.test(refused.error ?? ''), `an illustration is refused with the reason and no placeholder (${refused.error})`)
await page.evaluate(async (repoFs) => {
  const { registerVisualizationPort } = await import(`/workspace/@fs/${repoFs}/packages/tool-conceptualize/src/visualization.ts`)
  let n = 0
  const job = (state, id) => ({ id, state, adapter: 'fake-test', provider: { id: 'fake-test', name: 'FAKE TEST adapter', model: 'fake-1', method: null }, attempt: 1, clientRef: null, error: null, testAsset: true, output: state === 'succeeded' ? { asset: { id: `test-asset-${id}`, sha256: 'f'.repeat(64), mediaType: 'image/svg+xml', testAsset: true } } : null })
  registerVisualizationPort({
    adapters: async () => ({ adapters: [{ id: 'fake-test', name: 'FAKE TEST adapter', available: true, testOnly: true, costNote: 'test only', limitations: ['TEST ASSET'] }], defaultAdapter: 'fake-test' }),
    createJob: async () => ({ job: job('succeeded', `fake-${++n}`), created: true }),
    getJob: async (_p, id) => job('succeeded', id),
    cancel: async (_p, id) => job('cancelled', id),
    retry: async (_p, id) => job('succeeded', id),
    contentUrl: () => '',
  })
}, env.repoFs)
const ill = await assistant('conceptualize.request_illustration', { conceptId: A.concept.key })
check(ill.ok && /illustration job fake-1 succeeded/.test(ill.summary ?? ''), `with the FAKE TEST port the illustration is recorded (${ill.summary ?? ill.error})`)
const illV = (await call('GET', `${CON}/visuals?conceptId=${A.concept.id}`)).body.find((v) => v.kind === 'illustration')
check(illV?.generation?.testAsset === true && illV.notToScale === true && illV.generation.assetSha256 === 'f'.repeat(64), 'the illustration revision stores the asset reference only, marked TEST ASSET and not to scale')

// 10. Reopen: everything is restored from the server.
await page.context().close()
page = await open()
await page.getByRole('radiogroup', { name: 'Conceptualize page' }).getByText('Visual comparison').click()
await page.waitForFunction(() => document.querySelectorAll('.cv-card svg.cv-layout').length >= 3, null, { timeout: 30000 })
const reopened = await page.locator(`.cv-card[data-concept-key="${A.concept.key}"]`).textContent()
check(/selected/.test(reopened) && /block_l = 78 mm/.test(reopened) && /TEST ASSET/.test(reopened + (await page.locator(`.cv-card[data-concept-key="${A.concept.key}"]`).getByRole('button', { name: 'Expand' }).click().then(() => page.locator(`.cv-card[data-concept-key="${A.concept.key}"]`).textContent()))), 'after reopening: selection, refined layout and the TEST illustration are restored')
const rej = await page.locator(`.cv-card[data-concept-key="${C.concept.key}"]`).getAttribute('class')
check(/is-rejected/.test(rej ?? '') || decisions.length >= 2, 'the rejected alternative is kept with its decision')
await page.screenshot({ path: `${shots}/04-reopened.png`, fullPage: true })
void parent

check((await settings(previousValue)) === 200, 'AI settings restored')
check(problems.length === 0, `no page errors${problems.length ? `: ${problems.join(' | ')}` : ''}`)
await browser.close()
console.log(failures ? `[concept-visual] ${failures} FAILED` : '[concept-visual] ALL PASSED')
process.exit(failures ? 1 : 0)
