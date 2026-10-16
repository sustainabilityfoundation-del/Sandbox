import { CadEngine, COMMANDS, MEDIA_TYPE, QUERIES, applyTransaction, createDocument, featureTree, failures, massProperties, parameterTable, parseDocument, serializeDocument, type CadDocument, type CommandCall, type DryRunResult } from '@ews/cad-core'
import { ActionError, type AssistantActionContext, type AssistantActionDefinition, type AssistantContribution, type DeclarativeProposal, type DemoPlanner, type ServiceProposal, type ServiceProposalItem } from '@ews/platform-sdk'
import { cadSession, type OpenDocument } from './session'
import { runChecks, type CheckRequest, type MeasureSpec } from './checks'
import pkg from '../package.json'

/**
 * Assistant operations for the CAD Modeler (contracts §5, ADR-0023). Reads return structured data
 * from the same queries the inspector and diagnostics use. Every mutation is a service proposal: the
 * commands are validated and regenerated on a copy (dry run) for the preview, and only Apply runs
 * them, through the same executor as the toolbar and dialogs, with the model version captured at
 * preview time. Nothing is written by an action itself.
 *
 * Headless (contract C9): every operation works with no CAD Modeler view mounted. A target that is
 * not open is loaded from the CAD document service of the captured project (the injected client;
 * later PlatformServices.cad). Regeneration, dry runs and previews run in the kernel worker. While
 * no view is mounted, an applied change is also saved as a new revision with the proposal's
 * provenance, so it is durable without the tab. A document stored in another project is refused
 * (C13).
 */

export const MODULE = 'cad-modeler'

const documentId = { type: 'string', description: 'Document ID. Default: the active CAD Modeler document of this project, else the only document stored in the project. A stored document that is not open is loaded from the project.' }

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

/**
 * The document an operation acts on, without needing a view (C9):
 * 1. a given documentId that is open in this window;
 * 2. a given documentId loaded from the project's CAD service (headless, the view's active document
 *    is kept);
 * 3. without an ID, the active document if it belongs to this project;
 * 4. else the project's only stored document. With several, the caller must choose (documentId).
 * Documents stored in another project are refused (C13).
 */
export async function resolveDocument(args: Record<string, unknown>, ctx: AssistantActionContext, options: { allowNone?: boolean; createsDocument?: boolean } = {}): Promise<OpenDocument | undefined> {
  const projectId = ctx.captured.projectId
  const id = typeof args.documentId === 'string' ? args.documentId : undefined
  const inProject = (d: OpenDocument) => (d.stored?.projectId ?? d.projectId ?? projectId) === projectId
  const store = cadSession.storeClient
  const load = async (docId: string) => {
    try {
      return await cadSession.openFromStore(projectId, docId, undefined, { activate: false })
    } catch (e) {
      const err = e as { code?: string; message?: string }
      throw new ActionError(err.code === 'forbidden' ? 'not-allowed' : err.code === 'unavailable' ? 'unavailable' : 'not-found', err.message ?? String(e))
    }
  }
  if (id) {
    const open = cadSession.document(id)
    if (open) {
      if (!inProject(open)) throw new ActionError('not-allowed', `CAD document ${id} is stored in project ${open.stored?.projectId ?? open.projectId}, not in ${projectId}.`)
      return open
    }
    if (!store) throw new ActionError('not-found', `CAD document ${id} is not open, and no CAD document service is connected in this window.`)
    return load(id)
  }
  const active = cadSession.active
  if (active && inProject(active)) return active
  // The window's views may show another project; look for this project's open documents too.
  const openHere = cadSession.openDocuments().filter(inProject)
  if (openHere.length === 1) return openHere[0]
  // With a view mounted, an unnamed target means what the person sees: nothing open → a new document.
  if (options.allowNone && cadSession.viewMounted) return undefined
  if (store) {
    let docs
    try {
      docs = await store.list(projectId)
    } catch (e) {
      throw new ActionError('unavailable', (e as Error).message)
    }
    if (docs.length === 1) return cadSession.document(docs[0].id) ?? load(docs[0].id)
    // A self-contained creation (starting with create_part) makes a new document instead of guessing.
    if (docs.length > 1 && options.allowNone && options.createsDocument) return undefined
    if (docs.length > 1) throw new ActionError('invalid-arguments', `Project ${projectId} has ${docs.length} CAD documents; pass documentId (${docs.slice(0, 8).map((d) => `${d.id} “${d.title}”`).join(', ')}). See cad-modeler.list_documents.`)
  }
  if (options.allowNone) return undefined
  throw new ActionError('not-found', `No CAD Modeler document is open or stored in project ${projectId}. Propose cad-modeler.new_document or cad-modeler.run_commands (it creates a document).`)
}

