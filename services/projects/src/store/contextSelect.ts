import type { ContextOmission, ContextRef, ContextSection, ContextSnapshotItem, SelectContextRequest, SelectContextResponse } from '@ews/platform-sdk'
import type { Ctx } from './context'
import { listDocuments } from './documents'
import { listMilestones } from './milestones'
import { loadProject } from './projects'
import { listWorkItems } from './workItems'

/**
 * The Project Management context selector (SDK 1.15 `selectContext`, ADR-0085): the project's frame, its open risks and issues, its
 * upcoming milestones, its documents as references with exact version and metadata (never document bytes), and registry
 * records for the requested targets of any module (so the assembler can pin an exact revision for a Requirements, System Model
 * or CAD artifact before those modules ship their own selectors). Read-only; project scope and the caller's role are enforced
 * by the route, and every query is bound to the one project.
 *
 * Documents are people-supplied files: their descriptions are external content. The items carry the `document` kind so the
 * assembler renders them as `external-data` (untrusted; never instructions).
 */

export const SELECTOR_VERSION = 'projects-context/1'
const SUMMARY_LIMIT = 2000
const bounded = (text: string): string => (text.length <= SUMMARY_LIMIT ? text : `${text.slice(0, SUMMARY_LIMIT - 1)}…`)

interface Draft {
  ref: ContextRef
  section: ContextSection
  rank: number
  mandatory?: boolean
  via: ContextSnapshotItem['via']
  fields: string[]
  label: string
  summary?: string
  status?: string
}

const toItem = (d: Draft): ContextSnapshotItem => ({
  ref: d.ref,
  revision: d.ref.revision ?? null,
  via: d.via,
  fields: d.fields,
  section: d.section,
  ...(d.mandatory ? { mandatory: true } : {}),
  rank: d.rank,
  projection: { label: d.label, ...(d.summary ? { summary: bounded(d.summary) } : {}), ...(d.status ? { status: d.status } : {}) },
  selectedBy: 'projects',
})

export async function selectContext(ctx: Ctx, req: SelectContextRequest): Promise<SelectContextResponse> {
  const wanted = req.sections?.length ? new Set<ContextSection>(req.sections) : null
  const want = (s: ContextSection) => !wanted || wanted.has(s)
  const drafts: Draft[] = []
  const omitted: ContextOmission[] = []

  // ---- requested targets: registry records (exact version) ---------------------------------------------------------
  const targets = req.targets.filter((t) => t.module !== 'conceptualize')
  if (targets.length) {
    const { rows } = await ctx.db.query<{ module: string; kind: string; native_id: string; key: string; title: string; lifecycle: string; version_value: string }>(
      `SELECT module, kind, native_id, key, title, lifecycle, version_value FROM projects.artifacts WHERE project_id = $1 AND native_id = ANY($2::text[])`,
      [ctx.projectId, targets.map((t) => t.id)],
    )
    const missing: ContextRef[] = []
    for (const t of targets) {
      const r = rows.find((x) => x.native_id === t.id && x.module === t.module && (!t.kind || x.kind === t.kind))
      if (!r) {
        missing.push({ module: t.module as ContextRef['module'], id: t.id, ...(t.revision ? { revision: t.revision } : {}), ...(t.kind ? { kind: t.kind } : {}) })
        continue
      }
      const revision = /^\d+$/.test(r.version_value) ? Number(r.version_value) : undefined
      drafts.push({ ref: { module: r.module as ContextRef['module'], id: r.native_id, kind: r.kind, ...(revision ? { revision } : {}) }, section: 'background', rank: 2000, via: 'seed', fields: ['key', 'title', 'lifecycle', 'version'], label: `${r.key} ${r.title}`, status: r.lifecycle })
    }
    if (missing.length) omitted.push({ reason: 'not-found', count: missing.length, refs: missing })
  }

  if (want('background')) {
    const project = await loadProject(ctx.db, ctx.projectId)
    drafts.push({
      ref: { module: 'projects', id: project.id, kind: 'project', revision: project.revision },
      section: 'background',
      rank: 300,
      via: 'selector',
      fields: ['name', 'description', 'objectives', 'scope', 'disciplines', 'status'],
      label: `${project.key} ${project.name}`,
      summary: [project.description, project.objectives.length && `Objectives: ${project.objectives.join('; ')}`, project.scope && `Scope: ${project.scope}`].filter(Boolean).join(' '),
      status: project.status,
    })
    const risks = await listWorkItems(ctx, { open: true, sort: 'priority', limit: 30 })
    for (const w of risks.items.filter((i) => i.kind === 'risk' || i.kind === 'issue')) {
      drafts.push({
        ref: { module: 'projects', id: w.id, kind: w.kind, revision: w.revision },
        section: 'background',
        rank: w.priority === 'critical' ? 350 : w.priority === 'high' ? 330 : 200,
        via: 'selector',
        fields: ['title', 'description', 'status', 'priority'],
        label: `${w.key} ${w.title}`,
        summary: w.description,
        status: `${w.status}; ${w.priority}`,
      })
    }
    for (const m of (await listMilestones(ctx)).filter((x) => x.status !== 'achieved' && x.status !== 'cancelled').slice(0, 10)) {
      drafts.push({ ref: { module: 'projects', id: m.id, kind: 'milestone', revision: m.revision }, section: 'background', rank: 180, via: 'selector', fields: ['name', 'due', 'status'], label: `${m.key} ${m.name}`, summary: [m.description, m.due && `Due ${m.due}`].filter(Boolean).join(' '), status: m.status })
    }
    for (const d of (await listDocuments(ctx, {})).filter((x) => x.lifecycle !== 'retired' && x.lifecycle !== 'superseded').slice(0, 30)) {
      drafts.push({
        ref: { module: 'projects', id: d.id, kind: 'document', ...(d.currentVersion ? { revision: d.currentVersion } : {}) },
        section: 'background',
        rank: 120,
        via: 'selector',
        fields: ['title', 'description', 'documentKind', 'lifecycle', 'currentVersion'],
        label: `${d.key} ${d.title} (${d.documentKind})`,
        summary: d.description,
        status: d.lifecycle,
      })
    }
  }

  const sorted = drafts.sort((a, b) => b.rank - a.rank || a.ref.id.localeCompare(b.ref.id))
  const keep = Math.max(0, req.budget.maxItems)
  const dropped = sorted.slice(keep)
  if (dropped.length) omitted.push({ reason: 'budget', count: dropped.length, refs: dropped.slice(0, 100).map((d) => d.ref) })
  return { module: 'projects', selectorVersion: SELECTOR_VERSION, items: sorted.slice(0, keep).map(toItem), omitted }
}
