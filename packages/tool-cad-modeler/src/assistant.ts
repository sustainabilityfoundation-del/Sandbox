import { CadEngine, COMMANDS, QUERIES, createDocument, featureTree, failures, massProperties, parameterTable, parseDocument, type CadDocument, type CommandCall, type DryRunResult } from '@ews/cad-core'
import { ActionError, type AssistantActionDefinition, type AssistantContribution, type DemoPlanner, type ServiceProposal, type ServiceProposalItem } from '@ews/platform-sdk'
import { cadSession } from './session'

/**
 * Assistant operations for the CAD Modeler (contracts §5, ADR-0023). Reads return structured data
 * from the same queries the inspector and diagnostics use. Every mutation is a service proposal: the
 * commands are validated and regenerated on a copy (dry run) for the preview, and only Apply runs
 * them, through the same executor as the toolbar and dialogs, with the model version captured at
 * preview time. Nothing is written by an action itself.
 */

export const MODULE = 'cad-modeler'

const documentId = { type: 'string', description: 'Document ID (default: the active CAD Modeler document).' }

const fmt = (n: number, digits = 2) => (Math.abs(n) >= 1e5 ? n.toExponential(3) : n.toFixed(digits))

function describeInput(c: CommandCall): string {
  const text = JSON.stringify(c.input ?? {})
  return text.length > 160 ? `${text.slice(0, 157)}…` : text
}

function predictionItems(dry: DryRunResult): ServiceProposalItem[] {
  const items: ServiceProposalItem[] = []
  const before = new Map(dry.before.bodies.map((b) => [b.bodyId, b]))
  for (const b of dry.after?.bodies ?? []) {
    const old = before.get(b.bodyId)
    const size = b.boundingBox.max.map((v, k) => fmt(v - b.boundingBox.min[k], 1)).join(' × ')
    items.push({
      targetId: b.bodyId,
      label: `Predicted body ${b.bodyId}`,
      current: old ? `${fmt(old.volume)} mm³, ${old.faces} faces` : 'none',
      proposed: `${fmt(b.volume)} mm³, ${b.faces} faces, ${size} mm${b.valid ? '' : ' (INVALID solid)'}`,
      basis: 'evidence',
    })
  }
  for (const b of dry.before.bodies) if (!dry.after?.bodies.some((x) => x.bodyId === b.bodyId)) items.push({ targetId: b.bodyId, label: `Predicted body ${b.bodyId}`, current: `${fmt(b.volume)} mm³`, proposed: 'removed', basis: 'evidence' })
  const known = new Set(dry.before.failures.map((f) => `${f.featureId}:${f.status}`))
  for (const f of dry.after?.failures ?? []) {
    if (known.has(`${f.featureId}:${f.status}`)) continue
    items.push({ targetId: f.featureId, label: `Predicted ${f.status === 'blocked' ? 'blocked feature' : f.warnings.length && f.status !== 'failed' ? 'warning' : 'failure'}`, proposed: `${f.name}: ${f.error?.message ?? f.warnings.map((w) => w.message).join(' ')}`, basis: 'evidence' })
  }
  return items
}

async function dryRunFor(docId: string | undefined, commands: CommandCall[], expectedVersion: number | undefined) {
  const open = cadSession.document(docId)
  if (docId && !open) throw new ActionError('not-found', `CAD document ${docId} is not open.`)
  // Without an open document the commands are previewed on a new, empty document.
  const engine = open?.engine ?? new CadEngine({ ...cadSession.engineOptions(), document: createDocument({ documentId: 'preview', title: 'New document' }) })
  const version = expectedVersion ?? engine.document.version
  const dry = await engine.dryRun({ commands, expectedVersion: version, source: 'assistant' })
  if (!open) await engine.dispose()
  return { open, version, dry }
}


function validateCalls(raw: unknown): CommandCall[] {
  if (!Array.isArray(raw) || !raw.length) throw new ActionError('invalid-arguments', '“commands” must be a non-empty list of { command, input }.')
  return raw.map((c, i) => {
    if (!c || typeof c !== 'object' || typeof (c as CommandCall).command !== 'string') throw new ActionError('invalid-arguments', `commands[${i}] needs a “command” name.`)
    const input = (c as CommandCall).input ?? {}
    if (typeof input !== 'object' || Array.isArray(input)) throw new ActionError('invalid-arguments', `commands[${i}].input must be an object.`)
    return { command: (c as CommandCall).command, input: input as Record<string, unknown> }
  })
}

