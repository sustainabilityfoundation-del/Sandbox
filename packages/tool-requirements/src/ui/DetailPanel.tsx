import { Badge, Button, ComboBox, IconButton, LoadingState, Notice, Select, Tab, TabList, TabPanel, Tabs, TextField } from '@ews/design-system'
import { isComponent } from '@ews/platform-sdk'
import { ObjectRef, useModel, usePlatformServices, useSharedContext, useToolApi } from '@ews/platform-sdk/react'
import type { AttributeDefinition, Relationship, RelationshipType, Requirement } from '@ews/requirements-client'
import { useState } from 'react'
import { ALLOCATION_TARGET_KINDS, allocationRequest, allocationTargetLabel, type AllocationTargetKind } from '../allocations'
import type { DetailTab, VerificationRecordView } from '../domain'
import { sysmlTrace } from '../domain'
import { errorMessage, useModuleData, useResource } from '../data'
import { Verification } from '../Verification'
import { RequirementEditor } from './Editor'
import { ApiErrorNotice, LifecycleBadge, RELATION_LABEL, formatDate } from './common'
import { twinObjectFor } from './RequirementTable'

// ---- lifecycle actions ------------------------------------------------------------------------------

function LifecycleActions({ r, readOnly, onChanged }: { r: Requirement; readOnly: boolean; onChanged: (r: Requirement) => void }) {
  const { client, can, invalidate, permissions } = useModuleData()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [comment, setComment] = useState('')
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(null)
  const run = async (label: string, fn: () => Promise<Requirement | unknown>) => {
    setBusy(label)
    setError(null)
    try {
      const out = await fn()
      invalidate()
      if (out && typeof out === 'object' && 'revision' in (out as object) && 'key' in (out as object)) onChanged(out as Requirement)
      else onChanged(await client.getRequirement(r.id))
      setDeciding(null)
      setComment('')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }
  if (readOnly) return null
  const opts = { expectedRevision: r.revision }
  const authoredByMe = r.revisionCreatedBy === permissions?.userId
  return (
    <div className="req-actions">
      <div className="req-actions-row">
        {r.status === 'draft' && !r.archived && can('request-review') && (
          <Button size="sm" variant="outlined" icon="review" isPending={busy === 'review'} onPress={() => void run('review', () => client.transition(r.id, 'request-review', opts))}>
            Request review
          </Button>
        )}
        {r.status === 'in-review' && can('request-review') && (
          <Button size="sm" variant="text" isPending={busy === 'withdraw'} onPress={() => void run('withdraw', () => client.transition(r.id, 'withdraw', opts))}>
            Withdraw review
          </Button>
        )}
        {r.status === 'in-review' && r.openReviewId && can('decide-review') && (
          <>
            <Button size="sm" variant="filled" icon="approved" isDisabled={authoredByMe} onPress={() => setDeciding('approve')}>
              Approve rev {r.revision}
            </Button>
            <Button size="sm" variant="outlined" icon="rejected" isDisabled={authoredByMe} onPress={() => setDeciding('reject')}>
              Reject
            </Button>
          </>
        )}
        {r.status === 'approved' && can('author') && (
          <Button size="sm" variant="text" onPress={() => void run('reopen', () => client.transition(r.id, 'reopen', opts))}>
            Reopen as draft
          </Button>
        )}
        {(r.status === 'draft' || r.status === 'approved') && can('retire') && (
          <Button size="sm" variant="text" icon="archive" onPress={() => void run('retire', () => client.transition(r.id, 'retire', opts))}>
            Retire
          </Button>
        )}
        {r.status === 'retired' && can('retire') && (
          <Button size="sm" variant="text" onPress={() => void run('reinstate', () => client.transition(r.id, 'reinstate', opts))}>
            Reinstate
          </Button>
        )}
        {can('author') && (
          <Button size="sm" variant="text" icon={r.archived ? 'reset' : 'archive'} isPending={busy === 'archive'} onPress={() => void run('archive', () => (r.archived ? client.restore(r.id, opts) : client.archive(r.id, opts)))}>
            {r.archived ? 'Restore' : 'Archive'}
          </Button>
        )}
      </div>
      {authoredByMe && r.status === 'in-review' && can('decide-review') && <p className="ws-hint m-0">You authored revision {r.revision}; another reviewer must decide.</p>}
      {deciding && (
        <div className="req-decide">
          <TextField label={deciding === 'approve' ? 'Comment (optional)' : 'Reason for rejecting (required)'} multiline rows={2} value={comment} onChange={setComment} autoFocus />
          <p className="ws-hint m-0">
            {deciding === 'approve' ? `Approval records that revision ${r.revision} was reviewed and accepted. It is not a verification result or a compliance assessment.` : 'The requirement returns to draft.'}
          </p>
          <div className="req-actions-row">
            <Button size="sm" variant="filled" isDisabled={deciding === 'reject' && !comment.trim()} isPending={busy === 'decide'} onPress={() => void run('decide', () => client.decide(r.id, r.openReviewId!, deciding, { expectedRevision: r.revision, comment }))}>
              {deciding === 'approve' ? 'Approve' : 'Reject'}
            </Button>
            <Button size="sm" variant="text" onPress={() => setDeciding(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error ? <ApiErrorNotice error={error} title="The action was not applied" /> : null}
    </div>
  )
}

// ---- relationships --------------------------------------------------------------------------------------

function Relationships({ r, readOnly, baselineId }: { r: Requirement; readOnly: boolean; baselineId: string | null }) {
  const { client, can, invalidate } = useModuleData()
  const toolApi = useToolApi()
  const model = useModel()
  const rels = useResource(() => client.relationshipsOf(r.id, baselineId ?? undefined), [client, r.id, baselineId])
  const types = useResource(() => client.relationshipTypes(), [client])
  const [type, setType] = useState<RelationshipType>('derives-from')
  const [target, setTarget] = useState<{ id: string; label: string } | null>(null)
  const [targetKind, setTargetKind] = useState<AllocationTargetKind>('component')
  const [search, setSearch] = useState('')
  const { sysml } = usePlatformServices()
  const { projectId } = useSharedContext()
  const sysmlCandidates = useResource(
    () => (type === 'allocated-to' && targetKind === 'sysml-model-element' && sysml ? sysml.find(projectId, { text: search || undefined, limit: 20 }) : Promise.resolve(null)),
    [sysml, projectId, search, type, targetKind],
  )
  const [rationale, setRationale] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const candidates = useResource(() => (type === 'allocated-to' ? Promise.resolve(null) : client.list({ text: search || undefined, limit: 20 })), [client, search, type])
  const twin = twinObjectFor(model, r)
  const { references, satisfiedBy } = twin ? sysmlTrace(model, twin.id) : { references: [], satisfiedBy: [] }
  const editable = !readOnly && can('author') && !r.archived

  const add = async () => {
    if (!target) return
    setBusy(true)
    setError(null)
    try {
      // Allocations carry the revision shown here (same request as the assistant's requirements.allocate).
      if (type === 'allocated-to') await client.createRelationship(allocationRequest(r, { kind: targetKind, id: target.id }, { rationale: rationale || undefined }))
      else await client.createRelationship({ type, fromId: r.id, toRequirementId: target.id, rationale: rationale || undefined })
      setTarget(null)
      setRationale('')
      invalidate()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  const remove = async (rel: Relationship) => {
    setError(null)
    try {
      await client.deleteRelationship(rel.id, rel.revision)
      invalidate()
    } catch (e) {
      setError(e)
    }
  }
  const keyOf = useResource(
    () => {
      const ids = [...new Set((rels.data ?? []).flatMap((x) => [x.fromId, x.toRequirementId]).filter((x): x is string => !!x && x !== r.id))]
      return ids.length ? client.list({ ids, includeArchived: true, limit: 200, baselineId: baselineId ?? undefined }).then((p) => new Map(p.items.map((i) => [i.id, `${i.key} ${i.title}`]))) : Promise.resolve(new Map<string, string>())
    },
    [client, JSON.stringify((rels.data ?? []).map((x) => x.id)), baselineId],
  )
  const label = (id: string) => keyOf.data?.get(id) ?? id
  const groups = new Map<string, Relationship[]>()
  for (const rel of rels.data ?? []) {
    const k = rel.fromId === r.id ? RELATION_LABEL[rel.type].out : RELATION_LABEL[rel.type].in
    groups.set(k, [...(groups.get(k) ?? []), rel])
  }
  const rule = types.data?.find((t) => t.type === type)

  return (
    <div className="flex flex-col gap-3">
      {rels.error && <ApiErrorNotice error={new Error(rels.error)} title="Could not load relationships" onRetry={rels.reload} />}
      {!rels.data && rels.loading && <LoadingState label="Loading relationships…" />}
      <dl className="req-rels">
        {[...groups].map(([g, list]) => (
          <div key={g}>
            <dt>{g}</dt>
            <dd>
              <ul className="req-rel-list">
                {list.map((rel) => {
                  const other = rel.fromId === r.id ? (rel.toTwinId ?? rel.toRequirementId!) : rel.fromId
                  const twinObj = rel.toTwinId ? model.get(rel.toTwinId) : undefined
                  return (
                    <li key={rel.id}>
                      {twinObj ? <ObjectRef object={twinObj} /> : <span className={rel.toTwinId ? 'font-mono' : ''}>{rel.toTwinId ? allocationTargetLabel(rel) : label(other)}</span>}
                      {rel.rationale && <span className="text-fg-3"> — {rel.rationale}</span>}
                      <span className="text-ui-xs text-fg-3"> · rev {rel.revision}, made against {rel.fromId === r.id ? `rev ${rel.fromRequirementRevision}` : `rev ${rel.toRequirementRevision ?? '?'}`}</span>
                      {editable && !baselineId && <IconButton size="sm" icon="unlink" label={`Remove ${rel.type} link`} onPress={() => void remove(rel)} />}
                    </li>
                  )
                })}
              </ul>
            </dd>
          </div>
        ))}
        {(references.length > 0 || satisfiedBy.length > 0) && (
          <div>
            <dt>SysML (shared twin, owned by SysML)</dt>
            <dd className="ws-refs">
              {references.map((o) => (
                <ObjectRef key={o.id} object={o} />
              ))}
              {references.length > 0 && (
                <Button
                  size="sm"
                  variant="text"
                  icon="sysml"
                  onPress={() => {
                    toolApi.select(references.map((o) => o.id))
                    const res = toolApi.openTool('sysml')
                    if (!res.ok) setError(new Error(res.reason))
                  }}
                >
                  Show in SysML
                </Button>
              )}
              {satisfiedBy.length > 0 && <span className="text-fg-3">satisfied (modelled claim) by</span>}
              {satisfiedBy.map((o) => (
                <ObjectRef key={o.id} object={o} />
              ))}
            </dd>
          </div>
        )}
      </dl>
      {rels.data && !groups.size && !references.length && <p className="m-0 text-fg-3">No relationships yet.</p>}
      <p className="ws-hint m-0">Collection structure (headings and nesting) is not a relationship and never implies derivation or decomposition.</p>
      {editable && !baselineId && (
        <fieldset className="req-fieldset">
          <legend>Add relationship</legend>
          <Select
            label="Type"
            value={type}
            onChange={(v) => (setType(v as RelationshipType), setTarget(null))}
            options={(types.data ?? []).map((t) => ({ id: t.type, label: RELATION_LABEL[t.type].out, description: t.meaning }))}
          />
          {rule && <p className="ws-hint m-0">{rule.reads.replace('{from}', r.key).replace('{to}', 'the target')}. {rule.meaning}</p>}
          {type === 'allocated-to' && (
            <Select
              label="Allocate to"
              value={targetKind}
              onChange={(v) => (setTargetKind(v as AllocationTargetKind), setTarget(null), setSearch(''))}
              options={ALLOCATION_TARGET_KINDS.map((k) => ({ id: k.id, label: k.label }))}
            />
          )}
          {type === 'allocated-to' && targetKind === 'component' ? (
            <Select
              label="Component (shared twin)"
              value={target?.id ?? null}
              placeholder="Choose a component"
              onChange={(id) => setTarget({ id, label: id })}
              options={model.objects.filter(isComponent).map((c) => ({ id: c.id, label: `${c.id} ${c.name}` }))}
            />
          ) : type === 'allocated-to' && targetKind === 'product-element' ? (
            <TextField
              label="Product element ID"
              value={target?.id ?? ''}
              onChange={(v) => setTarget(v.trim() ? { id: v.trim(), label: v.trim() } : null)}
              description="The element's ID in the project's product structure (Project Management); checked by the server"
            />
          ) : type === 'allocated-to' && targetKind === 'sysml-model-element' ? (
            sysml ? (
              <ComboBox
                label="SysML element"
                placeholder="Search name or qualified name"
                inputValue={search}
                onInputChange={setSearch}
                options={(sysmlCandidates.data ?? []).map((e) => ({ id: e.ref.id, label: `${e.qualifiedName ?? e.name ?? e.elementId} (${e.metaclass})` }))}
                onSelect={(o) => setTarget({ id: o.id, label: o.label })}
              />
            ) : (
              <TextField
                label="SysML element (project/element ID)"
                value={target?.id ?? ''}
                onChange={(v) => setTarget(v.trim() ? { id: v.trim(), label: v.trim() } : null)}
                description="The SysML Modeler is not available here to search; enter <sysmlProjectId>/<elementId>"
              />
            )
          ) : (
            <ComboBox
              label="Target requirement"
              placeholder="Search key or text"
              inputValue={search}
              onInputChange={setSearch}
              options={(candidates.data?.items ?? []).filter((c) => c.id !== r.id).map((c) => ({ id: c.id, label: `${c.key} ${c.title}` }))}
              onSelect={(o) => setTarget({ id: o.id, label: o.label })}
            />
          )}
          {target && <Badge tone="info">Target: {target.label}</Badge>}
          <TextField label="Rationale (optional)" value={rationale} onChange={setRationale} />
          <Button variant="outlined" icon="link" isDisabled={!target} isPending={busy} onPress={() => void add()}>
            Add {RELATION_LABEL[type].out.toLowerCase()}
          </Button>
        </fieldset>
      )}
      {error ? <ApiErrorNotice error={error} title="The relationship was not changed" /> : null}
      <Impact r={r} />
    </div>
  )
}

function Impact({ r }: { r: Requirement }) {
  const { client } = useModuleData()
  const [open, setOpen] = useState(false)
  const impact = useResource(open ? () => client.impact(r.id) : null, [client, r.id, open])
  return (
    <section className="req-impact">
      <Button size="sm" variant="text" icon="impact" onPress={() => setOpen((o) => !o)}>
        {open ? 'Hide impact assessment' : 'Show potentially affected items'}
      </Button>
      {open && impact.data && (
        <>
          <ul className="req-impact-list">
            {impact.data.items.map((i) => (
              <li key={`${i.kind}-${i.id}`}>
                <Badge tone="neutral">{i.kind}</Badge> <strong>{i.label}</strong> <span className="text-fg-3">{i.via}</span>
              </li>
            ))}
          </ul>
          <p className="ws-hint m-0">{impact.data.note}</p>
        </>
      )}
      {impact.error && <ApiErrorNotice error={new Error(impact.error)} title="Could not assess impact" />}
    </section>
  )
}

// ---- reviews, history, comments --------------------------------------------------------------------------

function Reviews({ r }: { r: Requirement }) {
  const { client } = useModuleData()
  const reviews = useResource(() => client.reviews(r.id), [client, r.id])
  const lifecycle = useResource(() => client.lifecycle(r.id), [client, r.id])
  return (
    <div className="flex flex-col gap-3">
      <h4 className="req-subhead">Reviews</h4>
      {reviews.error && <ApiErrorNotice error={new Error(reviews.error)} title="Could not load reviews" />}
      {reviews.data?.length === 0 && <p className="m-0 text-fg-3">No reviews yet.</p>}
      <ol className="req-history">
        {reviews.data?.map((rv) => (
          <li key={rv.id}>
            <span>
              <Badge tone={rv.state === 'approved' ? 'success' : rv.state === 'rejected' ? 'danger' : rv.state === 'open' ? 'info' : 'neutral'}>{rv.state}</Badge> revision {rv.requirementRevision}, requested by {rv.requestedBy}
            </span>
            <span className="text-ui-xs text-fg-3">{formatDate(rv.requestedAt)}{rv.closedAt ? ` · closed ${formatDate(rv.closedAt)} by ${rv.closedBy}` : ''}</span>
            {rv.decisions.map((d) => (
              <span key={d.id} className="text-ui-sm">
                {d.decidedBy}: <strong>{d.decision}</strong> {d.comment && `— ${d.comment}`}
              </span>
            ))}
          </li>
        ))}
      </ol>
      <h4 className="req-subhead">Lifecycle</h4>
      <ol className="req-history">
        {lifecycle.data?.map((e) => (
          <li key={e.id}>
            <span>
              {e.fromStatus} → <strong>{e.toStatus}</strong> (rev {e.revision}) by {e.actor}
            </span>
            <span className="text-ui-xs text-fg-3">
              {formatDate(e.occurredAt)} {e.reason && `· ${e.reason}`}
            </span>
          </li>
        ))}
      </ol>
      <p className="ws-hint m-0">Approval, verification results, compliance assessment and modelled satisfaction are separate records. An approval says a revision was reviewed and accepted.</p>
    </div>
  )
}

function History({ r }: { r: Requirement }) {
  const { client } = useModuleData()
  const revisions = useResource(() => client.revisions(r.id), [client, r.id])
  const history = useResource(() => client.history(r.id), [client, r.id])
  const [from, setFrom] = useState<number | null>(null)
  const to = r.revision
  const cmp = useResource(from ? () => client.compare(r.id, from, to) : null, [client, r.id, from, to])
  return (
    <div className="flex flex-col gap-3">
      <div className="req-compare">
        <Select
          label="Compare revision"
          value={from ? String(from) : null}
          placeholder="Choose an earlier revision"
          onChange={(v) => setFrom(Number(v))}
          options={(revisions.data ?? []).filter((x) => x.revision !== to).map((x) => ({ id: String(x.revision), label: `rev ${x.revision} · ${x.createdBy} · ${formatDate(x.createdAt)}` }))}
        />
        <span className="text-fg-3">with rev {to}</span>
      </div>
      {cmp.data && (
        <table className="req-diff">
          <thead>
            <tr>
              <th>Field</th>
              <th>rev {from}</th>
              <th>rev {to}</th>
            </tr>
          </thead>
          <tbody>
            {cmp.data.changes.length === 0 && (
              <tr>
                <td colSpan={3}>No content differences.</td>
              </tr>
            )}
            {cmp.data.changes.map((c) => (
              <tr key={c.field}>
                <th>{c.field}</th>
                <td>{JSON.stringify(c.from)}</td>
                <td>{JSON.stringify(c.to)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h4 className="req-subhead">Change history</h4>
      {history.error && <ApiErrorNotice error={new Error(history.error)} title="Could not load history" />}
      <ol className="req-history" aria-label={`History of ${r.key}`}>
        {history.data?.map((h) => (
          <li key={h.id}>
            <span>
              <strong>{h.action}</strong> {h.revision ? `rev ${h.revision}` : ''} by {h.actor}
              {Array.isArray(h.details.fields) ? ` · ${(h.details.fields as string[]).join(', ')}` : ''}
            </span>
            <span className="text-ui-xs text-fg-3">
              {formatDate(h.occurredAt)}
              {h.reason ? ` · reason: ${h.reason}` : ''}
            </span>
          </li>
        ))}
      </ol>
      <p className="ws-hint m-0">History is append-only through the API. It is not a tamper-proof or regulatory audit store.</p>
    </div>
  )
}

function Comments({ r, readOnly }: { r: Requirement; readOnly: boolean }) {
  const { client, can, invalidate } = useModuleData()
  const comments = useResource(() => client.comments(r.id), [client, r.id])
  const refs = useResource(() => client.externalReferences(r.id), [client, r.id])
  const [text, setText] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const post = async () => {
    setBusy(true)
    setError(null)
    try {
      await client.addComment(r.id, text)
      setText('')
      invalidate()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <ol className="req-history">
        {comments.data?.map((c) => (
          <li key={c.id}>
            <span>{c.body}</span>
            <span className="text-ui-xs text-fg-3">
              {c.author} · {formatDate(c.createdAt)} · on rev {c.revision}
            </span>
          </li>
        ))}
      </ol>
      {comments.data?.length === 0 && <p className="m-0 text-fg-3">No comments.</p>}
      {!readOnly && can('comment') && (
        <>
          <TextField label="Comment" multiline rows={2} value={text} onChange={setText} description="Comments are not part of the normative text." />
          <Button size="sm" variant="outlined" isDisabled={!text.trim()} isPending={busy} onPress={() => void post()}>
            Add comment
          </Button>
        </>
      )}
      {error ? <ApiErrorNotice error={error} title="The comment was not added" /> : null}
      <h4 className="req-subhead">External references</h4>
      <ul className="req-rel-list">
        {refs.data?.map((x) => (
          <li key={`${x.id}-${x.externalId}`}>
            <strong>{x.system}</strong> <span className="font-mono">{x.externalId}</span> {x.note && <span className="text-fg-3">— {x.note}</span>}
          </li>
        ))}
      </ul>
      {refs.data?.length === 0 && <p className="m-0 text-fg-3">None.</p>}
    </div>
  )
}

// ---- panel ----------------------------------------------------------------------------------------------------

export function DetailPanel({
  requirementId,
  tab,
  setTab,
  onClose,
  onSaved,
  definitions,
  requirementTypes,
  baselineId,
  collectionId,
  verification,
  quality,
}: {
  requirementId: string
  tab: DetailTab
  setTab: (t: DetailTab) => void
  onClose: () => void
  onSaved: (r: Requirement) => void
  definitions: AttributeDefinition[]
  requirementTypes: string[]
  baselineId: string | null
  collectionId: string | null
  verification: Map<string, VerificationRecordView[]>
  quality: (r: Requirement, readOnly: boolean) => React.ReactNode
}) {
  const { client, can } = useModuleData()
  const model = useModel()
  const isNew = requirementId === 'new'
  const res = useResource(isNew ? null : () => client.getRequirement(requirementId, { baselineId: baselineId ?? undefined }), [client, requirementId, baselineId])
  const [local, setLocal] = useState<Requirement | null>(null)
  const r = res.data && local && local.id === res.data.id && local.revision > res.data.revision ? local : res.data
  const readOnly = !!baselineId || !!r?.archived || r?.status === 'retired' || !can('author')
  const twin = r ? twinObjectFor(model, r) : undefined

  if (isNew) {
    return (
      <section className="req-detail" aria-label="New requirement">
        <header className="req-detail-header">
          <h3>New requirement</h3>
          <IconButton icon="close" label="Close" onPress={onClose} />
        </header>
        <div className="req-detail-body">
          <RequirementEditor requirement={null} definitions={definitions} requirementTypes={requirementTypes} readOnly={false} collectionId={collectionId} onSaved={onSaved} onCancel={onClose} />
        </div>
      </section>
    )
  }
  return (
    <section className="req-detail" aria-label={r ? `${r.key} details` : 'Requirement details'}>
      <header className="req-detail-header">
        <h3>
          {r ? (
            <>
              <span className="font-mono">{r.key}</span> {r.title}
            </>
          ) : (
            'Requirement'
          )}
        </h3>
        {r && <LifecycleBadge status={r.status} archived={r.archived} />}
        <IconButton icon="close" label="Close details" onPress={onClose} />
      </header>
      {res.error && (
        <div className="p-3">
          <ApiErrorNotice error={new Error(res.error)} title="Could not load the requirement" onRetry={res.reload} />
        </div>
      )}
      {!r && res.loading && <LoadingState label="Loading…" />}
      {r && (
        <>
          <div className="req-detail-meta">
            <span>
              rev {r.revision} · {r.revisionCreatedBy} · {formatDate(r.revisionCreatedAt)}
            </span>
            {r.legacyIds.length > 0 && <span>legacy twin ID {r.legacyIds.join(', ')}</span>}
            <span className="font-mono text-fg-3" title="Canonical identity">
              {r.id}
            </span>
            {baselineId && <Badge tone="warning" icon="baseline">Baseline (read-only)</Badge>}
          </div>
          {!baselineId && <LifecycleActions r={r} readOnly={!!baselineId} onChanged={(x) => setLocal(x)} />}
          <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k as DetailTab)} className="flex min-h-0 flex-1 flex-col">
            <TabList aria-label="Requirement detail" className="px-2">
              <Tab id="details">{readOnly ? 'Details' : 'Edit'}</Tab>
              <Tab id="relationships">Trace</Tab>
              <Tab id="reviews">Reviews</Tab>
              <Tab id="history">History</Tab>
              <Tab id="comments">Comments</Tab>
              <Tab id="quality">Quality</Tab>
              <Tab id="verification">Verification</Tab>
            </TabList>
            <TabPanel id="details" className="req-detail-body">
              {r.archived && <Notice tone="warning">Archived requirements are read-only. Restore to edit.</Notice>}
              {r.status === 'retired' && <Notice tone="info">Retired requirements are read-only. Reinstate to edit.</Notice>}
              <RequirementEditor key={`${r.id}-${baselineId}`} requirement={r} definitions={definitions} requirementTypes={requirementTypes} readOnly={readOnly} onSaved={(x) => (setLocal(x), onSaved(x))} onCancel={onClose} />
            </TabPanel>
            <TabPanel id="relationships" className="req-detail-body">
              <Relationships r={r} readOnly={readOnly} baselineId={baselineId} />
            </TabPanel>
            <TabPanel id="reviews" className="req-detail-body">
              <Reviews r={r} />
            </TabPanel>
            <TabPanel id="history" className="req-detail-body">
              <History r={r} />
            </TabPanel>
            <TabPanel id="comments" className="req-detail-body">
              <Comments r={r} readOnly={!!baselineId} />
            </TabPanel>
            <TabPanel id="quality" className="req-detail-body">
              {quality(r, readOnly)}
            </TabPanel>
            <TabPanel id="verification" className="req-detail-body">
              {twin ? (
                <>
                  <p className="ws-hint m-0">Verification records are immutable artifacts in the shared twin and pin the twin revision of {twin.id}. They are separate from approval.</p>
                  <Verification requirement={twin} records={verification.get(twin.id) ?? []} />
                </>
              ) : (
                <Notice tone="info" title="No twin object for this requirement yet">
                  Verification records are saved in the shared twin. {r.key} exists only in the Requirements service until the platform projects requirements into the model index.
                </Notice>
              )}
            </TabPanel>
          </Tabs>
        </>
      )}
    </section>
  )
}

export { errorMessage }
