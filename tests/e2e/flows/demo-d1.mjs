// Demonstration D1 PLUMBING test (docs/specifications/demo-ai-engineering.md). The FAKE provider replays a
// recorded tool-call script (tests/e2e/fixtures/fake-scripts/d1-plumbing.json) through the real workspace,
// assistant service, policy, previews, Apply and the real module services (Project Management, Conceptualize,
// Requirements, System Model, CAD with the OCCT kernel). It proves the plumbing; it is NOT a model run and
// does NOT count as D1 acceptance. The live run with a real model follows docs/modules/ai-interface/d1-live-run.md.
//
// Start the stack with the fake provider and its scripts: `npm run ai:dev:fake`
// (sets EWS_ASSISTANT_FAKE_PROVIDER=1 and EWS_ASSISTANT_FAKE_SCRIPTS=tests/e2e/fixtures/fake-scripts).
// Run: `npm run e2e -- demo-d1` (E2E_BASE / E2E_API for other ports). Each run creates a new project (D1-xxxxx);
// it resets the AI connection of development user eli.
import { readFileSync, writeFileSync } from 'node:fs'
import { env, launchOptions, shotsDir, exampleUrl } from '../lib/env.mjs'
import { chromium } from 'playwright-core'

/** D1 steps that the replayed script cannot exercise yet (owners in demo-ai-engineering.md §3). Reported, not failed. */
const PENDING = [
  'decision on the alternatives (conceptualize.propose_decision) is not part of the replayed script yet',
  'storing the STEP file as a project document: projects.store_document needs a file hand-off from CAD (CR-PM-SDK-4)',
  'service restart in the middle of the run: run the flow again after restarting; the read-back below is from the services',
]

const API = env.api
const H = { 'x-dev-user': 'eli' }
const KEY = `D1-${Date.now().toString(36).slice(-5).toUpperCase()}`
const shots = shotsDir('demo-d1')
let failures = 0
const check = (cond, msg) => (console.log(`[demo-d1] ${cond ? 'PASS' : 'FAIL'} ${msg}`), cond || failures++)
const json = async (r) => (r.headers.get('content-type')?.includes('json') ? r.json() : r.text())
const get = async (path) => json(await fetch(`${API}${path}`, { headers: H }))

// Preconditions: fake provider with the recorded script.
const providers = await get('/api/assistant/v1/providers')
if (!providers.providers?.some((p) => p.id === 'fake')) {
  console.error('[demo-d1] FAIL the fake provider is not registered: start the stack with npm run ai:dev:fake.')
  process.exit(1)
}
await fetch(`${API}/api/assistant/v1/connection?projectId=PRJ-ACT100`, { method: 'DELETE', headers: H })
const connected = await fetch(`${API}/api/assistant/v1/connection/api-key?projectId=PRJ-ACT100`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'fake', apiKey: 'fake-d1-plumbing-key' }) })
check(connected.status === 201, 'connected development user eli to the fake provider')