const actions: AssistantActionDefinition[] = [
  {
    name: 'cad-modeler.describe_model',
    label: 'Read CAD model',
    description:
      'Structured overview of the active CAD Modeler document (or one by ID): open documents, parts, feature history with regeneration status and errors, parameters with values, bodies with volume, mass, bounding box and topology, and failures. Use cad-modeler.query for details (sketch DOF, faces with stable names, dependencies, operation log, the native document).',
    parameters: { type: 'object', properties: { documentId }, additionalProperties: false },
    async run(args) {
      const snap = cadSession.getSnapshot()
      const open = cadSession.document(args.documentId as string | undefined)
      if (!open) {
        return {
          kind: 'data',
          data: { documents: snap.documents, active: null, kernel: snap.kernel, hint: 'No document is open. Propose cad-modeler.new_document or cad-modeler.run_commands (it creates a document when none is open).' },
          summary: 'No CAD Modeler document is open',
        }
      }
      const regen = await open.engine.regenerate()
      const doc = open.engine.document
      return {
        kind: 'data',
        data: {
          documents: snap.documents,
          kernel: snap.kernel.info ?? null,
          document: { id: doc.documentId, title: doc.metadata.title, version: doc.version, regeneratedVersion: regen?.documentVersion ?? null, dirty: snap.documents.find((d) => d.id === doc.documentId)?.dirty ?? false },
          tree: featureTree(doc, regen),
          parameters: Object.fromEntries(doc.parts.map((p) => [p.id, parameterTable(doc, p.id)])),
          bodies: Object.fromEntries(doc.parts.map((p) => [p.id, regen ? massProperties(doc, regen, p.id) : []])),
          failures: failures(regen),
          references: doc.references,
        },
        summary: `Read ${doc.metadata.title} v${doc.version}: ${doc.parts.length} part(s), ${doc.parts.reduce((n, p) => n + p.features.length, 0)} feature(s), ${failures(regen).length} issue(s)`,
        inspected: [{ id: doc.documentId, detail: `CAD document “${doc.metadata.title}”, version ${doc.version}` }],
      }
    },
  },
  {
    name: 'cad-modeler.query',
    label: 'Query CAD model',
    description: `Run one structured read on the CAD model. Queries: ${QUERIES.map((q) => `${q.name} (${q.summary})`).join(' ')}`,
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', enum: QUERIES.map((q) => q.name) }, input: { type: 'object', description: 'Query input, e.g. { "sketchId": "sk-5" } for get_sketch.' }, documentId },
      required: ['query'],
      additionalProperties: false,
    },
    async run(args) {
      const query = String(args.query)
      const input = (args.input ?? {}) as Record<string, unknown>
      if (query === 'list_commands') return { kind: 'data', data: QUERIES.find((q) => q.name === 'list_commands')!.run({ doc: createDocument({ documentId: 'catalog' }), operations: () => [] }, input), summary: 'Read the CAD command catalogue' }
      const open = cadSession.document(args.documentId as string | undefined)
      if (!open) throw new ActionError('not-found', 'No CAD Modeler document is open.')
      await open.engine.regenerate()
      try {
        const data = open.engine.query(query, input)
        return { kind: 'data', data, summary: `Ran ${query} on ${open.engine.document.metadata.title} v${open.engine.document.version}`, inspected: [{ id: open.id, detail: `${query}, version ${open.engine.document.version}` }] }
      } catch (e) {
        const err = e as { code?: string; message?: string }
        throw new ActionError(err.code === 'not-found' ? 'not-found' : 'invalid-arguments', err.message ?? String(e))
      }
    },
  },
  {
    name: 'cad-modeler.run_commands',
    label: 'Prepare CAD modelling commands',
    description:
      `Propose a transaction of CAD commands (all apply or none). The commands are validated and the model is regenerated on a copy for the preview (predicted volumes, faces, failures); nothing changes until the user applies it. Commands: ${COMMANDS.map((c) => c.name).join(', ')}. ` +
      'Each item is { "command": name, "input": {...} }; see cad-modeler.query list_commands for input schemas. Use "ref": "$name" on create commands and "$name" (or "$name.field.index") in later commands of the same transaction. Lengths in mm, angles in degrees; values may be expressions over part parameters. When no document is open, a new one is created.',
    parameters: {
      type: 'object',
      properties: {
        commands: { type: 'array', items: { type: 'object' }, description: 'List of { command, input }.' },
        label: { type: 'string', description: 'Short description shown in the preview and the undo history.' },
        expectedVersion: { type: 'integer', description: 'Document version the commands were planned against (from describe_model); a mismatch is reported instead of applying.' },
        documentId,
      },
      required: ['commands'],
      additionalProperties: false,
    },
    async run(args) {
      const commands = validateCalls(args.commands)
      const docId = args.documentId as string | undefined
      const { open, version, dry } = await dryRunFor(docId, commands, args.expectedVersion as number | undefined)
      if (!dry.ok) {
        const where = dry.failedIndex !== undefined && dry.failedIndex >= 0 ? ` (command ${dry.failedIndex + 1}, ${commands[dry.failedIndex]?.command})` : ''
        throw new ActionError(dry.error?.code === 'version-conflict' ? 'conflict' : dry.error?.code === 'not-found' ? 'not-found' : 'invalid-arguments', `${dry.error?.message ?? 'The commands are not valid.'}${where}`)
      }
      const label = (typeof args.label === 'string' && args.label.trim()) || (commands.length === 1 ? commands[0].command.replace(/_/g, ' ') : `${commands.length} CAD commands`)
      const title = open ? `${label} in “${open.engine.document.metadata.title}”` : `${label} (new CAD document)`
      let before: CadDocument | undefined
      let appliedVersion: number | undefined
      let target = open?.id
      const proposal: ServiceProposal = {
        kind: 'service-proposal',
        module: MODULE,
        title,
        explanation: `${commands.length} command${commands.length === 1 ? '' : 's'} in one transaction against version ${version}${open ? '' : ' of a new document'}. The preview shows the regenerated result predicted by the kernel.`,
        preview: [
          ...(open ? [] : [{ label: 'New document', proposed: 'Untitled CAD Modeler document' }]),
          ...commands.map((c, i) => ({ label: `${i + 1}. ${c.command}`, proposed: describeInput(c) })),
          ...predictionItems(dry),
        ],
        assumptions: dry.after && !dry.after.ok ? ['The model will contain regeneration failures after this change (see the predicted failures).'] : undefined,
        inspected: open ? [{ id: open.id, detail: `CAD document version ${version}` }] : [],
        async apply() {
          const d = target ? cadSession.require(target) : await cadSession.newDocument({ source: 'assistant', empty: true })
          target = d.id
          before = d.engine.document
          const expected = open ? version : d.engine.document.version
          const result = await d.engine.execute({ commands, expectedVersion: expected, label: `Assistant: ${label}`, source: 'assistant' })
          if (!result.ok) throw new Error(`${result.error.message}${result.failedCommand ? ` (${result.failedCommand})` : ''}`)
          appliedVersion = result.version
          cadSession.setActive(d.id)
          const failed = result.regeneration ? failures(result.regeneration).filter((f) => f.status === 'failed' || f.status === 'blocked') : []
          return { summary: `Applied ${commands.length} CAD command${commands.length === 1 ? '' : 's'}: version ${result.version}${failed.length ? `, ${failed.length} feature(s) failed to regenerate` : ''}`, createdIds: result.affected.created }
        },
        async undo() {
          if (!target || !before || appliedVersion === undefined) throw new Error('Nothing to undo.')
          const d = cadSession.require(target)
          if (d.engine.document.version !== appliedVersion) throw new Error(`The model changed after this proposal was applied (now version ${d.engine.document.version}); undo it in the CAD Modeler instead.`)
          const r = await d.engine.restore(before, `Undo assistant: ${label}`, 'assistant', appliedVersion)
          return { summary: `Restored the model before “${label}” as version ${r.version}` }
        },
      }
      return proposal
    },
  },
  {
    name: 'cad-modeler.undo',
    label: 'Prepare CAD undo',
    description: 'Propose undoing the last transaction of the CAD document (whoever made it). Undo creates a new version; Redo is available in the CAD Modeler.',
    parameters: { type: 'object', properties: { documentId }, additionalProperties: false },
    async run(args) {
      const d = cadSession.document(args.documentId as string | undefined)
      if (!d) throw new ActionError('not-found', 'No CAD Modeler document is open.')
      const state = d.engine.getState()
      if (!state.canUndo) throw new ActionError('no-op', 'There is nothing to undo in this document.')
      const version = d.engine.document.version
      return {
        kind: 'service-proposal',
        module: MODULE,
        title: `Undo “${state.undoLabel}”`,
        explanation: `Restores “${d.engine.document.metadata.title}” to its state before “${state.undoLabel}” (from version ${version}).`,
        preview: [{ targetId: d.id, label: 'Undo', current: `version ${version}`, proposed: `state before “${state.undoLabel}” as version ${version + 1}` }],
        async apply() {
          const r = await d.engine.undo('assistant', version)
          return { summary: `Undid “${state.undoLabel}” (version ${r.version})` }
        },
      }
    },
  },
  {
    name: 'cad-modeler.new_document',
    label: 'Prepare new CAD document',
    description: 'Propose creating a new CAD Modeler document with one empty part, and make it active.',
    parameters: { type: 'object', properties: { title: { type: 'string' }, partName: { type: 'string' } }, additionalProperties: false },
    async run(args) {
      const title = (args.title as string | undefined)?.trim() || 'Untitled'
      const partName = (args.partName as string | undefined)?.trim() || 'Part 1'
      return {
        kind: 'service-proposal',
        module: MODULE,
        title: `New CAD document “${title}”`,
        explanation: 'Creates a document in this window’s CAD Modeler session. Save it to keep it.',
        preview: [{ label: 'New document', proposed: `${title} with part “${partName}”` }],
        async apply() {
          const d = await cadSession.newDocument({ title, partName, source: 'assistant' })
          return { summary: `Created “${title}” (${d.id})`, createdIds: [d.id] }
        },
      }
    },
  },
  {
    name: 'cad-modeler.open_document',
    label: 'Prepare opening a CAD document',
    description:
      'Propose opening a CAD document: a document stored in the project (documentId, optional revision; see cad-modeler.list_documents) or a native ews-cad document given as JSON (document). It is validated before the preview and regenerated when opened.',
    parameters: { type: 'object', properties: { documentId: { type: 'string' }, revision: { type: 'integer' }, document: { type: 'object' }, fileName: { type: 'string' } }, additionalProperties: false },
    async run(args, ctx) {
      if (typeof args.documentId === 'string') {
        const store = cadSession.storeClient
        if (!store) throw new ActionError('not-allowed', 'No CAD document service is connected in this window; pass the native document as JSON instead.')
        const projectId = ctx.captured.projectId
        const revision = typeof args.revision === 'number' ? args.revision : undefined
        let found
        try {
          found = await store.get(projectId, args.documentId, revision)
        } catch (e) {
          throw new ActionError('not-found', (e as Error).message)
        }
        return {
          kind: 'service-proposal',
          module: MODULE,
          title: `Open “${found.summary.title}” from ${projectId}`,
          explanation: `Opens revision ${found.revision.revision} of ${found.summary.id} (current revision ${found.summary.revision}) and regenerates it.`,
          preview: [{ targetId: found.summary.id, label: 'Open stored document', proposed: `${found.summary.title}, revision ${found.revision.revision} by ${found.revision.actor}` }],
          inspected: [{ id: found.summary.id, detail: `stored CAD document, revision ${found.summary.revision}` }],
          async apply() {
            const d = await cadSession.openFromStore(projectId, found.summary.id, revision)
            return { summary: `Opened “${found.summary.title}” revision ${found.revision.revision}`, createdIds: [d.id] }
          },
        }
      }
      if (!args.document) throw new ActionError('invalid-arguments', 'Give a documentId (stored in the project) or a document (native JSON).')
      const text = JSON.stringify(args.document)
      let doc: CadDocument
      try {
        doc = parseDocument(text)
      } catch (e) {
        throw new ActionError('invalid-arguments', (e as Error).message)
      }
      return {
        kind: 'service-proposal',
        module: MODULE,
        title: `Open “${doc.metadata.title}”`,
        explanation: `Opens the native document ${doc.documentId} (version ${doc.version}, ${doc.parts.length} part(s)) and regenerates it.`,
        preview: [{ targetId: doc.documentId, label: 'Open document', proposed: `${doc.metadata.title}, version ${doc.version}` }],
        async apply() {
          const d = await cadSession.openDocument(doc, typeof args.fileName === 'string' ? args.fileName : undefined)
          return { summary: `Opened “${doc.metadata.title}”`, createdIds: [d.id] }
        },
      }
    },
  },
  {
    name: 'cad-modeler.list_documents',
    label: 'List stored CAD documents',
    description: 'CAD documents stored in the current project (CAD service), with current revision, author and time. Empty with an explanation when no service is connected.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async run(_args, ctx) {
      const store = cadSession.storeClient
      if (!store) return { kind: 'data', data: { documents: [], note: 'No CAD document service is connected in this window (files only).' }, summary: 'No CAD document service connected' }
      try {
        const documents = await store.list(ctx.captured.projectId)
        return { kind: 'data', data: { projectId: ctx.captured.projectId, store: store.mode, documents }, summary: `Found ${documents.length} stored CAD document(s) in ${ctx.captured.projectId}`, inspected: documents.map((d) => ({ id: d.id, detail: `${d.title}, revision ${d.revision}` })) }
      } catch (e) {
        throw new ActionError('unavailable', (e as Error).message)
      }
    },
  },
  {
    name: 'cad-modeler.save_document',
    label: 'Prepare saving a CAD revision',
    description:
      'Propose saving the active document as a new revision in the project (CAD service). The revision records this conversation and proposal as its provenance. A newer revision saved by someone else makes Apply fail without overwriting anything.',
    parameters: { type: 'object', properties: { message: { type: 'string' }, documentId }, additionalProperties: false },
    async run(args, ctx) {
      const store = cadSession.storeClient
      if (!store) throw new ActionError('not-allowed', 'No CAD document service is connected in this window; use cad-modeler.export with format ewscad to download the file.')
      const d = cadSession.document(args.documentId as string | undefined)
      if (!d) throw new ActionError('not-found', 'No CAD Modeler document is open.')
      const projectId = ctx.captured.projectId
      const message = typeof args.message === 'string' ? args.message : ''
      const base = d.stored?.revision
      return {
        kind: 'service-proposal',
        module: MODULE,
        title: `Save “${d.engine.document.metadata.title}” to ${projectId}`,
        explanation: base ? `Creates revision ${base + 1} (based on revision ${base}).` : 'Stores the document in the project as revision 1.',
        preview: [{ targetId: d.id, label: 'Revision', current: base ? `revision ${base}` : 'not stored', proposed: `${base ? `revision ${base + 1}` : 'revision 1'}${message ? `: ${message}` : ''} (model version ${d.engine.document.version})` }],
        async apply(provenance) {
          const r = await cadSession.saveToStore(projectId, d.id, { message, provenance: { sourceKind: 'assistant', ...provenance } })
          return { summary: r.unchanged ? `No changes since revision ${r.revision}` : `Saved revision ${r.revision} in ${projectId}` }
        },
      }
    },
  },
  {
    name: 'cad-modeler.export',
    label: 'Prepare CAD export',
    description: 'Propose exporting the active document: "step" writes STEP AP242 (exact B-rep with names, units, colours; no feature history) of a part; "ewscad" saves the native parametric file. The file is downloaded on the user’s computer after Apply; the result includes a structural report of the STEP file.',
    parameters: { type: 'object', properties: { format: { type: 'string', enum: ['step', 'ewscad'] }, partId: { type: 'string' }, documentId }, required: ['format'], additionalProperties: false },
    async run(args) {
      const d = cadSession.document(args.documentId as string | undefined)
      if (!d) throw new ActionError('not-found', 'No CAD Modeler document is open.')
      const format = args.format as 'step' | 'ewscad'
      const regen = await d.engine.regenerate()
      if (format === 'step') {
        const partId = (args.partId as string | undefined) ?? d.engine.document.parts[0]?.id
        const bodies = regen?.parts.find((p) => p.partId === partId)?.bodies ?? []
        if (!bodies.length) throw new ActionError('not-allowed', 'The part has no solid body to export yet.')
      }
      return {
        kind: 'service-proposal',
        module: MODULE,
        title: format === 'step' ? `Export STEP AP242 of “${d.engine.document.metadata.title}”` : `Save “${d.engine.document.metadata.title}” as .ewscad`,
        explanation: format === 'step' ? 'Writes exact solid geometry with part name, millimetre units and colour. STEP does not carry the feature history; the native file does.' : 'Writes the complete parametric model in the open ews-cad format.',
        preview: [{ targetId: d.id, label: 'File', proposed: format === 'step' ? `${d.engine.document.parts[0]?.name ?? 'part'}.step, document version ${d.engine.document.version}` : `${d.fileName}, version ${d.engine.document.version}` }],
        async apply() {
          if (format === 'ewscad') {
            const f = cadSession.save(d.id)
            return { summary: `Saved ${f.name} (${f.content.length} bytes)` }
          }
          const r = await cadSession.exportStep(d.id, args.partId as string | undefined)
          const s = r.inspection
          return { summary: `Exported ${r.file.name}: ${s.applicationProtocol}, ${s.entities.MANIFOLD_SOLID_BREP} solid(s), ${s.entities.ADVANCED_FACE} faces, unit ${s.lengthUnit}${s.valid ? '' : `, problems: ${s.problems.join(' ')}`}` }
        },
      }
    },
  },
]

