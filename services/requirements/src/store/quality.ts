import { randomUUID } from 'node:crypto'
import { conflict, invalid, notFound } from '../errors'
import { QUALITY_DISCLAIMER, checkRequirement, similarity, trigrams, type QualityFinding } from '../quality/rules'
import { getConventions, listAttributeDefinitions } from './attributes'
import { audit, isoRequired, type Ctx, type Queryable } from './context'
import { getRequirement } from './requirements'

type Dismissal = { rule_id: string; fingerprint: string; reason: string; dismissed_by: string; dismissed_at: Date }

async function context(db: Queryable, projectId: string) {
  const conventions = (await getConventions(db, projectId)).settings
  const keys = new Set((await db.query<{ key: string }>('SELECT key FROM requirements.requirements WHERE project_id = $1', [projectId])).rows.map((r) => r.key))
  const required = (await listAttributeDefinitions(db, projectId, false)).filter((d) => d.required).map((d) => ({ id: d.id, name: d.name }))
  return { conventions, keys, required }
}

/** Findings for one requirement revision, with dismissals recorded for that revision. */
export async function qualityReport(db: Queryable, projectId: string, id: string, revision?: number) {
  const r = await getRequirement(db, projectId, id, revision ? { revision } : {})
  if (!r) throw notFound('Requirement not found.')
  const base = await context(db, projectId)
  const rels = await db.query<{ type: string }>('SELECT DISTINCT type FROM requirements.relationships WHERE from_requirement_id = $1 AND NOT deleted', [id])
  const others = await db.query<{ id: string; key: string; statement: string }>(
    `SELECT r.id, r.key, v.statement FROM requirements.requirements r JOIN requirements.requirement_revisions v ON v.requirement_id = r.id AND v.revision = r.current_revision
     WHERE r.project_id = $1 AND r.id <> $2 AND NOT r.archived`,
    [projectId, id],
  )
  const findings = checkRequirement(r, {
    conventions: base.conventions,
    knownKeys: base.keys,
    relationshipTypes: new Set(rels.rows.map((x) => x.type)),
    requiredAttributes: base.required,
    others: others.rows,
  })
  const dismissals = await db.query<Dismissal>('SELECT rule_id, fingerprint, reason, dismissed_by, dismissed_at FROM requirements.quality_dismissals WHERE requirement_id = $1 AND revision = $2', [id, r.revision])
  return {
    requirementId: id,
    revision: r.revision,
    findings: findings.map((f): QualityFinding & { dismissal?: { reason: string; by: string; at: string } } => {
      const d = dismissals.rows.find((x) => x.rule_id === f.ruleId && x.fingerprint === f.fingerprint)
      return d ? { ...f, dismissal: { reason: d.reason, by: d.dismissed_by, at: isoRequired(d.dismissed_at) } } : f
    }),
    disclaimer: QUALITY_DISCLAIMER,
  }
}

export async function dismissFinding(ctx: Ctx, id: string, input: { revision: number; ruleId: string; fingerprint: string; reason: string }) {
  const report = await qualityReport(ctx.db, ctx.projectId, id)
  if (report.revision !== input.revision) throw conflict(`The requirement changed since revision ${input.revision} (now ${report.revision}); findings are re-evaluated for the new text.`, report.revision)
  const finding = report.findings.find((f) => f.ruleId === input.ruleId && f.fingerprint === input.fingerprint)
  if (!finding) throw invalid('That finding is not present for this revision.', { fingerprint: 'not found' })
  if (finding.dismissal) return report
  if (finding.class === 'validation' && finding.severity === 'error') throw invalid('Errors from deterministic validation cannot be dismissed; fix the data instead.', { ruleId: 'not dismissible' })
  await ctx.db.query(
    'INSERT INTO requirements.quality_dismissals (id, project_id, requirement_id, revision, rule_id, fingerprint, reason, dismissed_by, dismissed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [randomUUID(), ctx.projectId, id, input.revision, input.ruleId, input.fingerprint, input.reason.trim(), ctx.actor, ctx.now],
  )
  await audit(ctx, { entityType: 'quality', entityId: id, action: 'finding-dismissed', revision: input.revision, reason: input.reason, details: { requirementId: id, ruleId: input.ruleId, fingerprint: input.fingerprint } })
  return qualityReport(ctx.db, ctx.projectId, id)
}