const browser = await chromium.launch({ ...launchOptions, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
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
const replies = []

async function openAssistant() {
  await page.waitForSelector('.ws-app', { timeout: 60000 })
  await page.click('[data-dock-tab="assistant"]')
  await page.waitForSelector('[data-testid="assistant-connection"][data-assistant-kind="remote"]', { timeout: 30000 })
}
const lastReply = () => page.locator('.as-assistant').last()
async function ask(text) {
  await page.fill('.as-input textarea', text)
  await page.press('.as-input textarea', 'Enter')
  await page.waitForFunction(() => {
    const msgs = [...document.querySelectorAll('.as-assistant')]
    const last = msgs[msgs.length - 1]
    return last && !last.querySelector('.as-thinking') && (last.querySelector('.as-text') || last.querySelector('.as-note'))
  }, null, { timeout: 120000 })
  await page.waitForTimeout(800) // proposals are saved asynchronously
  const reply = lastReply()
  replies.push({ ask: text, operations: await operations(reply), text: (await reply.textContent())?.slice(0, 2000) })
  return reply
}
/** Applies every pending card of a reply, one by one; returns the events. */
async function applyAll(reply, label, expected) {
  const events = []
  await reply.getByRole('button', { name: 'Apply', exact: true }).first().waitFor({ timeout: 20000 }).catch(() => {})
  for (let i = 0; i < 10; i++) {
    const button = reply.getByRole('button', { name: 'Apply', exact: true }).first()
    if (!(await button.count())) break
    const before = await page.locator('.as-event').count()
    await button.click()
    await page.waitForFunction((n) => document.querySelectorAll('.as-event').length > n, before, { timeout: 60000 })
    events.push(await page.locator('.as-event').last().textContent())
  }
  const ok = events.length === expected && events.every((e) => /^Applied /.test(e.trim()))
  check(ok, `${label}: ${events.length}/${expected} proposal(s) applied (${events.map((e) => e.trim().slice(0, 90)).join(' | ')})`)
  return events
}
const operations = async (reply) => (await reply.locator('.as-step-name').allTextContents()).join(', ')
/** Measured values carry floating-point noise (9 - 6.6 = 2.3999999999999986). */
const near = (text, value) => text !== undefined && Math.abs(Number(text) - value) < 1e-6
const answer = async (reply) => (await reply.locator('.as-text').last().textContent()) ?? ''

try {
  // Step 1: a new project through Project Management, then open it (the window reloads into it).
  await page.goto(exampleUrl())
  await openAssistant()
  let reply = await ask(`D1 project ${KEY}`)
  check((await operations(reply)).includes('projects.create'), 'the model requested projects.create; nothing changed before Apply')
  await applyAll(reply, 'create the project', 1)
  reply = await ask(`D1 open ${KEY}`)
  // The window starts on the example (?project=PRJ-ACT100); wait until it has moved to another project.
  const navigated = page.waitForURL((u) => { const id = new URL(u).searchParams.get('project'); return !!id && id !== 'PRJ-ACT100' }, { timeout: 30000 })
  await applyAll(reply, 'open the project', 1).catch(() => [])
  await navigated
  const projectId = new URL(page.url()).searchParams.get('project')
  await openAssistant()
  const listed = await get(`/api/projects/v1/projects?q=${KEY}`)
  const project = (listed.items ?? []).find((p) => p.key === KEY)
  check(!!project && project.id === projectId, `the window works in the new project ${KEY} (${projectId})`)
  const P = projectId

  // Step 1b (ECII increment 1): the engineering intent comes first (is the design object standalone or does it integrate
  // with an existing system?). The service stores the structure; the gaps are computed from it.
  reply = await ask('D1 intent')
  check((await operations(reply)).includes('conceptualize.interpret_intent'), 'the model interpreted the engineering intent first')
  await applyAll(reply, 'engineering intent', 1)
  const intents = await get(`/api/concepts/v1/projects/${P}/intents`)
  const intentGaps = intents[0] ? await get(`/api/concepts/v1/projects/${P}/intents/${intents[0].id}/gaps`) : undefined
  check(intents.length === 1 && intents[0].integration === 'hosted' && intents[0].externalSystems?.[0]?.identified === false && intents[0].basis === 'ai-hypothesis' && intentGaps?.counts?.essential === 1, `the intent is stored as an AI hypothesis with its gaps (${intents[0]?.key}, ${intents[0]?.integration}, ${intentGaps?.counts?.essential} essential gap(s))`)

  // Step 2: concept from the need, then functions, constraints and an assumption.
  reply = await ask('D1 concept: a holder block for six hex-shank bits on a cordless drill')
  await applyAll(reply, 'concept', 1)
  reply = await ask('D1 functions and constraints')
  check((await operations(reply)).startsWith('conceptualize.search'), `read before proposing (${await operations(reply)})`)
  await applyAll(reply, 'function, constraints and assumption', 4)
  await page.screenshot({ path: `${shots}/01-concept.png` })

  // Step 3: requirements with origin; step 4: architecture (product element, SysML project); allocation and link.
  reply = await ask('D1 requirements')
  await applyAll(reply, 'requirements (stakeholder and AI-proposed)', 2)
  reply = await ask('D1 architecture')
  await applyAll(reply, 'product element and SysML project', 2)
  // AUD-5: the System Model matrix before the managed requirements are brought in: empty, and it says why.
  const matrixContext = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  await matrixContext.addInitScript(() => localStorage.setItem('ews.services.v1', JSON.stringify({ requirementsMode: 'api', devUser: 'eli' })))
  const matrixPage = await matrixContext.newPage()
  const openMatrix = async () => {
    await matrixPage.goto(`${env.base}?project=${encodeURIComponent(P)}&tool=sysml-modeler`)
    await matrixPage.waitForSelector('.smod-statusbar', { timeout: 60000 })
    // The Matrix tab can sit in the toolbar overflow ("More actions").
    if (await matrixPage.getByRole('button', { name: 'Matrix', exact: true }).count()) await matrixPage.getByRole('button', { name: 'Matrix', exact: true }).first().click()
    else {
      await matrixPage.getByRole('button', { name: 'More actions' }).click()
      await matrixPage.getByRole('menuitem', { name: /Matrix/ }).click()
    }
    await matrixPage.waitForSelector('[data-help-id="sysml-modeler.matrix"]', { timeout: 20000 })
    await matrixPage.waitForTimeout(1500)
  }
  await openMatrix()
  const emptyText = (await matrixPage.locator('[data-help-id="sysml-modeler.matrix"]').first().textContent()) ?? ''
  check(emptyText.includes('Managed requirements appear here once they are brought into the System Model') && /This project has 2 managed requirements/.test(emptyText), 'the empty matrix says that managed requirements appear once they are brought into the System Model (2 in this project)')
  check(await matrixPage.getByRole('button', { name: 'Bring in managed requirements' }).first().isEnabled(), 'the empty matrix offers the bridge action')
  await matrixPage.screenshot({ path: `${shots}/matrix-before.png` })
  reply = await ask('D1 allocate')
  check((await operations(reply)).includes('sysml-modeler.import_requirement'), `the model brings the managed requirements into the System Model (${await operations(reply)})`)
  await applyAll(reply, 'allocation of both requirements, SysML product-element link and managed requirements in the System Model', 4)
  const reqAll = await get(`/api/requirements/v1/projects/${P}/requirements`)
  check(reqAll.items?.length === 2 && reqAll.items.map((r) => r.origin).sort().join() === 'ai-proposed,stakeholder', `both requirements keep their origin (${reqAll.items?.map((r) => `${r.key}:${r.origin}`).join(', ')})`)
  // The satisfy matrix through the API: REQ-001 and REQ-002 are rows, each satisfied by HolderBlock (filled cells), one element each.
  const sysmlProject = (await get(`/api/sysml/v1/projects?platformProjectId=${encodeURIComponent(P)}`))[0]
  const sysmlHead = (await get(`/api/sysml/v1/projects/${sysmlProject['@id']}/commits?limit=1`))[0]['@id']
  const modelText = (await get(`/api/sysml/v1/projects/${sysmlProject['@id']}/commits/${sysmlHead}/text`)).text
  const rows = [...modelText.matchAll(/requirement <'(REQ-\d+)'> '\1' \{\s*@EWS::ManagedRequirement \{[^}]*requirementId = "([0-9a-f-]{36})";[^}]*revision = (\d+);[^}]*requirementKey = "\1";[^}]*title = "([^"]+)";/g)].map((m) => ({ key: m[1], id: m[2], revision: Number(m[3]), title: m[4] }))
  const cells = [...modelText.matchAll(/satisfy '(REQ-\d+)' by HolderBlock;/g)].map((m) => m[1])
  check(rows.map((r) => r.key).join() === 'REQ-001,REQ-002' && cells.join() === 'REQ-001,REQ-002' && new Set(rows.map((r) => r.id)).size === 2, `the satisfy matrix has 2 rows with filled cells through the API (${rows.map((r) => `${r.key} rev ${r.revision} satisfied by HolderBlock`).join('; ')})`)
  await openMatrix()
  const headers = await matrixPage.locator('table[aria-label="satisfy matrix"] tbody th').allTextContents()
  check(headers.length === 2 && /REQ-001/.test(headers[0]) && /REQ-002/.test(headers[1]) && !/[0-9a-f]{8}-[0-9a-f]{4}/.test(headers.join(' ')), `the System Model matrix shows 2 rows with stable IDs (${headers.join(' | ')})`)
  check((await matrixPage.locator('table[aria-label="satisfy matrix"] td.is-filled').count()) === 2, 'the System Model matrix has 2 filled cells')
  await matrixPage.screenshot({ path: `${shots}/matrix-after.png` })
  await matrixContext.close()

  // Step 4b (ECII increment 2, plan section 5: D1-a and D1-b): the mounting architectures come before the layout alternatives.
  // The bolted block stays the selected architecture for the CAD steps; it is provisional while the drill is not identified.
  reply = await ask('D1 mounting architectures')
  check((await operations(reply)).includes('conceptualize.develop_alternatives'), `the model proposed mounting architectures before any layout (${await operations(reply)})`)
  await applyAll(reply, 'mounting architectures', 1)
  const blockConcept = ((await get(`/api/concepts/v1/projects/${P}/concepts?text=${encodeURIComponent('Bolted block on the accessory mount')}&limit=10`)).items ?? []).find((c) => c.name === 'Bolted block on the accessory mount')
  const bolted = blockConcept ? await get(`/api/concepts/v1/projects/${P}/concepts/${blockConcept.id}`) : undefined
  check(bolted?.definition?.architecture?.level === 'architecture' && /two holes/.test(bolted.definition.architecture.attachmentPrinciple) && bolted.definition.architecture.assumptions.length > 0, 'D1-b the bolted block is recorded as an architecture, with its hole spacing as an unverified assumption')
  reply = await ask('D1 diversity')
  const diverse = await answer(reply)
  check((await operations(reply)).includes('conceptualize.assess_diversity') && /3 distinct mounting architectures \(diverse\)/.test(diverse), `the three mounting architectures are really different: ${diverse.slice(0, 160)}`)
  reply = await ask('D1 readiness')
  const gate = await answer(reply)
  check(/Provisional: readiness is Exploratory/.test(gate) && /remains the selected architecture/.test(gate), `D1-b the bolted block is labelled provisional with readiness Exploratory: ${gate.slice(0, 220)}`)

  // Step 5: alternatives.
  reply = await ask('D1 alternatives')
  await applyAll(reply, 'alternatives', 1)

  // The test reads the constraints for its own checks (the script finds them with conceptualize.list_constraints).
  const constraints = await get(`/api/concepts/v1/projects/${P}/constraints`)
  const af = constraints.find?.((c) => c.statement.startsWith('Hex pocket width'))
  const wall = constraints.find?.((c) => c.statement.startsWith('Wall thickness'))
  check(!!af && !!wall, `the constraints are stored in Conceptualize (${af?.key}, ${wall?.key})`)

  // Step 6: native CAD with a hexagon, a pocket, a linear pattern and a binding, saved to the CAD service.
  // No CAD view is opened: the operations are headless.
  reply = await ask('D1 CAD')
  // Apply saves the revision in the CAD service (no separate save step; a repeated save is refused as no-op).
  await applyAll(reply, 'CAD commands (polygon, pocket, pattern, binding)', 1)

  // Step 7: check against the constraint bounds, then evidence in Conceptualize.
  reply = await ask('D1 check')
  const checked = await answer(reply)
  check(/pocket width 6\.6 mm \(satisfied\) as the bound parameter; kernel-measured pocket width 6\.6 mm \(satisfied\)/.test(checked) && near(/gap between pockets ([\d.]+) mm \(satisfied\)/.exec(checked)?.[1], 2.4), `cad-modeler.check measured against the bounds: ${checked.slice(0, 220)}`)
  await applyAll(reply, 'evidence record', 1)

  // Step 8: a plain-language change: revise the constraint, find the outdated binding, update and re-bind, check again.
  reply = await ask('D1 change')
  await applyAll(reply, 'revise the constraint', 1)
  reply = await ask('D1 bindings')
  const bindings = await answer(reply)
  check(/bound to \S+ revision 1; the latest is revision 2/.test(bindings), `check_bindings reports the superseded revision: ${bindings.slice(0, 200)}`)
  await applyAll(reply, 'update af and re-bind', 1)
  reply = await ask('D1 recheck')
  const rechecked = await answer(reply)
  check(/pocket width 6\.8 mm against \S+ revision 2 \(satisfied\), kernel-measured pocket width 6\.8 mm \(satisfied\)/.test(rechecked) && near(/gap ([\d.]+) mm \(satisfied\)/.exec(rechecked)?.[1], 2.2) && /Outdated bindings: 0\./.test(rechecked), `the rerun check reflects the change: ${rechecked.slice(0, 220)}`)
  await page.screenshot({ path: `${shots}/02-check.png` })

  // Step 7 in the interface (AUD-3, AUD-4): the toolbar command "Check against constraints" runs the same check on the
  // open document and the Diagnostics panel lists bound (with the stable CST-nnn ID), measured value, result and source.
  {
    await page.keyboard.press('Escape')
    await page.click('[data-rail-tool="cad-modeler"]')
    await page.waitForSelector('.cadm-root, .cadm-welcome, [data-tool="cad-modeler"]', { timeout: 30000 })
    await page.getByRole('tab', { name: 'Model', exact: true }).click()
    const refText = await page.getByTestId('param-binding-ref').first().textContent({ timeout: 60000 })
    check(/^CST-\d+$/.test((refText ?? '').trim()), `the parameter binding shows the stable constraint ID (${refText})`)
    check(!/[0-9a-f]{8}-[0-9a-f]{4}/.test((await page.locator('.cadm-side').innerText())), 'no UUID appears in the CAD panels')
    await page.screenshot({ path: `${shots}/03-cad-binding-label.png` })
    // The toolbar command (it may sit in the overflow menu next to the docked panels).
    const direct = page.getByRole('button', { name: 'Check against constraints', exact: true }).first()
    await page.waitForTimeout(500)
    if (await direct.isVisible().catch(() => false)) await direct.click()
    else {
      await page.getByRole('button', { name: 'More actions' }).first().click()
      await page.getByRole('menuitem', { name: 'Check against constraints' }).first().click()
    }
    const panel = page.getByTestId('check-panel')
    await panel.getByTestId('check-summary').waitFor({ timeout: 120000 })
    const results = panel.getByTestId('check-result')
    const bound = panel.locator('[data-testid=check-result]:has([data-testid=check-bound])')
    check((await bound.count()) >= 1, `the panel lists ${await bound.count()} measure(s) with a bound`)
    const boundText = (await bound.first().innerText()).replace(/\s+/g, ' ')
    check(/CST-\d+/.test(boundText) && /<=|<|>=|>|=|between/.test(boundText) && /6\.8/.test(boundText) && /Pass/.test(boundText) && /Model/.test(boundText), `the bound row shows ID, bound, measured value, result and source: ${boundText.slice(0, 200)}`)
    check((await results.filter({ hasText: /solid validity/ }).first().innerText()).includes('Kernel'), 'solid validity is listed with kernel provenance')
    check((await panel.getByText(/make no claim of structural adequacy/).count()) === 1, 'the panel states that results make no claim of adequacy or compliance')
    await page.screenshot({ path: `${shots}/04-cad-check-panel.png` })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(500)
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal page scroll on a phone')
    await page.screenshot({ path: `${shots}/05-cad-check-phone.png` })
    await page.setViewportSize({ width: 1600, height: 1000 })
    await openAssistant()
  }

  // Step 9: STEP export with read-back, and a download.
  reply = await ask('D1 export')
  const exported = await answer(reply)
  check(/STEP read-back: ok true, 1 solid\(s\), valid true, differences 0/.test(exported), `STEP read-back matches the native model: ${exported.slice(0, 200)}`)
  reply = await ask('D1 download')
  const downloadPromise = page.waitForEvent('download', { timeout: 60000 }).catch(() => null)
  await applyAll(reply, 'STEP download', 1)
  const download = await downloadPromise
  check(!!download && /\.(step|stp)$/i.test(download.suggestedFilename()), `a STEP file was downloaded (${download?.suggestedFilename() ?? 'none'})`)

  // Evidence: the exported transcript holds every operation with its arguments and a replayable script.
  const transcriptPromise = page.waitForEvent('download', { timeout: 20000 })
  await page.getByTestId('export-transcript').click()
  const transcriptFile = await (await transcriptPromise).path()
  const transcript = JSON.parse(readFileSync(transcriptFile, 'utf8'))
  const ops = transcript.messages.filter((m) => m.role === 'assistant').flatMap((m) => m.operations)
  check(transcript.format === 'ews-assistant-transcript' && transcript.projectId === P && ops.length >= 25 && ops.every((o) => o.arguments) && transcript.replayScript.turns.length >= 13, `the transcript records ${ops.length} operations with arguments and a ${transcript.replayScript.turns.length}-turn replay script`)
  writeFileSync(`${shots}/transcript.json`, JSON.stringify(transcript, null, 2))

  // Fresh browser session: the committed artifacts are read back from the services, not from browser memory.
  const fresh = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  await fresh.addInitScript(() => localStorage.setItem('ews.services.v1', JSON.stringify({ requirementsMode: 'api', devUser: 'eli' })))
  const page2 = await fresh.newPage()
  await page2.goto(exampleUrl(`project=${encodeURIComponent(P)}&tool=conceptualize`))
  await page2.waitForSelector('.ws-app', { timeout: 60000 })
  await page2.waitForTimeout(2000)
  await page2.screenshot({ path: `${shots}/03-fresh-session.png` })
  // AUD-4: the Conceptualize references ("Applies to", Concept links) show stable keys, never a UUID or its prefix.
  {
    const uuidLike = /[0-9a-f]{8}-[0-9a-f]{4}-|(Concept|Constraint|Function|Assumption|Evidence|Decision) [0-9a-f]{8}\b/
    await page2.getByRole('button', { name: /Record type/ }).first().click()
    await page2.getByRole('option', { name: 'Constraints', exact: true }).click()
    await page2.locator('.con-results .con-tree-label').first().click({ timeout: 30000 })
    await page2.getByText('Applies to', { exact: true }).first().waitFor({ timeout: 30000 })
    await page2.waitForTimeout(1500)
    const detail = await page2.locator('.con-root').first().innerText()
    const applies = (await page2.locator('.con-rel-list').first().innerText()).trim()
    check(!uuidLike.test(detail) && !/\(unresolved\)/.test(applies), `the constraint detail shows no UUID and resolves its subjects (${applies.replace(/\s+/g, ' ').slice(0, 80)})`)
    await page2.screenshot({ path: `${shots}/03b-constraint-applies-to.png` })
  }
  await fresh.close()
  const concepts = await get(`/api/concepts/v1/projects/${P}/concepts?text=${encodeURIComponent('Drill bit holder block')}&limit=50`)
  check((concepts.items ?? []).length === 1, `the concept is stored in Conceptualize (${(concepts.items ?? []).map((c) => c.key).join(', ')})`)
  const revised = (await get(`/api/concepts/v1/projects/${P}/constraints`)).find((c) => c.id === af.id)
  check(revised?.revision === 2 && revised.bound?.quantity?.value === 6.7, `the constraint revision is stored (${revised?.key} rev ${revised?.revision}, ${revised?.bound?.operator} ${revised?.bound?.quantity?.value} ${revised?.bound?.quantity?.unit})`)
  const artifacts = (await get(`/api/projects/v1/projects/${P}/artifacts?limit=200`)).items ?? []
  const by = (module) => artifacts.filter((a) => a.ref?.module === module)
  console.log(`[demo-d1] registered artifacts: ${artifacts.map((a) => `${a.ref?.module}/${a.ref?.kind} ${a.key}`).join(', ')}`)
  check(by('requirements').length === 2, `the requirements are registered (${by('requirements').map((a) => a.key).join(', ')})`)
  check(by('product').length === 1, `the product element is registered (${by('product').map((a) => a.key).join(', ')})`)
  check(by('sysml').length >= 1, `the SysML model is registered (${by('sysml').map((a) => a.key).join(', ')})`)
  check(by('cad').length >= 1, `the CAD document is registered (${by('cad').map((a) => `${a.key} v${a.version?.value}`).join(', ')})`)
  const documents = await get(`/api/cad/v1/projects/${encodeURIComponent(P)}/documents`)
  const docs = Array.isArray(documents) ? documents : (documents.items ?? [])
  check(docs.length === 1 && (docs[0].revision ?? docs[0].latestRevision ?? 0) >= 2, `the CAD service stores the document with both saved revisions (${JSON.stringify(docs.map((d) => ({ title: d.title, revision: d.revision ?? d.latestRevision })))})`)
} catch (e) {
  check(false, `flow aborted: ${e instanceof Error ? e.message.split('\n')[0] : e}`)
  await page.screenshot({ path: `${shots}/error.png` }).catch(() => undefined)
} finally {
  writeFileSync(`${shots}/replies.json`, JSON.stringify(replies, null, 2))
}

console.log('[demo-d1] PENDING (not exercised by the replayed script, not counted):')
for (const p of PENDING) console.log(`[demo-d1]   ${p}`)
check(problems.length === 0, `no page errors${problems.length ? `: ${problems.join(' | ')}` : ''}`)
await fetch(`${API}/api/assistant/v1/connection?projectId=PRJ-ACT100`, { method: 'DELETE', headers: H })
await browser.close()
console.log(failures ? `[demo-d1] ${failures} FAILED (plumbing test; not D1 acceptance)` : '[demo-d1] ALL PASSED (plumbing test; not D1 acceptance)')
process.exit(failures ? 1 : 0)