// ---- demo planning (DEMO ONLY, SDK 1.5): deterministic prompts for the scripted assistant -------

const NUM = '(\\d+(?:\\.\\d+)?)'

/** Commands for a rectangular plate (optionally with a centred through hole), all parameter-driven. */
export function plateCommands(w: number, d: number, t: number, hole?: number): CommandCall[] {
  const open = cadSession.active
  const part = open?.engine.document.parts[0]?.id
  const head: CommandCall[] = part ? [] : [{ command: 'create_part', input: { name: 'Plate', ref: '$p' } }]
  const p = part ?? '$p'
  const params = part ? new Set(open!.engine.document.parts[0].parameters.map((x) => x.name)) : new Set<string>()
  const param = (name: string, value: number): CommandCall =>
    params.has(name) ? { command: 'set_parameter', input: { partId: p, name, expression: String(value) } } : { command: 'create_parameter', input: { partId: p, name, expression: String(value) } }
  const out: CommandCall[] = [
    ...head,
    param('width', w),
    param('depth', d),
    param('thickness', t),
    { command: 'create_sketch', input: { partId: p, plane: 'XY', name: 'Plate sketch', ref: '$s' } },
    { command: 'add_rectangle', input: { sketchId: '$s', width: 'width', height: 'depth', ref: '$r' } },
    { command: 'extrude_profile', input: { sketchId: '$s', distance: 'thickness', name: 'Plate', ref: '$e' } },
  ]
  if (hole) {
    out.splice(head.length + 3, 0, param('hole_d', hole))
    out.push(
      { command: 'create_sketch', input: { partId: p, plane: 'XY', name: 'Hole sketch', ref: '$h' } },
      { command: 'add_circle', input: { sketchId: '$h', center: [w / 2, d / 2], radius: hole / 2, ref: '$c' } },
      { command: 'apply_constraint', input: { sketchId: '$h', type: 'diameter', entities: ['$c'], value: 'hole_d' } },
      { command: 'apply_constraint', input: { sketchId: '$h', type: 'distance-x', entities: ['origin', '$c.center'], value: 'width / 2' } },
      { command: 'apply_constraint', input: { sketchId: '$h', type: 'distance-y', entities: ['origin', '$c.center'], value: 'depth / 2' } },
      { command: 'extrude_profile', input: { sketchId: '$h', distance: 'thickness', operation: 'cut', name: 'Hole', ref: '$x' } },
    )
  }
  return out
}

