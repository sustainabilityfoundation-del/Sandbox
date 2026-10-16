// AI headless operation boundary (integration milestone 1 C9, step 10): every engineering operation the assistant
// is offered runs with ALL tool tabs closed, through the same executor, validation and module services as the UI.
// Preparing a change succeeds (a preview); one Conceptualize change is then applied, still with no view mounted.
//
// Start the stack first: `npm run dev` (any AI provider setting; this flow calls the operations directly, without a model).
// Run: `npm run e2e -- ai-headless`. Environment: see tests/e2e/README.md (E2E_BASE, E2E_API).
//
// Modules whose operations still depend on a mounted view are listed in KNOWN_FAILING with their change request.
// The flow passes while they fail, reports when one starts passing (remove its entry), and FAILS if any other
// operation fails: a module that already works headless cannot regress unnoticed.
import { env, launchOptions, shotsDir, exampleUrl } from '../lib/env.mjs'
import { chromium } from 'playwright-core'

const KNOWN_FAILING = {
  // Both run headless in a new project in demo-d1.mjs (create_project, link_product_element, run_commands, check,
  // check_bindings, export). This flow has no example arguments for them in the example project yet, because that
  // needs a SysML project and a stored CAD document there.
  'sysml-modeler': 'headless in demo-d1.mjs; no example arguments here yet',
  'cad-modeler': 'headless in demo-d1.mjs; no example arguments here yet',
}

// Target of projects.open (the proposal is prepared, never applied): another active project of eli.
const H = { 'x-dev-user': 'eli', 'content-type': 'application/json' }
const found = await (await fetch(`${env.api}/api/projects/v1/projects?q=HL-OPEN`, { headers: H })).json()
if (!found.items?.some((p) => p.key === 'HL-OPEN')) {
  await fetch(`${env.api}/api/projects/v1/projects`, { method: 'POST', headers: { ...H, 'idempotency-key': `hl-open-${Date.now()}` }, body: JSON.stringify({ key: 'HL-OPEN', name: 'Headless flow: open target', description: 'Target of projects.open in tests/e2e/flows/ai-headless.mjs (never opened).', templateId: 'blank' }) })
}
/** View controls (navigation, selection): measured as view-control coverage, not engineering operations. */
const VIEW_CONTROLS = ['select_objects', 'open_tool']

const shots = shotsDir('ai-headless')
const browser = await chromium.launch({ ...launchOptions })
let failures = 0
const check = (cond, msg) => (console.log(`[ai-headless] ${cond ? 'PASS' : 'FAIL'} ${msg}`), cond || failures++)
const problems = []

const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
await ctx.addInitScript(() => {
  if (!sessionStorage.getItem('pw-init')) {
    localStorage.clear()
    sessionStorage.setItem('pw-init', '1')
  }
  localStorage.setItem('ews.services.v1', JSON.stringify({ requirementsMode: 'api', devUser: 'eli' }))
})
const page = await ctx.newPage()
page.on('pageerror', (e) => problems.push(e.message))
await page.goto(exampleUrl())
await page.waitForSelector('[data-testid="model-revision"]', { timeout: 60000 })

// Close every tool tab: nothing of any tool is mounted.
await page.evaluate(async () => {
  const { useWorkspaceStore } = await import('/workspace/src/platform/store.ts')
  for (const id of [...useWorkspaceStore.getState().openToolIds]) useWorkspaceStore.getState().closeTool(id)
})
await page.waitForTimeout(800)
const mounted = await page.evaluate(async () => {
  const { useWorkspaceStore } = await import('/workspace/src/platform/store.ts')
  return { open: useWorkspaceStore.getState().openToolIds, views: document.querySelectorAll('[data-tool]').length }
})
check(mounted.open.length === 0 && mounted.views === 0, `all tool tabs are closed and no tool view is mounted (${mounted.open.length} open, ${mounted.views} views)`)
await page.screenshot({ path: `${shots}/01-no-tools.png` })

