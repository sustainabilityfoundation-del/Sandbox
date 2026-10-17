import { Badge, Button, ComboBox, Notice } from '@ews/design-system'
import type { ArtifactSummary } from '@ews/platform-sdk'
import { usePlatformServices, useSharedContext } from '@ews/platform-sdk/react'
import { representations, type Model } from '@ews/sysml-core'
import { useEffect, useMemo, useState } from 'react'
import { message, type ModelerSession } from '../session'

/**
 * What a SysML element represents (CR-SYSML-03, CR-PM-SYS-1): CAD entities and product
 * elements of Project Management, as SysML-owned references (`@EWS::CadRepresentation`,
 * `@EWS::ProductElement`). Product elements are picked from and shown through the Project Management
 * registry (`services.projects`); nothing of theirs is copied into the model.
 */
export function Represents({ session, model, elementId, readOnly, revision }: { session: ModelerSession; model: Model; elementId: string; readOnly: boolean; revision: number }) {
  const { projects } = usePlatformServices()
  const { projectId } = useSharedContext()
  const refs = useMemo(() => representations(model, elementId), [model, elementId, revision])
  const product = refs.find((r) => r.ref.module === 'product')
  const cad = refs.filter((r) => r.ref.module === 'cad')
  const [shown, setShown] = useState<ArtifactSummary | null | undefined>(undefined)
  const [options, setOptions] = useState<ArtifactSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    setError(null)
    setShown(undefined)
    if (!projects) return
    if (product?.valid) {
      projects.resolve(projectId, [{ module: 'product', kind: 'product-element', id: product.ref.id }]).then(
        (r) => alive && setShown(r[0] ?? null),
        (e) => alive && setError(message(e)),
      )
    } else if (!readOnly) {
      projects.artifacts(projectId, { category: 'product-element', limit: 200 }).then(
        (page) => alive && setOptions(page.items.filter((a) => a.ref.module === 'product' && a.ref.kind === 'product-element')),
        (e) => alive && setError(message(e)),
      )
    }
    return () => {
      alive = false
    }
  }, [projects, projectId, product?.ref.id, product?.valid, readOnly])

  const set = async (values: Record<string, string | number> | null, reason: string) => {
    setBusy(true)
    setError(null)
    try {
      await session.run([{ op: 'setMetadata', elementId, metadata: 'ProductElement', values }], { reason })
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="smod-field" aria-label="Represents" data-help-id="sysml-modeler.represents">
      <strong>Represents</strong>
      {error && <Notice tone="danger">{error}</Notice>}
      {product ? (
        <div className="smod-req">
          <div className="smod-chips">
            <Badge tone="neutral" icon="component">Product element</Badge>
            {shown ? <span>{`${shown.key} ${shown.title}`}</span> : <span className="smod-muted">{product.ref.id}</span>}
            <Badge tone="info">{product.ref.revision ? `pinned rev ${product.ref.revision}` : 'follows latest'}</Badge>
            {shown && shown.availability !== 'available' && <Badge tone="warning">{shown.availability}</Badge>}
            {!product.valid && <Badge tone="danger">invalid reference</Badge>}
          </div>
          {shown === null && <Notice tone="warning" title="Not found">Project Management does not know this product element in this project.</Notice>}
          {shown && typeof shown.version.value === 'number' && product.ref.revision && shown.version.value > product.ref.revision && (
            <Notice tone="warning" title={`Revision ${shown.version.value} exists`} actions={!readOnly && <Button size="sm" isPending={busy} onPress={() => void set({ productElementId: product.ref.id, revision: shown.version.value as number }, `Repinned product element ${shown.key} to revision ${shown.version.value}`)}>Update pin</Button>}>
              The model refers to revision {product.ref.revision}.
            </Notice>
          )}
          {!readOnly && (
            <Button size="sm" variant="text" icon="unlink" isPending={busy} onPress={() => void set(null, 'Removed the product element link')}>
              Unlink product element
            </Button>
          )}
        </div>
      ) : !projects ? (
        <Notice tone="info">Project Management is not available here, so product elements cannot be listed. Links can still be written in text: <code>@EWS::ProductElement {'{'} productElementId = "…"; {'}'}</code></Notice>
      ) : (
        !readOnly && (
          <ComboBox
            ariaLabel="Link a product element"
            placeholder={options.length ? 'Link a product element' : 'No product elements in this project'}
            options={options.map((a) => ({ id: a.ref.id, label: `${a.key} ${a.title}`, description: `${a.version.label ?? `rev ${a.version.value}`} · ${a.lifecycle}` }))}
            onSelect={(o) => {
              const a = options.find((x) => x.ref.id === o.id)
              if (a) void set({ productElementId: a.ref.id, ...(typeof a.version.value === 'number' ? { revision: a.version.value } : {}) }, `Linked product element ${a.key}`)
            }}
          />
        )
      )}
      {cad.map((c) => (
        <div key={c.metadataId} className="smod-chips">
          <Badge tone="neutral" icon="cad">CAD entity</Badge>
          <span className="smod-muted">{c.ref.id || '(missing)'}</span>
          <Badge tone="info">{c.ref.revision ? `rev ${c.ref.revision}` : 'follows latest'}</Badge>
          {!c.valid && <Badge tone="danger">invalid reference</Badge>}
        </div>
      ))}
    </section>
  )
}
