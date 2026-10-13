import { useMemo, useState, type MouseEvent } from 'react'
import { outputFreshness } from '../domain/freshness'
import type { EngineeringObject } from '../domain/types'
import { useWorkspaceStore } from '../sdk/store'
import { Icons, iconForType } from '../sdk/icons'

function useStaleObjects(): Set<string> {
  const model = useWorkspaceStore((s) => s.model)!
  const outputs = useWorkspaceStore((s) => s.outputs)
  const configurationId = useWorkspaceStore((s) => s.context.configurationId)
  return useMemo(() => {
    const ids = new Set<string>()
    for (const o of outputs) {
      if (o.configurationId === configurationId && outputFreshness(o, model).stale) o.objectIds.forEach((id) => ids.add(id))
    }
    return ids
  }, [model, outputs, configurationId])
}

function Row({
  object,
  depth,
  hasChildren,
  open,
  onToggle,
  stale,
}: {
  object: EngineeringObject
  depth: number
  hasChildren: boolean
  open: boolean
  onToggle: () => void
  stale: boolean
}) {
  const selected = useWorkspaceStore((s) => s.context.selectedIds.includes(object.id))
  const selectedIds = useWorkspaceStore((s) => s.context.selectedIds)
  const select = useWorkspaceStore((s) => s.select)
  const Icon = iconForType(object.type)

  const onClick = (e: MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      select(selected ? selectedIds.filter((id) => id !== object.id) : [...selectedIds, object.id])
    } else {
      select([object.id])
    }
  }

  return (
    <div
      role="treeitem"
      aria-selected={selected}
      aria-expanded={hasChildren ? open : undefined}
      className={`ws-tree-row${selected ? ' is-selected' : ''}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      onClick={onClick}
      title={`${object.id} ${object.name} (rev ${object.revision})`}
      data-object-id={object.id}
    >
      <button
        type="button"
        tabIndex={-1}
        className={`ws-tree-caret${open ? ' is-open' : ''}`}
        style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        aria-label={open ? 'Collapse' : 'Expand'}
      >
        <Icons.chevron width={11} height={11} />
      </button>
      <Icon width={14} height={14} className="ws-tree-icon" />
      <span className="ws-mono ws-tree-id">{object.id}</span>
      <span className="ws-tree-name">{object.name}</span>
      {stale && <span className="ws-stale-dot" title="Has potentially stale outputs" />}
    </div>
  )
}

export function ProductTree() {
  const model = useWorkspaceStore((s) => s.model)!
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const stale = useStaleObjects()

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const renderBranch = (object: EngineeringObject, depth: number): React.ReactNode => {
    const children = model.childrenOf(object.id)
    const open = !collapsed.has(object.id)
    return (
      <div key={object.id} role="group">
        <Row object={object} depth={depth} hasChildren={children.length > 0} open={open} onToggle={() => toggle(object.id)} stale={stale.has(object.id)} />
        {open && children.map((c) => renderBranch(c, depth + 1))}
      </div>
    )
  }

  const roots = model.objects.filter((o) => (o.type === 'assembly' || o.type === 'part') && !o.parentId)
  const sections: { id: string; title: string; items: EngineeringObject[] }[] = [
    { id: 'sec-req', title: 'Requirements', items: model.objects.filter((o) => o.type === 'requirement') },
    { id: 'sec-vp', title: 'Verification procedures', items: model.objects.filter((o) => o.type === 'procedure') },
  ]

  return (
    <nav className="ws-tree" aria-label="Product tree">
      <div className="ws-section-title">Product structure</div>
      <div role="tree">{roots.map((r) => renderBranch(r, 0))}</div>
      {sections.map((section) => {
        const open = !collapsed.has(section.id)
        return (
          <div key={section.id}>
            <button type="button" className="ws-section-title ws-section-toggle" onClick={() => toggle(section.id)} aria-expanded={open}>
              <Icons.chevron width={11} height={11} className={open ? 'is-open' : ''} />
              {section.title}
              <span className="ws-muted">{section.items.length}</span>
            </button>
            {open && (
              <div role="tree">
                {section.items.map((o) => (
                  <Row key={o.id} object={o} depth={0} hasChildren={false} open={false} onToggle={() => undefined} stale={stale.has(o.id)} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}