const report = await page.evaluate(async ({ VIEW_CONTROLS }) => {
  const { executeToolCall } = await import('/workspace/src/assistant/executor.ts')
  const { createWorkspaceEnvironment } = await import('/workspace/src/assistant/environment.ts')
  const { captureContext } = await import('/workspace/src/assistant/conversation.ts')
  const { availableOperations } = await import('/workspace/src/assistant/toolSpecs.ts')
  const { serviceHandlers } = await import('/workspace/src/assistant/serviceProposals.ts')
  const RUN = `C-HEADLESS-${Date.now().toString(36)}`
  const proposals = new Map()
  let seq = 0
  const env = createWorkspaceEnvironment({
    createProposal: (draft) => {
      const p = { ...draft, id: `HL-${++seq}`, status: 'pending', changes: draft.changes ?? [] }
      proposals.set(p.id, p)
      return p
    },
    getProposal: (id) => proposals.get(id),
  })
  const run = async (name, args) => {
    const captured = captureContext(false)
    const out = await executeToolCall({ id: `hl-${name}`, name, arguments: args }, { captured, source: { kind: 'conversation', conversationId: RUN, messageId: 'M1', label: 'headless flow' }, env })
    return out
  }
  // Seeded Conceptualize data, found through the operations themselves.
  const keyOf = (text) => /\b(CON-\d+)\b/.exec(text ?? '')?.[1]
  const search = async (text) => (await run('conceptualize.search', { text })).data?.concepts?.[0]?.key
  const actuator = await search('Linear actuator ACT-100')
  const transmission = await search('mechanical power transmission')
  const cmp = await run('conceptualize.compare', { conceptId: transmission })
  const alternative = keyOf(cmp.data?.comparisons?.[0]?.alternatives?.[0]?.concept)
  const designKey = async (text, type) => (await run('conceptualize.search_design', { text, types: [type] })).data?.items?.[0]?.key
  const fn = (await designKey('a', 'function')) ?? (await designKey('e', 'function'))
  const decision = (await designKey('a', 'decision')) ?? (await designKey('e', 'decision'))
  const stamp = Date.now() % 100000
  // A product element of the example project, found through the operations (ref.id is its UUID).
  const element = (await run('projects.list_artifacts', { category: 'product-element', q: 'ROD-120' })).data?.[0]?.ref?.id
  const examples = {
    read_object: { id: 'ROD-120' },
    search_objects: { query: 'rod' },
    read_relationships: { objectId: 'ROD-120' },
    read_artifacts: {},
    read_help: { query: 'requirements' },
    propose_changes: { title: 'Headless change', explanation: 'flow', changes: [{ kind: 'set-property', targetId: 'ROD-120', property: 'diameter', value: 26, unit: 'mm' }] },
    'requirements.read_for_component': { objectId: 'ROD-120' },
    'requirements.search': { text: 'load' },
    'requirements.explain_quality': { requirementId: 'REQ-001' },
    'requirements.update': { requirementId: 'REQ-001', rationale: 'Headless flow check (preview only, never applied).' },
    'sysml.read_model': {},
    'sysml.create_part': { name: `headlessPart${stamp}` },
    'sysml.add_requirement_reference': { requirementId: 'REQ-003' },
    'sysml.connect': { fromId: 'SYS-002', toId: 'SYS-004' },
    'cad.read_representation': { objectId: 'CAD-120' },
    'cad.set_dimension': { objectId: 'CAD-120', parameter: 'diameter', value: 26, unit: 'mm' },
    'conceptualize.search': { text: 'actuator' },
    'conceptualize.read': { conceptId: actuator },
    'conceptualize.create': { text: `Headless test concept ${stamp}: a bracket that holds 2 kg.` },
    'conceptualize.develop_alternatives': { text: 'Linear actuator pushing 500 N over 100 mm', count: 2 },
    'conceptualize.decompose': { conceptId: actuator, children: ['Headless child A', 'Headless child B'] },
    'conceptualize.compare': { conceptId: transmission },
    'conceptualize.propose_decision': { conceptId: alternative, rationale: 'headless flow' },
    'conceptualize.link_artifact': { conceptId: actuator, artifactId: 'ROD-120' },
    'conceptualize.propose_requirement': { conceptId: actuator },
    'conceptualize.request_realization': { conceptId: actuator, targetModule: 'cad' },
    'conceptualize.next_steps': { conceptId: actuator },
    'conceptualize.create_function': { name: `Headless function ${stamp}`, performedBy: [actuator] },
    'conceptualize.convert_to_function': { conceptId: actuator },
    'conceptualize.create_constraint': { subjectId: actuator, statement: 'Headless check: mass at most 2 kg', operator: '<=', value: 2, unit: 'kg' },
    'conceptualize.promote_constraint': { conceptId: actuator },
    'conceptualize.record_assumption': { statement: 'Headless check assumption', subjectId: actuator },
    'conceptualize.create_link': { type: 'performs', from: actuator, to: fn },
    'conceptualize.rationale': { decisionId: decision },
    'conceptualize.traverse': { start: actuator, depth: 1 },
    'conceptualize.search_design': { text: 'actuator' },
    'conceptualize.revise_constraint': { constraintId: 'CST-001', reason: 'Headless flow check (preview only, never applied)', value: 99, unit: 'mm' },
    'conceptualize.record_evidence': { title: 'Headless flow check', subjects: [actuator], source: { module: 'external', id: 'headless-flow', revision: 1 }, tool: { name: 'ai-headless.mjs', version: '1' }, results: [{ name: 'envelope length', value: 90, unit: 'mm', constraintId: 'CST-001' }] },
    'conceptualize.review_flags': {},
    'requirements.create': { title: `Headless requirement ${stamp}`, statement: 'The actuator shall be checked headless.', origin: 'stakeholder' },
    'requirements.allocate': { requirementId: 'REQ-001', add: [{ kind: 'product-element', id: element }] },
    'projects.get_context': {},
    'projects.list_projects': {},
    'projects.list_artifacts': { category: 'product-element' },
    'projects.create': { name: `Headless project ${stamp}`, key: `HL-${stamp}` },
    'projects.open': { project: 'HL-OPEN' },
    'projects.create_product_element': { name: `Headless element ${stamp}`, elementKind: 'part' },
    'projects.add_breakdown_edge': { childId: 'ROD-120', parentId: 'ACT-100' },
    'projects.store_document': { title: 'Headless document', contentBase64: 'aGVhZGxlc3M=', fileName: 'headless.txt', mediaType: 'text/plain', documentKind: 'other' },
  }
  const ops = availableOperations().map((o) => o.name).filter((n) => !VIEW_CONTROLS.includes(n))
  const results = []
  for (const name of ops) {
    const module = name.includes('.') ? name.split('.')[0] : 'workspace'
    if (!(name in examples)) {
      results.push({ name, module, ok: false, error: 'no example arguments in ai-headless.mjs', missingExample: true })
      continue
    }
    const out = await run(name, examples[name])
    results.push({ name, module, ok: out.ok, error: out.error, proposalId: out.proposalId })
  }
  // Apply one prepared Conceptualize change with no view mounted (closure fallback today; declarative once moved).
  const created = results.find((r) => r.name === 'conceptualize.create' && r.ok)
  let applied = null
  if (created) {
    const handlers = serviceHandlers(created.proposalId)
    try {
      applied = handlers ? (await handlers.apply({ conversationId: RUN, proposalId: created.proposalId, messageId: 'M1' })).summary : 'no handlers'
    } catch (e) {
      applied = `failed: ${e.message}`
    }
  }
  return { results, applied, keys: { actuator, transmission, alternative, fn, decision } }
}, { VIEW_CONTROLS })

