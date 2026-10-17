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
}

// Target of projects.open (the proposal is prepared, never applied): another active project of eli.
const H = { 'x-dev-user': 'eli', 'content-type': 'application/json' }
const found = await (await fetch(`${env.api}/api/projects/v1/projects?q=HL-OPEN`, { headers: H })).json()
if (!found.items?.some((p) => p.key === 'HL-OPEN')) {
  await fetch(`${env.api}/api/projects/v1/projects`, { method: 'POST', headers: { ...H, 'idempotency-key': `hl-open-${Date.now()}` }, body: JSON.stringify({ key: 'HL-OPEN', name: 'Headless flow: open target', description: 'Target of projects.open in tests/e2e/flows/ai-headless.mjs (never opened).', templateId: 'blank' }) })
}
/**
 * Operations that must be refused in this environment, with the reason expected (a refusal is their correct
 * headless behaviour): illustrations need the visualization service and the external-generation class.
 */
const EXPECTED_REFUSALS = { 'conceptualize.request_illustration': 'off in Settings|not connected|not reachable' }
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

const report = await page.evaluate(async ({ VIEW_CONTROLS, EXPECTED_REFUSALS, repoFs }) => {
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
  // A Concept with a structured layout, its layout visual and one annotation (visual concept exploration).
  const CH = { 'x-dev-user': 'eli', 'content-type': 'application/json' }
  const cpost = async (path, body) => (await fetch(`/api/concepts/v1/projects/PRJ-ACT100${path}`, { method: 'POST', headers: { ...CH, 'idempotency-key': `hl-${path}-${stamp}-${Math.random()}` }, body: JSON.stringify(body) })).json()
  const visualConcept = await cpost('/concepts', { name: `Headless layout ${stamp}`, definition: { components: [{ id: 'C1', name: 'Plate' }], parameters: [{ id: 'P2', symbol: 'w', value: 40, unit: 'mm' }], layout: { items: [{ componentId: 'C1', x: 0, y: 0, width: { parameter: 'P2' }, height: 10 }], dimensions: [{ parameterId: 'P2', componentId: 'C1', axis: 'x' }] } } })
  const layoutVisual = await cpost('/visuals', { conceptId: visualConcept.id, kind: 'layout' })
  await cpost(`/visuals/${layoutVisual.id}/revisions/1/annotations`, { shape: 'pin', x: 0.5, y: 0.5, instruction: 'Headless: wider plate', componentId: 'C1' })
  // A calculation model from the engine library (CR-C8) for the calculation operations.
  const calcModel = await cpost('/calculation-models', { fromLibrary: 'lib.column.euler-round', name: `Headless buckling ${stamp}` })
  const rodInputs = [{ symbol: 'F', value: 12, unit: 'kN' }, { symbol: 'E', value: 210, unit: 'GPa' }, { symbol: 'Sy', value: 600, unit: 'MPa' }, { symbol: 'd', value: 25, unit: 'mm' }, { symbol: 'L', value: 600, unit: 'mm' }, { symbol: 'K', value: 1, unit: '-' }, { symbol: 'n', value: 2, unit: '-' }]
  // A product element of the example project, found through the operations (ref.id is its UUID).
  const element = (await run('projects.list_artifacts', { category: 'product-element', q: 'ROD-120' })).data?.[0]?.ref?.id
  // A stored CAD document of the example project for the cad-modeler operations, created through the CAD API
  // (a block with a hexagonal pocket in a linear pattern; the parameter "af" is bound to a Conceptualize constraint).
  const core = await import(`/workspace/@fs/${repoFs}/packages/cad-core/src/index.ts`)
  // The constraint's UUID and revision come from the Conceptualize API (operation results give keys only, CR-AI-9).
  const constraints = await (await fetch('/api/concepts/v1/projects/PRJ-ACT100/constraints', { headers: { 'x-dev-user': 'eli' } })).json()
  const constraint = (Array.isArray(constraints) ? constraints : constraints.items ?? []).find((c) => c.key === 'CST-001')
  const built = core.applyTransaction(core.createDocument({ title: `Headless CAD ${stamp}` }), {
    commands: [
      { command: 'create_part', input: { name: 'Block', ref: '$p' } },
      { command: 'create_parameter', input: { partId: '$p', name: 'af', expression: '7' } },
      { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
      { command: 'add_rectangle', input: { sketchId: '$s', width: 60, height: 20 } },
      { command: 'extrude_profile', input: { sketchId: '$s', distance: 20 } },
      { command: 'create_sketch', input: { partId: '$p', plane: 'XY', offset: 20, ref: '$h' } },
      { command: 'add_regular_polygon', input: { sketchId: '$h', center: [12, 10], sides: 6, size: { acrossFlats: 'af' }, rotation: 30 } },
      { command: 'extrude_profile', input: { sketchId: '$h', distance: 12, direction: 'reverse', operation: 'cut', ref: '$pocket' } },
      { command: 'pattern_linear', input: { features: ['$pocket'], direction: 'x', count: 3, spacing: 12, ref: '$pat' } },
      ...(constraint?.id ? [{ command: 'bind_parameter', input: { partId: '$p', name: 'af', ref: { module: 'conceptualize', kind: 'constraint', id: constraint.id, revision: constraint.revision ?? 1 } } }] : []),
    ],
  })
  if (!built.ok) throw new Error(`CAD fixture: ${built.error.message}`)
  const cadDoc = built.doc
  const stored = await fetch('/api/cad/v1/projects/PRJ-ACT100/documents', { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-user': 'eli', 'idempotency-key': `hl-cad-${stamp}-${Math.random()}` }, body: JSON.stringify({ document: cadDoc, message: 'ai-headless fixture' }) })
  if (stored.status !== 201) throw new Error(`CAD fixture not stored: HTTP ${stored.status}`)
  const cadId = cadDoc.documentId
  const patternId = cadDoc.parts[0].features.find((x) => x.type === 'pattern-linear').id
  // A Concept with an engineering definition and its CAD handoff package (Conceptualize API), for start_from_handoff.
  const hpost = (path, body) => fetch(`/api/concepts/v1/projects/PRJ-ACT100${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-user': 'eli', 'idempotency-key': `hl-${path}-${stamp}-${Math.random()}` }, body: JSON.stringify(body) }).then((r) => r.json())
  const handoffConcept = await hpost('/concepts', { name: `Headless handoff ${stamp}`, definition: { intent: 'Hold bits', components: [{ name: 'Holder block', kind: 'part' }], parameters: [{ symbol: 'af', name: 'Across flats', value: 6.6, unit: 'mm' }, { symbol: 'wall', name: 'Wall', min: 2, max: 4, unit: 'mm' }] } })
  const handoff = await hpost(`/concepts/${handoffConcept.id}/handoffs`, {})
  // An unsaved local change in this window's CAD session (the same module the app uses), so undo and save have work.
  const { cadSession } = await import(`/workspace/@fs/${repoFs}/packages/tool-cad-modeler/src/session.ts`)
  const open = await cadSession.openFromStore('PRJ-ACT100', cadId, undefined, { activate: false })
  await open.engine.execute({ commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'af', expression: '7.2' } }], label: 'Local edit', source: 'user' })
  // An applied intent, so the context and gap reads have something to read (interpret_intent only proposes).
  const headlessIntent = await hpost('/intents', { designObject: `Headless intent ${stamp}`, role: 'standalone', integration: 'standalone', rationale: 'headless flow' })
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
    'requirements.get': { requirementId: 'REQ-001' },
    'requirements.get_conventions': {},
    'sysml.read_model': {},
    'sysml.create_part': { name: `headlessPart${stamp}` },
    'sysml.add_requirement_reference': { requirementId: 'REQ-003' },
    'sysml.connect': { fromId: 'SYS-002', toId: 'SYS-004' },
    'cad.read_representation': { objectId: 'CAD-120' },
    'cad.set_dimension': { objectId: 'CAD-120', parameter: 'diameter', value: 26, unit: 'mm' },
    'conceptualize.search': { text: 'actuator' },
    'conceptualize.read': { conceptId: actuator },
    'conceptualize.create': { text: `Headless test concept ${stamp}: a bracket that holds 2 kg.`, name: `Headless bracket ${stamp}`, statements: [{ kind: 'constraint', text: 'Holds a load', quantity: { value: 2, unit: 'kg' } }] },
    'conceptualize.develop_alternatives': { text: 'Linear actuator pushing 500 N over 100 mm', name: `Headless actuator ${stamp}`, alternatives: [{ name: 'Lead screw drive', summary: 'Motor turns a lead screw that pushes a nut.' }, { name: 'Pneumatic cylinder', summary: 'Compressed air acts on a piston.' }], tradeStudy: { criteria: [{ name: 'Cost', weight: 1 }], scores: [{ alternative: 'Lead screw drive', criterion: 'Cost', qualitative: 3, rationale: 'headless flow' }] } },
    'conceptualize.decompose': { conceptId: actuator, children: ['Headless child A', 'Headless child B'] },
    'conceptualize.compare': { conceptId: transmission },
    'conceptualize.propose_decision': { conceptId: alternative, rationale: 'headless flow' },
    'conceptualize.link_artifact': { conceptId: actuator, artifactId: 'ROD-120' },
    'conceptualize.interpret_intent': { designObject: `Headless intent ${stamp}`, role: 'standalone', integration: 'standalone', rationale: 'headless flow', objectives: ['Holds a load'] },
    'conceptualize.read_context': { intentId: headlessIntent.id },
    'conceptualize.identify_gaps': { intentId: headlessIntent.id },
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
    'cad-modeler.list_documents': {},
    'cad-modeler.describe_model': { documentId: cadId },
    'cad-modeler.query': { documentId: cadId, query: 'get_feature_tree' },
    'cad-modeler.run_commands': { documentId: cadId, label: 'Headless: wider pockets', commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'af', expression: '7.5' } }] },
    'cad-modeler.undo': { documentId: cadId },
    'cad-modeler.new_document': { title: `Headless new ${stamp}`, partName: 'Part' },
    'cad-modeler.open_document': { documentId: cadId },
    'cad-modeler.save_document': { documentId: cadId, message: 'headless (preview only)' },
    'cad-modeler.export': { documentId: cadId, format: 'step', return: true },
    'cad-modeler.check': { documentId: cadId, checks: constraint?.id ? [{ measure: { kind: 'pattern-gap', featureId: patternId }, constraint: { id: constraint.id } }] : [] },
    'cad-modeler.check_bindings': { documentId: cadId },
    'cad-modeler.start_from_handoff': { handoffId: handoff.id },
    'projects.store_document': { title: 'Headless document', contentBase64: 'aGVhZGxlc3M=', fileName: 'headless.txt', mediaType: 'text/plain', documentKind: 'other' },
    'conceptualize.list_constraints': {},
    'conceptualize.evaluate_calculation': { modelId: calcModel.key, inputs: rodInputs },
    'conceptualize.record_calculation': { modelId: calcModel.key, subjects: [actuator], inputs: rodInputs },
    'conceptualize.define_concept': { conceptId: visualConcept.key, definition: { intent: 'Headless: hold a plate' } },
    'conceptualize.read_visuals': { conceptId: visualConcept.key },
    'conceptualize.request_illustration': { conceptId: visualConcept.key },
    'conceptualize.annotate_visual': { visualId: layoutVisual.key, shape: 'rect', x: 0.1, y: 0.1, width: 0.3, height: 0.3, instruction: 'Headless region', componentId: 'C1' },
    'conceptualize.refine_from_annotations': { visualId: layoutVisual.key, annotations: [1], changes: { setParameters: [{ parameter: 'w', value: 50 }] } },
    'conceptualize.compare_cards': { conceptId: transmission },
    'conceptualize.reject_alternative': { conceptId: alternative, rationale: 'Headless flow check (preview only, never applied)' },
    'conceptualize.create_cad_handoff': { conceptId: visualConcept.key },
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
    const refusal = EXPECTED_REFUSALS[name]
    if (refusal) results.push({ name, module, ok: !out.ok && new RegExp(refusal).test(out.error ?? ''), error: out.ok ? 'expected a refusal' : out.error, refusedAsExpected: true })
    else results.push({ name, module, ok: out.ok, error: out.error, proposalId: out.proposalId })
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
}, { VIEW_CONTROLS, EXPECTED_REFUSALS, repoFs: env.repoFs })

check(!!report.keys.actuator && !!report.keys.transmission && !!report.keys.alternative && !!report.keys.fn && !!report.keys.decision, `seeded Conceptualize data found through the operations (${JSON.stringify(report.keys)})`)
for (const r of report.results) {
  const known = KNOWN_FAILING[r.module]
  if (r.ok) {
    if (known) console.log(`[ai-headless] NOTE ${r.name} now succeeds headless: remove "${r.module}" from KNOWN_FAILING when all its operations do.`)
    else check(true, r.refusedAsExpected ? `${r.name} is refused headless with the expected reason (${r.error})` : `${r.name} succeeds with all tabs closed`)
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