/** While no view is mounted, applied changes are saved as revisions (when a CAD service is connected). */
const persistsOnApply = () => !cadSession.viewMounted && !!cadSession.storeClient

async function dryRunFor(open: OpenDocument | undefined, commands: CommandCall[], expectedVersion: number | undefined) {
  // Without an open document the commands are previewed on a new, empty document.
  const engine = open?.engine ?? new CadEngine({ ...cadSession.engineOptions(), document: createDocument({ documentId: 'preview', title: 'New document' }) })
  const version = expectedVersion ?? engine.document.version
  const dry = await engine.dryRun({ commands, expectedVersion: version, source: 'assistant' })
  if (!open) await engine.dispose()
  return { open, version, dry }
}


const MEASURE_KINDS = ['parameter', 'dimension', 'bounding-size', 'volume', 'surface-area', 'mass', 'pattern-spacing', 'pattern-gap', 'pattern-count']

/** Checks requested by the assistant: a measurement and a constraint ID (bounds are never accepted). */
function validateCheckRequests(raw: unknown): CheckRequest[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new ActionError('invalid-arguments', '“checks” must be a list.')
  return raw.map((c, i) => {
    const extra = (o: unknown, allowed: string[], where: string) => {
      const bad = o && typeof o === 'object' ? Object.keys(o).filter((key) => !allowed.includes(key)) : []
      if (bad.length) throw new ActionError('invalid-arguments', `${where} does not accept ${bad.join(', ')}${bad.some((b) => /bound|value|min|max|limit/.test(b)) ? ': bounds are read from the constraint, never given' : ''}.`)
    }
    extra(c, ['measure', 'constraint', 'partId'], `checks[${i}]`)
    extra((c as { constraint?: unknown })?.constraint, ['id', 'revision'], `checks[${i}].constraint`)
    extra((c as { measure?: unknown })?.measure, ['kind', 'name', 'constraintId', 'axis', 'featureId'], `checks[${i}].measure`)
    const m = (c as { measure?: Record<string, unknown> })?.measure
    const k = m?.kind
    if (!m || typeof k !== 'string' || !MEASURE_KINDS.includes(k)) throw new ActionError('invalid-arguments', `checks[${i}].measure.kind must be one of ${MEASURE_KINDS.join(', ')}.`)
    const need = (field: string) => {
      if (typeof m[field] !== 'string' || !(m[field] as string).trim()) throw new ActionError('invalid-arguments', `checks[${i}].measure.${field} is required for ${k}.`)
    }
    if (k === 'parameter') need('name')
    if (k === 'dimension' && !m.name && !m.constraintId) throw new ActionError('invalid-arguments', `checks[${i}].measure needs name or constraintId for a dimension.`)
    if (k === 'bounding-size' && !['x', 'y', 'z', 'max', 'min'].includes(String(m.axis))) throw new ActionError('invalid-arguments', `checks[${i}].measure.axis must be x, y, z, max or min.`)
    if (k.startsWith('pattern-')) need('featureId')
    const constraint = (c as { constraint?: { id?: unknown; revision?: unknown } }).constraint
    if (!constraint || typeof constraint.id !== 'string' || !constraint.id) throw new ActionError('invalid-arguments', `checks[${i}].constraint.id (a Conceptualize constraint) is required; bounds are read from it.`)
    return { measure: m as unknown as MeasureSpec, constraint: { id: constraint.id, ...(typeof constraint.revision === 'number' ? { revision: constraint.revision } : {}) }, ...(typeof (c as { partId?: unknown }).partId === 'string' ? { partId: (c as { partId: string }).partId } : {}) }
  })
}

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Export without download: the file and (STEP) the read-back report, as data for another operation. */
async function exportForReturn(d: OpenDocument, format: 'step' | 'ewscad', partId?: string) {
  const doc = d.engine.document
  const provenanceOf = { documentId: doc.documentId, documentRevision: d.stored?.revision ?? null, modelVersion: doc.version, unsavedChanges: !!d.stored && cadSession.isDirty(d) }
  if (format === 'ewscad') {
    const content = serializeDocument(doc)
    const file = { name: d.fileName, mediaType: MEDIA_TYPE, encoding: 'utf-8', size: new TextEncoder().encode(content).length, sha256: await sha256(content), content }
    return { kind: 'data' as const, data: { format, file, ...provenanceOf }, summary: `Native file ${file.name} (${file.size} bytes)`, inspected: [{ id: d.id, detail: `CAD document, model version ${doc.version}` }] }
  }
  let r
  try {
    r = await cadSession.exportStep(d.id, partId, { download: false })
  } catch (e) {
    throw new ActionError('not-allowed', (e as Error).message)
  }
  const file = { name: r.file.name, mediaType: r.file.mime, encoding: 'utf-8', size: new TextEncoder().encode(r.file.content).length, sha256: await sha256(r.file.content), content: r.file.content }
  const s = r.inspection
  return {
    kind: 'data' as const,
    data: {
      format,
      file,
      partId: r.partId,
      inspection: { valid: s.valid, problems: s.problems, applicationProtocol: s.applicationProtocol, schema: s.schema, lengthUnit: s.lengthUnit, solids: s.entities.MANIFOLD_SOLID_BREP ?? 0, faces: s.entities.ADVANCED_FACE ?? 0, products: s.products },
      readBack: r.readBack,
      note: 'STEP carries geometry only; the native ews-cad document keeps the parameters and feature history.',
      ...provenanceOf,
    },
    summary: `STEP ${file.name} (${file.size} bytes): read back ${r.readBack.ok ? 'matches the native model' : `differs (${r.readBack.differences.join('; ')})`}`,
    inspected: [{ id: d.id, detail: `STEP export of ${r.partId}, model version ${r.version}` }],
  }
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
    async run(args, ctx) {
      const open = await resolveDocument(args, ctx, { allowNone: true })
      const snap = cadSession.getSnapshot()
      if (!open) {
        return {
          kind: 'data',
          data: { documents: snap.documents, active: null, kernel: snap.kernel, hint: `No CAD document is open or stored in project ${ctx.captured.projectId}. Propose cad-modeler.new_document or cad-modeler.run_commands (it creates a document when none is open).` },
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
          document: { id: doc.documentId, title: doc.metadata.title, version: doc.version, regeneratedVersion: regen?.documentVersion ?? null, dirty: snap.documents.find((d) => d.id === doc.documentId)?.dirty ?? false, stored: open.stored ?? null },
          regeneration: { location: regen?.location ?? null },
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
    async run(args, ctx) {
      const query = String(args.query)
      const input = (args.input ?? {}) as Record<string, unknown>
      if (query === 'list_commands') return { kind: 'data', data: QUERIES.find((q) => q.name === 'list_commands')!.run({ doc: createDocument({ documentId: 'catalog' }), operations: () => [] }, input), summary: 'Read the CAD command catalogue' }
      const open = (await resolveDocument(args, ctx))!
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
      'Each item is { "command": name, "input": {...} }; see cad-modeler.query list_commands for input schemas. Use "ref": "$name" on create commands and "$name" (or "$name.field.index") in later commands of the same transaction. Lengths in mm, angles in degrees; values may be expressions over part parameters. When no document is open, a new one is created (name it with "title"). When no CAD Modeler view is open and the project has a CAD service, Apply also saves the result as a new revision (the result says which); cad-modeler.save_document is then not needed.',
    parameters: {
      type: 'object',
      properties: {
        commands: { type: 'array', items: { type: 'object' }, description: 'List of { command, input }.' },
        label: { type: 'string', description: 'Short description shown in the preview and the undo history.' },
        title: { type: 'string', maxLength: 200, description: 'Title of the new document when the commands create one (ignored for an existing document).' },
        expectedVersion: { type: 'integer', description: 'Document version the commands were planned against (from describe_model); a mismatch is reported instead of applying.' },
        documentId,
      },
      required: ['commands'],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const commands = validateCalls(args.commands)
      const projectId = ctx.captured.projectId
      const { open, version, dry } = await dryRunFor(await resolveDocument(args, ctx, { allowNone: true, createsDocument: commands[0]?.command === 'create_part' }), commands, args.expectedVersion as number | undefined)
      const persist = persistsOnApply()
      if (!dry.ok) {
        const where = dry.failedIndex !== undefined && dry.failedIndex >= 0 ? ` (command ${dry.failedIndex + 1}, ${commands[dry.failedIndex]?.command})` : ''
        throw new ActionError(dry.error?.code === 'version-conflict' ? 'conflict' : dry.error?.code === 'not-found' ? 'not-found' : 'invalid-arguments', `${dry.error?.message ?? 'The commands are not valid.'}${where}`)
      }
      const label = (typeof args.label === 'string' && args.label.trim()) || (commands.length === 1 ? commands[0].command.replace(/_/g, ' ') : `${commands.length} CAD commands`)
      const newTitle = typeof args.title === 'string' && args.title.trim() ? args.title.trim().slice(0, 200) : undefined
      const title = open ? `${label} in “${open.engine.document.metadata.title}”` : `${label} (new CAD document${newTitle ? ` “${newTitle}”` : ''})`
      // Declarative (SDK 1.8): with no view mounted and the CAD service as the platform API, the change is
      // a new stored revision. The resulting document is computed here (same commands, same validation)
      // and the platform applies it through the CAD API, with If-Match and the expected revision. Documents
      // with local unsaved changes, local stores and file-only sessions keep the closure (labelled fallback).
      if (persist && cadSession.storeClient?.mode === 'api' && (!open || (open.stored && !cadSession.isDirty(open)))) {
        const baseDoc = open ? open.engine.document : createDocument({ title: newTitle ?? 'Untitled' })
        const out = applyTransaction(baseDoc, { commands, expectedVersion: baseDoc.version, label: `Assistant: ${label}`, source: 'assistant' })
        if (!out.ok) throw new ActionError('invalid-arguments', out.error.message)
        const document = cadSession.stampForStore(out.doc)
        const message = `Assistant: ${label}`
        const docsPath = `/projects/${encodeURIComponent(projectId)}/documents`
        const result: DeclarativeProposal = {
          kind: 'declarative-proposal',
          module: MODULE,
          title,
          explanation: `${commands.length} command${commands.length === 1 ? '' : 's'} in one transaction${open ? ` against revision ${open.stored!.revision} (model version ${version})` : ' in a new document'}. The preview shows the regenerated result predicted by the kernel; Apply stores the result as ${open ? `revision ${open.stored!.revision + 1}` : 'revision 1'} in ${projectId}.`,
          preview: [
            ...(open ? [] : [{ label: 'New document', proposed: newTitle ?? 'Untitled CAD Modeler document' }]),
            ...commands.map((c, i) => ({ label: `${i + 1}. ${c.command}`, proposed: describeInput(c) })),
            ...predictionItems(dry),
            { targetId: open?.id ?? document.documentId, label: 'Saved to the project', proposed: open ? `revision ${open.stored!.revision + 1} of ${open.id} in ${projectId}` : `new document ${document.documentId} (revision 1) in ${projectId}` },
          ],
          assumptions: dry.after && !dry.after.ok ? ['The model will contain regeneration failures after this change (see the predicted failures).'] : undefined,
          inspected: open ? [{ id: open.id, detail: `CAD document revision ${open.stored!.revision}, model version ${version}` }] : [],
          operations: open
            ? [{ module: MODULE, operationId: 'saveRevision', method: 'PUT', path: `${docsPath}/${open.id}`, body: { document, message }, ifMatch: `"${open.stored!.revision}"` }]
            : [{ module: MODULE, operationId: 'createDocument', method: 'POST', path: docsPath, body: { document, message } }],
          ...(open
            ? { expected: [{ module: MODULE, kind: 'cad-document', id: open.id, label: open.engine.document.metadata.title, revision: open.stored!.revision, read: { operationId: 'getDocument', path: `${docsPath}/${open.id}`, field: 'summary.revision' } }] }
            : {}),
          projectId,
        }
        return result
      }
      let before: CadDocument | undefined
      let appliedVersion: number | undefined
      let target = open?.id
      const proposal: ServiceProposal = {
        kind: 'service-proposal',
        module: MODULE,
        title,
        explanation: `${commands.length} command${commands.length === 1 ? '' : 's'} in one transaction against version ${version}${open ? '' : ' of a new document'}. The preview shows the regenerated result predicted by the kernel.`,
        preview: [
          ...(open ? [] : [{ label: 'New document', proposed: newTitle ?? 'Untitled CAD Modeler document' }]),
          ...commands.map((c, i) => ({ label: `${i + 1}. ${c.command}`, proposed: describeInput(c) })),
          ...predictionItems(dry),
          ...(persist ? [{ targetId: open?.id, label: 'Saved to the project', proposed: open?.stored ? `revision ${open.stored.revision + 1} of ${open.id} in ${projectId}` : `new stored document in ${projectId}` }] : []),
        ],
        assumptions: dry.after && !dry.after.ok ? ['The model will contain regeneration failures after this change (see the predicted failures).'] : undefined,
        inspected: open ? [{ id: open.id, detail: `CAD document version ${version}` }] : [],
        async apply(provenance) {
          const d = target ? cadSession.require(target) : await cadSession.newDocument({ source: 'assistant', empty: true, projectId, ...(newTitle ? { title: newTitle } : {}) })
          target = d.id
          before = d.engine.document
          const expected = open ? version : d.engine.document.version
          const result = await d.engine.execute({ commands, expectedVersion: expected, label: `Assistant: ${label}`, source: 'assistant' })
          if (!result.ok) throw new Error(`${result.error.message}${result.failedCommand ? ` (${result.failedCommand})` : ''}`)
          appliedVersion = result.version
          if (cadSession.viewMounted) cadSession.setActive(d.id)
          let saved = ''
          if (persist) {
            try {
              const r = await cadSession.saveToStore(projectId, d.id, { message: `Assistant: ${label}`, provenance: { sourceKind: 'assistant', ...provenance } })
              saved = r.unchanged ? `; already stored as revision ${r.revision} in ${projectId}` : `; saved as revision ${r.revision} of document ${d.id} in ${projectId} (no separate save needed)`
            } catch (e) {
              // Not durable: put the in-memory model back so nothing diverges from the project.
              await d.engine.restore(before, `Revert assistant: ${label}`, 'assistant', result.version)
              throw new Error(`The change was not saved: ${(e as Error).message}`)
            }
          }
          const failed = result.regeneration ? failures(result.regeneration).filter((f) => f.status === 'failed' || f.status === 'blocked') : []
          return { summary: `Applied ${commands.length} CAD command${commands.length === 1 ? '' : 's'}: version ${result.version}${failed.length ? `, ${failed.length} feature(s) failed to regenerate` : ''}${saved}`, createdIds: result.affected.created }
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
    async run(args, ctx) {
      const d = (await resolveDocument(args, ctx))!
      const state = d.engine.getState()
      if (!state.canUndo) throw new ActionError('no-op', 'There is nothing to undo in this document.')
      const version = d.engine.document.version
      return {
        kind: 'service-proposal',
        module: MODULE,
        title: `Undo “${state.undoLabel}”`,
        explanation: `Restores “${d.engine.document.metadata.title}” to its state before “${state.undoLabel}” (from version ${version}).`,
        preview: [
          { targetId: d.id, label: 'Undo', current: `version ${version}`, proposed: `state before “${state.undoLabel}” as version ${version + 1}` },
          ...(persistsOnApply() && d.stored ? [{ targetId: d.id, label: 'Saved to the project', proposed: `revision ${d.stored.revision + 1} of ${d.id} in ${ctx.captured.projectId}` }] : []),
        ],
        async apply(provenance) {
          const r = await d.engine.undo('assistant', version)
          const saved = persistsOnApply() && d.stored ? await cadSession.saveToStore(ctx.captured.projectId, d.id, { message: `Assistant: undo “${state.undoLabel}”`, provenance: { sourceKind: 'assistant', ...provenance } }) : null
          return { summary: `Undid “${state.undoLabel}” (version ${r.version})${saved ? `; saved revision ${saved.revision}` : ''}` }
        },
      }
    },
  },
  {
    name: 'cad-modeler.new_document',
    label: 'Prepare new CAD document',
    description: 'Propose creating a new CAD Modeler document with one empty part, and make it active.',
    parameters: { type: 'object', properties: { title: { type: 'string' }, partName: { type: 'string' } }, additionalProperties: false },
    async run(args, ctx) {
      const title = (args.title as string | undefined)?.trim() || 'Untitled'
      const partName = (args.partName as string | undefined)?.trim() || 'Part 1'
      const persist = persistsOnApply()
      return {
        kind: 'service-proposal',
        module: MODULE,
        title: `New CAD document “${title}”`,
        explanation: persist ? `Creates the document and stores it in ${ctx.captured.projectId} as revision 1.` : 'Creates a document in this window’s CAD Modeler session. Save it to keep it.',
        preview: [{ label: 'New document', proposed: `${title} with part “${partName}”${persist ? `, stored in ${ctx.captured.projectId}` : ''}` }],
        async apply(provenance) {
          const d = await cadSession.newDocument({ title, partName, source: 'assistant', projectId: ctx.captured.projectId })
          const saved = persist ? await cadSession.saveToStore(ctx.captured.projectId, d.id, { message: 'Assistant: new document', provenance: { sourceKind: 'assistant', ...provenance } }) : null
          return { summary: `Created “${title}” (${d.id})${saved ? `, stored as revision ${saved.revision}` : ''}`, createdIds: [d.id] }
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
      const d = (await resolveDocument(args, ctx))!
      const projectId = ctx.captured.projectId
      const message = typeof args.message === 'string' ? args.message : ''
      const base = d.stored?.revision
      if (store.mode === 'api' && (!d.stored || d.stored.projectId === projectId)) {
        if (d.stored && !cadSession.isDirty(d)) throw new ActionError('no-op', `Already saved: revision ${d.stored.revision} in ${projectId} is current (nothing to save).`)
        const document = cadSession.stampForStore(d.engine.document)
        const docsPath = `/projects/${encodeURIComponent(projectId)}/documents`
        cadSession.expectDeclarativeSave(d.id, base ?? 0, projectId)
        const result: DeclarativeProposal = {
          kind: 'declarative-proposal',
          module: MODULE,
          title: `Save “${d.engine.document.metadata.title}” to ${projectId}`,
          explanation: base ? `Creates revision ${base + 1} (based on revision ${base}).` : 'Stores the document in the project as revision 1.',
          preview: [{ targetId: d.id, label: 'Revision', current: base ? `revision ${base}` : 'not stored', proposed: `${base ? `revision ${base + 1}` : 'revision 1'}${message ? `: ${message}` : ''} (model version ${d.engine.document.version})` }],
          operations: base
            ? [{ module: MODULE, operationId: 'saveRevision', method: 'PUT', path: `${docsPath}/${d.id}`, body: { document, message }, ifMatch: `"${base}"` }]
            : [{ module: MODULE, operationId: 'createDocument', method: 'POST', path: docsPath, body: { document, message } }],
          ...(base ? { expected: [{ module: MODULE, kind: 'cad-document', id: d.id, label: d.engine.document.metadata.title, revision: base, read: { operationId: 'getDocument', path: `${docsPath}/${d.id}`, field: 'summary.revision' } }] } : {}),
          projectId,
        }
        return result
      }
      return {
        kind: 'service-proposal',
        module: MODULE,
        title: `Save “${d.engine.document.metadata.title}” to ${projectId}`,
        explanation: base ? `Creates revision ${base + 1} (based on revision ${base}).` : 'Stores the document in the project as revision 1.',
        preview: [{ targetId: d.id, label: 'Revision', current: base ? `revision ${base}` : 'not stored', proposed: `${base ? `revision ${base + 1}` : 'revision 1'}${message ? `: ${message}` : ''} (model version ${d.engine.document.version})` }],
        async apply(provenance) {
          const r = await cadSession.saveToStore(projectId, d.id, { message, provenance: { sourceKind: 'assistant', ...provenance } })
          return { summary: r.unchanged ? `Already saved: revision ${r.revision} in ${projectId} is current (nothing to save)` : `Saved revision ${r.revision} in ${projectId}` }
        },
      }
    },
  },
  {
    name: 'cad-modeler.export',
    label: 'Prepare CAD export',
    description:
      'Export the document. "step" writes STEP AP242 of a part (exact B-rep with names, units, colours; geometry only, no feature history; the native model keeps the history) and reads it back: the file is imported again and its solid count, bounding box and volume are compared with the native model. "ewscad" saves the native parametric file. By default this is a proposal and the file is downloaded on the user’s computer after Apply. With "return": true (STEP or ewscad) nothing is downloaded or changed: the result returns the file (name, media type, size, SHA-256, text content) and, for STEP, the read-back report, so another operation can store it, for example as a project document.',
    parameters: { type: 'object', properties: { format: { type: 'string', enum: ['step', 'ewscad'] }, partId: { type: 'string' }, documentId, return: { type: 'boolean', description: 'Return the file in the result instead of proposing a download.' } }, required: ['format'], additionalProperties: false },
    async run(args, ctx) {
      const d = (await resolveDocument(args, ctx))!
      const format = args.format as 'step' | 'ewscad'
      if (args.return === true) return exportForReturn(d, format, args.partId as string | undefined)
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
          const rb = r.readBack
          return { summary: `Exported ${r.file.name}: ${s.applicationProtocol}, ${s.entities.MANIFOLD_SOLID_BREP} solid(s), ${s.entities.ADVANCED_FACE} faces, unit ${s.lengthUnit}${s.valid ? '' : `, problems: ${s.problems.join(' ')}`}; read back: ${rb.ok ? `matches the native model (${rb.imported.solids} solid(s), volume ${fmt(rb.imported.volume)} mm³)` : `DIFFERS: ${rb.differences.join('; ')}`}` }
        },
      }
    },
  },
  {
    name: 'cad-modeler.check',
    label: 'Check the CAD model against design constraints',
    description:
      'Measure the regenerated CAD model and compare the measurements with design-constraint bounds read from Conceptualize (never with numbers given here). By default every parameter bound to a Conceptualize constraint (bind_parameter) is checked, and the solid validity of every body is reported. Optional "checks" add measurements, each against a constraint: parameter, dimension (named sketch dimension), bounding-size (x, y, z, max, min), volume, surface-area, mass (needs a material), pattern-spacing, pattern-gap (material between neighbouring pattern occurrences), pattern-count. Each result has checkId, quantity, measured value and unit, bound (constraint key, revision, operator, limits), status (satisfied, violated, not-checkable with reason), method, documentId, documentRevision and kernel name and version; open assumptions are listed. Results report geometry and values only; they make no claim of structural adequacy, safety or compliance. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        documentId,
        bindings: { type: 'boolean', description: 'Check bound parameters (default true).' },
        checks: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            properties: {
              measure: {
                type: 'object',
                properties: {
                  kind: { type: 'string', enum: ['parameter', 'dimension', 'bounding-size', 'volume', 'surface-area', 'mass', 'pattern-spacing', 'pattern-gap', 'pattern-count'] },
                  name: { type: 'string', description: 'Parameter name, or dimension name.' },
                  constraintId: { type: 'string', description: 'Sketch dimension (constraint) ID.' },
                  axis: { type: 'string', enum: ['x', 'y', 'z', 'max', 'min'] },
                  featureId: { type: 'string', description: 'Linear pattern feature ID.' },
                },
                required: ['kind'],
                additionalProperties: false,
              },
              constraint: { type: 'object', properties: { id: { type: 'string' }, revision: { type: 'integer', minimum: 1 } }, required: ['id'], additionalProperties: false },
              partId: { type: 'string' },
            },
            required: ['measure', 'constraint'],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    async run(args, ctx) {
      const d = (await resolveDocument(args, ctx))!
      const requests = validateCheckRequests(args.checks)
      const regen = await d.engine.regenerate()
      if (!regen) throw new ActionError('unavailable', 'The model could not be regenerated (no kernel).')
      const report = await runChecks(d.engine.document, regen, {
        projectId: ctx.captured.projectId,
        concepts: ctx.services?.concepts,
        requests,
        bindings: args.bindings !== false,
        storedRevision: d.stored?.revision ?? null,
        unsavedChanges: !!d.stored && cadSession.isDirty(d),
        toolVersion: pkg.version,
      })
      if (d.remoteRevision) report.assumptions.push(`A newer revision (${d.remoteRevision}) of this document was saved elsewhere; the results refer to revision ${d.stored?.revision}.`)
      const s = report.summary
      return {
        kind: 'data',
        data: report,
        summary: `Checked “${report.documentTitle}”${report.documentRevision ? ` revision ${report.documentRevision}` : ''}: ${s.satisfied} satisfied, ${s.violated} violated, ${s['not-checkable']} not checkable`,
        inspected: [{ id: d.id, detail: `CAD document${report.documentRevision ? ` revision ${report.documentRevision}` : ''}, model version ${report.modelVersion}, ${report.kernel.name} ${report.kernel.version}` }],
      }
    },
  },
  {
    name: 'cad-modeler.check_bindings',
    label: 'Find outdated parameter bindings',
    description:
      'List parameters whose binding pins a revision older than the bound artifact\'s latest revision, with the bound values of the pinned and the latest revision (Conceptualize constraints), so the parameter can be reviewed and re-bound. Bindings that follow the latest revision, and bindings to modules that cannot be read here, are reported separately. Read-only.',
    parameters: { type: 'object', properties: { documentId }, additionalProperties: false },
    async run(args, ctx) {
      const d = (await resolveDocument(args, ctx))!
      const doc = d.engine.document
      const getConstraint = ctx.services?.concepts?.getConstraint
      const outdated: unknown[] = []
      const current: unknown[] = []
      const unknown: unknown[] = []
      const values = new Map(((await d.engine.regenerate())?.parts ?? []).flatMap((p) => p.parameters.map((x) => [`${p.partId}:${x.name}`, x.value] as const)))
      for (const part of doc.parts) {
        for (const p of part.parameters) {
          const b = p.binding
          if (!b) continue
          const base = { partId: part.id, parameter: p.name, expression: p.expression, value: values.get(`${part.id}:${p.name}`) ?? null, binding: b }
          if (b.ref.module !== 'conceptualize' || b.ref.kind !== 'constraint' || !getConstraint) {
            unknown.push({ ...base, reason: getConstraint ? `${b.ref.module}/${b.ref.kind} references cannot be read here.` : 'Design constraints cannot be read in this host.' })
            continue
          }
          let latest
          try {
            latest = await getConstraint(b.ref.id, { projectId: ctx.captured.projectId })
          } catch (e) {
            unknown.push({ ...base, reason: (e as Error).message })
            continue
          }
          if (!latest) {
            unknown.push({ ...base, reason: `Constraint ${b.ref.id} does not exist in project ${ctx.captured.projectId}.` })
            continue
          }
          if (b.ref.revision === undefined || b.ref.revision >= latest.latestRevision) {
            current.push({ ...base, key: latest.key, revision: latest.latestRevision, follows: b.ref.revision === undefined ? 'latest' : 'pinned' })
            continue
          }
          const old = await getConstraint(b.ref.id, { projectId: ctx.captured.projectId, revision: b.ref.revision }).catch(() => undefined)
          outdated.push({
            ...base,
            key: latest.key,
            pinnedRevision: b.ref.revision,
            latestRevision: latest.latestRevision,
            old: old ? { statement: old.statement, bound: old.bound, status: old.status } : null,
            new: { statement: latest.statement, bound: latest.bound, status: latest.status },
          })
        }
      }
      return {
        kind: 'data',
        data: { documentId: doc.documentId, documentRevision: d.stored?.revision ?? null, modelVersion: doc.version, outdated, current, unknown },
        summary: `${outdated.length} outdated, ${current.length} current, ${unknown.length} not checkable binding(s) in “${doc.metadata.title}”`,
        inspected: [{ id: d.id, detail: `parameter bindings, model version ${doc.version}` }],
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
