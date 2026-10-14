import { Badge, Button, Notice, type Tone } from '@ews/design-system'
import type { IconName } from '@ews/design-system'
import type { RequirementLifecycleStatus } from '@ews/platform-sdk'
import { createElement, useEffect, useState, type ReactNode } from 'react'
import { useModuleData, errorInfo } from '../data'

export const STATUS_LABEL: Record<RequirementLifecycleStatus, { label: string; tone: Tone; icon: IconName }> = {
  draft: { label: 'Draft', tone: 'neutral', icon: 'draft' },
  'in-review': { label: 'In review', tone: 'info', icon: 'review' },
  approved: { label: 'Approved', tone: 'success', icon: 'approved' },
  retired: { label: 'Retired', tone: 'neutral', icon: 'archive' },
}

/** Lifecycle status (approval workflow). Not verification, compliance or modelled satisfaction. */
export function LifecycleBadge({ status, archived }: { status: RequirementLifecycleStatus; archived?: boolean }) {
  const s = STATUS_LABEL[status]
  return (
    <span className="inline-flex flex-wrap gap-1" data-status={status}>
      <Badge tone={s.tone} icon={s.icon} title="Lifecycle status (review and approval), not verification">
        {s.label}
      </Badge>
      {archived && (
        <Badge tone="warning" icon="archive">
          Archived
        </Badge>
      )}
    </span>
  )
}

export const METHOD_LABEL: Record<string, string> = { analysis: 'Analysis', test: 'Test', inspection: 'Inspection', demonstration: 'Demonstration' }
export const PRIORITY_LABEL: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' }
export const RELATION_LABEL: Record<string, { out: string; in: string }> = {
  'derives-from': { out: 'Derives from', in: 'Derived requirements' },
  decomposes: { out: 'Part of the decomposition of', in: 'Decomposed into' },
  'depends-on': { out: 'Depends on', in: 'Required by (dependents)' },
  'allocated-to': { out: 'Allocated to', in: 'Allocated requirements' },
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * A failed API call: the message, field problems, and — for revision conflicts — what to do.
 * Callers keep the user's input; this component never discards it.
 */
export function ApiErrorNotice({ error, onRetry, onReload, title }: { error: unknown; onRetry?: () => void; onReload?: () => void; title?: string }) {
  const info = errorInfo(error)
  const conflict = info.code === 'conflict'
  return (
    <Notice
      tone={conflict ? 'warning' : 'danger'}
      title={title ?? (conflict ? 'Someone else changed this first' : info.code === 'forbidden' ? 'Not allowed' : info.code === 'unavailable' ? 'The Requirements service is not reachable' : 'Could not save')}
      actions={
        <>
          {conflict && onReload && (
            <Button size="sm" variant="outlined" icon="sync" onPress={onReload}>
              Load latest (keep my edits)
            </Button>
          )}
          {onRetry && !conflict && info.code !== 'forbidden' && (
            <Button size="sm" variant="outlined" icon="reset" onPress={onRetry}>
              Try again
            </Button>
          )}
        </>
      }
    >
      {info.message}
      {conflict && info.currentRevision ? ` The current revision is ${info.currentRevision}; nothing was overwritten.` : ''}
      {info.fields && (
        <ul className="req-field-errors">
          {Object.entries(info.fields).map(([k, v]) => (
            <li key={k}>
              <strong>{k}</strong>: {v}
            </li>
          ))}
        </ul>
      )}
      {!conflict && ' Your input is kept.'}
    </Notice>
  )
}

// ---- sanitised rich text ---------------------------------------------------------------------------

const ALLOWED = new Set(['div', 'p', 'br', 'span', 'b', 'strong', 'i', 'em', 'u', 'sub', 'sup', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'pre', 'code', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'object', 'caption', 'del', 'ins', 'abbr', 'cite', 'q', 'dl', 'dt', 'dd', 'hr', 'big', 'small', 'tt', 'kbd', 'samp', 'var', 'dfn', 'address'])

function AttachmentImage({ id, alt }: { id: string; alt: string }) {
  const { client } = useModuleData()
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let revoke: string | null = null
    client.transport
      .request<Uint8Array>('GET', `/projects/${client.projectId}/attachments/${id}/content`, { accept: 'bytes' })
      .then((r) => {
        const type = r.headers.get('Content-Type') ?? 'application/octet-stream'
        if (!type.startsWith('image/')) return setFailed(true)
        revoke = URL.createObjectURL(new Blob([r.data as BlobPart], { type }))
        setUrl(revoke)
      })
      .catch(() => setFailed(true))
    return () => {
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [client, id])
  if (failed) return <Badge tone="neutral" icon="artifact">Attachment {alt}</Badge>
  return url ? <img src={url} alt={alt} className="req-attachment" /> : <span className="text-fg-3">Loading attachment…</span>
}

function renderNode(node: Node, key: number): ReactNode {
  if (node.nodeType === 3) return node.textContent
  if (node.nodeType !== 1) return null
  const el = node as Element
  const tag = el.localName.toLowerCase()
  const children = [...el.childNodes].map((c, i) => renderNode(c, i))
  if (!ALLOWED.has(tag)) return <span key={key}>{children}</span>
  if (tag === 'a') {
    const href = el.getAttribute('href') ?? ''
    return /^https?:\/\//i.test(href) ? (
      <a key={key} href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span key={key}>{children}</span>
    )
  }
  if (tag === 'object') {
    const data = el.getAttribute('data') ?? ''
    const m = /^attachment:([0-9a-f-]{36})$/.exec(data)
    return m ? <AttachmentImage key={key} id={m[1]} alt={el.getAttribute('name') ?? el.textContent ?? 'attachment'} /> : <span key={key}>{children}</span>
  }
  return createElement(tag, { key }, ...children)
}

/**
 * Renders XHTML that the server has already sanitised, again restricted to an allow-list and
 * built as React elements (never innerHTML): no scripts, styles, event handlers or foreign links.
 */
export function RichText({ xhtml, fallback }: { xhtml: string | null; fallback: string }) {
  if (!xhtml || typeof DOMParser === 'undefined') return <>{fallback}</>
  const doc = new DOMParser().parseFromString(`<div xmlns="http://www.w3.org/1999/xhtml">${xhtml}</div>`, 'application/xhtml+xml')
  if (doc.getElementsByTagName('parsererror').length) return <>{fallback}</>
  return <div className="req-rich">{[...doc.documentElement.childNodes].map((n, i) => renderNode(n, i))}</div>
}