export const cadModelerDemo: DemoPlanner = (text) => {
  const t = text.toLowerCase()
  const plate = new RegExp(`\\b(?:plate|block)\\b[^\\d]*${NUM}\\s*(?:mm)?\\s*[x×]\\s*${NUM}\\s*(?:mm)?\\s*[x×]\\s*${NUM}`).exec(t)
  if (plate && /\b(create|make|model|build|design)\b/.test(t)) {
    const hole = new RegExp(`${NUM}\\s*mm\\s+(?:diameter\\s+)?(?:through\\s+)?hole|hole\\s+(?:of\\s+)?${NUM}`).exec(t)
    const [w, d, th] = plate.slice(1, 4).map(Number)
    const h = hole ? Number(hole[1] ?? hole[2]) : undefined
    return {
      reply: `(Demo planner.) I prepared a parametric plate ${w} × ${d} × ${th} mm${h ? ` with a ${h} mm through hole` : ''} in the CAD Modeler: parameters width, depth and thickness${h ? ', hole_d' : ''}, a constrained rectangle sketch and an extrusion${h ? ', then a hole sketch and a cut' : ''}. The preview shows the volume predicted by the kernel.`,
      calls: [{ name: 'cad-modeler.run_commands', arguments: { label: `Plate ${w} × ${d} × ${th}${h ? ` with ${h} mm hole` : ''}`, commands: plateCommands(w, d, th, h) } }],
    }
  }
  const set = new RegExp(`\\b(?:set|change|make)\\s+(?:the\\s+)?(?:cad\\s+)?(?:parameter\\s+)?([a-z][a-z0-9_]*)\\s+(?:to|=)\\s*${NUM}`).exec(t)
  const open = cadSession.active
  if (set && open) {
    const part = open.engine.document.parts.find((p) => p.parameters.some((x) => x.name.toLowerCase() === set[1]))
    if (part) {
      const name = part.parameters.find((x) => x.name.toLowerCase() === set[1])!.name
      return {
        reply: `(Demo planner.) I prepared changing ${name} to ${set[2]}. Dependent sketches and features regenerate; the preview shows the predicted result.`,
        calls: [{ name: 'cad-modeler.run_commands', arguments: { label: `Set ${name} = ${set[2]}`, commands: [{ command: 'set_parameter', input: { partId: part.id, name, expression: set[2] } }], expectedVersion: open.engine.document.version } }],
      }
    }
  }
  const blend = new RegExp(`\\b(fillet|round|chamfer|bevel)\\b.*\\b(vertical|top|bottom|all)\\b.*?\\bedges?\\b.*?${NUM}\\s*mm`).exec(t)
  if (blend && open && /\b(cad|part|plate|block)\b/.test(t)) {
    const body = open.engine.regeneration?.parts[0]?.bodies.at(-1)
    const kind = /fillet|round/.test(blend[1]) ? 'fillet' : 'chamfer'
    const which = blend[2]
    const edges = (body?.analysis.edges ?? [])
      .filter((e) => e.faces.length === 2 && !e.name.includes('face#'))
      .filter((e) => {
        // The role is the part after the feature ID ("side:ln-8", "cap-end", "blend:…").
        const role = (f: string) => f.slice(f.indexOf('/') + 1)
        const sides = e.faces.filter((f) => role(f).startsWith('side:')).length
        if (which === 'vertical') return sides === 2
        if (which === 'top') return sides === 1 && e.faces.some((f) => role(f).startsWith('cap-end'))
        if (which === 'bottom') return sides === 1 && e.faces.some((f) => role(f).startsWith('cap-start'))
        return true
      })
      .map((e) => e.name)
    if (edges.length) {
      const size = Number(blend[3])
      return {
        reply: `(Demo planner.) I prepared a ${kind} of ${size} mm on the ${which} edges (${edges.length}), chosen by their stable names. The preview shows the predicted volume.`,
        calls: [{ name: 'cad-modeler.run_commands', arguments: { label: `${kind === 'fillet' ? 'Fillet' : 'Chamfer'} ${which} edges ${size} mm`, commands: [{ command: kind === 'fillet' ? 'fillet_edges' : 'chamfer_edges', input: { edges, ...(kind === 'fillet' ? { radius: size } : { distance: size }) } }], expectedVersion: open.engine.document.version } }],
      }
    }
  }
  if (/\b(cad|part|model)\b/.test(t) && /\b(describe|summari[sz]e|what is|show|volume|mass|status|failures?)\b/.test(t) && /\bcad\b|\bvolume\b|\bpart\b/.test(t))
    return { reply: '(Demo planner.) Here is the CAD Modeler model as structured data: features, parameters, bodies and failures.', calls: [{ name: 'cad-modeler.describe_model', arguments: {} }] }
  if (/\bsave\b/.test(t) && /\bcad\b/.test(t) && cadSession.storeClient && open) {
    const message = /["“](.+?)["”]/.exec(text)?.[1] ?? ''
    return { reply: '(Demo planner.) I prepared saving the active CAD document as a new revision in this project; the revision records this conversation.', calls: [{ name: 'cad-modeler.save_document', arguments: message ? { message } : {} }] }
  }
  if (/\bexport\b.*\bstep\b|\bstep\b.*\bexport\b/.test(t)) return { reply: '(Demo planner.) I prepared a STEP AP242 export of the active CAD document.', calls: [{ name: 'cad-modeler.export', arguments: { format: 'step' } }] }
  if (/\bundo\b.*\bcad\b|\bcad\b.*\bundo\b/.test(t)) return { reply: '(Demo planner.) I prepared undoing the last CAD change.', calls: [{ name: 'cad-modeler.undo', arguments: {} }] }
  return null
}

export const cadModelerAssistant: AssistantContribution = { actions, demo: cadModelerDemo }
