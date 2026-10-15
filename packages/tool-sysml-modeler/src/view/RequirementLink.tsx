import { Badge, Button, ComboBox, Notice } from '@ews/design-system'
import type { RequirementSummary } from '@ews/platform-sdk'
import { usePlatformServices, useSharedContext } from '@ews/platform-sdk/react'
import { evaluate, refId, semanticsOf, type Model } from '@ews/sysml-core'
import { useEffect, useState } from 'react'
import { message, type ModelerSession } from '../session'

/**
 * Link between a SysML requirement (definition or usage) and a requirement managed by Requirements
 * Management (ADR-0037): `@EWS::ManagedRequirement { requirementId; revision; }`. The canonical title
 * and statement are read through the SDK RequirementsService (read-time projection); SysML stores no
 * copy. A pinned revision older than the current one is shown as stale.
 */

export function managedRequirementOf(model: Model, elementId: string): { requirementId?: string; revision?: number } | undefined {
  const s = semanticsOf(model)
  const meta = s.ownedMembers(elementId).find((m) => m['@type'] === 'MetadataUsage' && s.featureTypes(m['@id']).some((t) => s.qualifiedName(t) === 'EWS::ManagedRequirement'))
  if (!meta) return undefined
  const out: { requirementId?: string; revision?: number } = {}
  for (const f of s.ownedMembers(meta['@id'])) {
    const fv = s.ownedRelationships(f['@id']).find((r) => r['@type'] === 'FeatureValue')
    const e = fv && refId(fv, 'ownedRelatedElement')
    const v = e ? evaluate(model, e) : undefined
    if (s.name(f['@id']) === 'requirementId' && v?.kind === 'string') out.requirementId = v.value
    if (s.name(f['@id']) === 'revision' && v?.kind === 'number') out.revision = v.value
  }
  return out
}

export function RequirementLink({ session, model, elementId, readOnly }: { session: ModelerSession; model: Model; elementId: string; readOnly: boolean }) {
  const { requirements } = usePlatformServices()
  const { projectId, configurationId } = useSharedContext()
  const link = managedRequirementOf(model, elementId)
  const [pinned, setPinned] = useState<RequirementSummary | null | undefined>(undefined)
  const [latest, setLatest] = useState<RequirementSummary | null | undefined>(undefined)
  const [options, setOptions] = useState<RequirementSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    setError(null)
    if (!requirements) return
    if (link?.requirementId) {
      const id = link.requirementId
      Promise.all([requirements.get(id, { projectId, configurationId, ...(link.revision ? { revision: link.revision } : {}) }), requirements.get(id, { projectId, configurationId })]).then(
        ([p, l]) => alive && (setPinned(p ?? null), setLatest(l ?? null)),
        (e) => alive && setError(message(e)),
      )
      const off = requirements.subscribe(projectId, (ev) => ev.entityId === id && void requirements.get(id, { projectId, configurationId }).then((l) => alive && setLatest(l ?? null)))
      return () => {
        alive = false
        off()
      }
    }
    requirements.list({ projectId, configurationId, limit: 200 }).then(
      (page) => alive && setOptions(page.items),
      (e) => alive && setError(message(e)),
    )
    return () => {
      alive = false
    }
  }, [requirements, link?.requirementId, link?.revision, projectId, configurationId])

  const set = async (values: Record<string, string | number> | null, done: string) => {
    setBusy(true)
    setError(null)
    try {
      await session.run([{ op: 'setMetadata', elementId, metadata: 'ManagedRequirement', values }], { reason: done })
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="smod-field" aria-label="Managed requirement" data-help-id="sysml-modeler.requirements">
      <strong>Managed requirement</strong>
      {!requirements && <Notice tone="info">The Requirements service is not available here (not provided by this host, or not in your subscription). Links are kept but their text cannot be shown.</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      {link?.requirementId ? (
        <>
          {pinned === undefined && requirements && <span className="smod-muted">Loading…</span>}
          {pinned === null && <Notice tone="warning" title="Not found">The linked requirement {link.requirementId} does not exist in this project or configuration.</Notice>}
          {pinned && (
            <div className="smod-req">
              <div className="smod-chips">
                <Badge tone="neutral">{pinned.key}</Badge>
                <span>{pinned.title}</span>
                <Badge tone="info">{link.revision ? `pinned rev ${link.revision}` : 'follows latest'}</Badge>
                <Badge tone="neutral">{pinned.status}</Badge>
              </div>
              <p className="smod-req-statement">{pinned.statement}</p>
              {latest && link.revision && latest.revision > link.revision && (
                <Notice
                  tone="warning"
                  title={`Revision ${latest.revision} exists`}
                  actions={!readOnly && <Button size="sm" isPending={busy} onPress={() => void set({ requirementId: latest.id, revision: latest.revision }, `Repinned ${latest.key} to revision ${latest.revision}`)}>Update pin</Button>}
                >
                  The model refers to revision {link.revision}; review the change before updating the pin.
                </Notice>
              )}
            </div>
          )}
          {!readOnly && (
            <Button size="sm" variant="text" icon="unlink" isPending={busy} onPress={() => void set(null, 'Removed the managed requirement link')}>
              Unlink
            </Button>
          )}
        </>
      ) : (
        !readOnly &&
        requirements && (
          <ComboBox
            ariaLabel="Link a managed requirement"
            placeholder="Link a managed requirement (REQ-…)"
            options={options.map((r) => ({ id: r.id, label: `${r.key} ${r.title}`, description: `rev ${r.revision} · ${r.status}` }))}
            onSelect={(o) => {
              const r = options.find((x) => x.id === o.id)
              if (r) void set({ requirementId: r.id, revision: r.revision }, `Linked ${r.key} (revision ${r.revision})`)
            }}
          />
        )
      )}
    </section>
  )
}