check(!!report.keys.actuator && !!report.keys.transmission && !!report.keys.alternative && !!report.keys.fn && !!report.keys.decision, `seeded Conceptualize data found through the operations (${JSON.stringify(report.keys)})`)
for (const r of report.results) {
  const known = KNOWN_FAILING[r.module]
  if (r.ok) {
    if (known) console.log(`[ai-headless] NOTE ${r.name} now succeeds headless: remove "${r.module}" from KNOWN_FAILING when all its operations do.`)
    else check(true, `${r.name} succeeds with all tabs closed`)
  } else if (known) console.log(`[ai-headless] KNOWN ${r.name} fails headless (${known}): ${r.error}`)
  else check(false, `${r.name} succeeds with all tabs closed (${r.error})`)
}
const engineering = report.results.filter((r) => !KNOWN_FAILING[r.module])
check(engineering.length >= 20, `${engineering.length} engineering operations of headless-ready modules were exercised`)
check(typeof report.applied === 'string' && /^Created CON-\d+/.test(report.applied), `a prepared Conceptualize change applies through the module API with no view mounted (${report.applied})`)
for (const [module, why] of Object.entries(KNOWN_FAILING)) {
  const ops = report.results.filter((r) => r.module === module)
  if (ops.length && ops.every((r) => r.ok)) console.log(`[ai-headless] NOTE all ${module} operations succeed headless: remove it from KNOWN_FAILING (${why}).`)
}
check(problems.length === 0, `no page errors${problems.length ? `: ${problems.join(' | ')}` : ''}`)
await browser.close()
console.log(failures ? `[ai-headless] ${failures} FAILED` : '[ai-headless] ALL PASSED')
process.exit(failures ? 1 : 0)