/** Project-wide summary (working state). Duplicates use a trigram index, so this stays near-linear. */
export async function qualitySummary(db: Queryable, projectId: string, opts: { collectionId?: string; limit?: number } = {}) {
  const base = await context(db, projectId)
  const params: unknown[] = [projectId]
  let scope = ''
  if (opts.collectionId) {
    params.push(opts.collectionId)
    scope = `AND EXISTS (SELECT 1 FROM requirements.collection_nodes n WHERE n.requirement_id = r.id AND n.collection_id = $2)`
  }
  const { rows } = await db.query<{ id: string; key: string; revision: number; title: string; statement: string; rationale: string; source: string; acceptance_criteria: string; verification_methods: string[]; attributes: Record<string, unknown>; type: string }>(
    `SELECT r.id, r.key, v.revision, v.title, v.statement, v.rationale, v.source, v.acceptance_criteria, v.verification_methods, v.attributes, v.type
     FROM requirements.requirements r JOIN requirements.requirement_revisions v ON v.requirement_id = r.id AND v.revision = r.current_revision
     WHERE r.project_id = $1 AND NOT r.archived ${scope} ORDER BY r.key`,
    params,
  )
  const rels = await db.query<{ from_requirement_id: string; type: string }>('SELECT DISTINCT from_requirement_id, type FROM requirements.relationships WHERE project_id = $1 AND NOT deleted', [projectId])
  const relTypes = new Map<string, Set<string>>()
  for (const r of rels.rows) {
    const set = relTypes.get(r.from_requirement_id) ?? new Set<string>()
    set.add(r.type)
    relTypes.set(r.from_requirement_id, set)
  }
  const dismissed = await db.query<{ requirement_id: string; revision: number; rule_id: string; fingerprint: string }>('SELECT requirement_id, revision, rule_id, fingerprint FROM requirements.quality_dismissals WHERE project_id = $1', [projectId])
  // Trigram inverted index for duplicate candidates.
  const grams = rows.map((r) => trigrams(r.statement))
  const index = new Map<string, number[]>()
  grams.forEach((g, i) => g.forEach((t) => {
    const list = index.get(t)
    if (list) list.push(i)
    else index.set(t, [i])
  }))
  const byRule: Record<string, number> = {}
  const items = rows.map((r, i) => {
    const candidates = new Set<number>()
    for (const t of grams[i]) for (const j of index.get(t) ?? []) if (j !== i && (index.get(t)?.length ?? 0) < 200) candidates.add(j)
    const others = [...candidates].filter((j) => similarity(grams[i], grams[j]) >= base.conventions.duplicateThreshold).map((j) => ({ id: rows[j].id, key: rows[j].key, statement: rows[j].statement }))
    const findings = checkRequirement(
      { id: r.id, key: r.key, type: r.type, title: r.title, statement: r.statement, rationale: r.rationale, source: r.source, acceptanceCriteria: r.acceptance_criteria, verificationMethods: r.verification_methods, attributes: r.attributes },
      { conventions: base.conventions, knownKeys: base.keys, relationshipTypes: relTypes.get(r.id) ?? new Set(), requiredAttributes: base.required, others },
    )
    const isDismissed = (f: QualityFinding) => dismissed.rows.some((d) => d.requirement_id === r.id && d.revision === r.revision && d.rule_id === f.ruleId && d.fingerprint === f.fingerprint)
    const open = findings.filter((f) => !isDismissed(f))
    for (const f of open) byRule[f.ruleId] = (byRule[f.ruleId] ?? 0) + 1
    return { requirementId: r.id, key: r.key, title: r.title, revision: r.revision, open: open.length, dismissed: findings.length - open.length, topRules: [...new Set(open.map((f) => f.ruleId))].slice(0, 4) }
  })
  return { requirementsChecked: rows.length, byRule, items: items.filter((x) => x.open > 0).slice(0, opts.limit ?? 500), disclaimer: QUALITY_DISCLAIMER }
}
