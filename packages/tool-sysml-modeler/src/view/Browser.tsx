import { AppIcon, SearchField, Select, cx } from '@ews/design-system'
import { children, findElements, isKindOf, semanticsOf, type ChildSummary, type Model } from '@ews/sysml-core'
import { useMemo, useRef, type KeyboardEvent } from 'react'
import { keywordOf } from '../projection/graph'
import { useViewState } from './hooks'

/**
 * Model browser (containment tree) with search and metaclass filter. Lazy: children are computed
 * when a node is expanded. Keyboard: arrows move, Right/Left expand/collapse, Enter selects.
 */

const FILTERS = [
  { id: '', label: 'All kinds' },
  { id: 'Package', label: 'Packages' },
  { id: 'Definition', label: 'Definitions' },
  { id: 'PartUsage', label: 'Parts' },
  { id: 'PortUsage', label: 'Ports' },
  { id: 'AttributeUsage', label: 'Attributes' },
  { id: 'ActionUsage', label: 'Actions and states' },
  { id: 'RequirementUsage', label: 'Requirements' },
  { id: 'ConnectorAsUsage', label: 'Connections and flows' },
]

export function iconFor(metaclass: string) {
  if (metaclass === 'Package' || metaclass === 'LibraryPackage') return 'category' as const
  if (isKindOf(metaclass, 'RequirementDefinition') || isKindOf(metaclass, 'RequirementUsage')) return 'requirement' as const
  if (isKindOf(metaclass, 'Definition')) return 'sysml-block' as const
  if (isKindOf(metaclass, 'ConnectorAsUsage')) return 'connect' as const
  return 'sysml-element' as const
}

export function ModelBrowser({ model, revision }: { model: Model; revision: number }) {
  const [vs, update] = useViewState()
  const s = semanticsOf(model)
  const treeRef = useRef<HTMLDivElement>(null)
  const results = useMemo(
    () => (vs.search.trim() || vs.metaclassFilter ? findElements(model, { text: vs.search.trim() || undefined, metaclass: vs.metaclassFilter || undefined, limit: 200 }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, revision, vs.search, vs.metaclassFilter],
  )
  const select = (id: string) => update((v) => ({ ...v, selectedId: id, pane: v.pane === 'browser' ? 'properties' : v.pane }))
  const toggle = (id: string) => update((v) => ({ ...v, expanded: v.expanded.includes(id) ? v.expanded.filter((x) => x !== id) : [...v.expanded, id] }))

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    const id = items[i].dataset.id!
    if (e.key === 'ArrowDown') items[Math.min(i + 1, items.length - 1)]?.focus()
    else if (e.key === 'ArrowUp') items[Math.max(i - 1, 0)]?.focus()
    else if (e.key === 'ArrowRight' && items[i].getAttribute('aria-expanded') === 'false') toggle(id)
    else if (e.key === 'ArrowLeft' && items[i].getAttribute('aria-expanded') === 'true') toggle(id)
    else if (e.key === 'Enter' || e.key === ' ') select(id)
    else return
    e.preventDefault()
  }

  const row = (c: ChildSummary, depth: number) => {
    const open = vs.expanded.includes(c.id)
    const expandable = c.childCount > 0
    return (
      <div key={c.id} role="none">
        <div
          role="treeitem"
          tabIndex={vs.selectedId === c.id || (!vs.selectedId && depth === 0) ? 0 : -1}
          aria-selected={vs.selectedId === c.id}
          aria-expanded={expandable ? open : undefined}
          aria-level={depth + 1}
          data-id={c.id}
          className={cx('smod-tree-row', vs.selectedId === c.id && 'is-selected')}
          data-depth={Math.min(depth, 12)}
          onClick={() => select(c.id)}
          onDoubleClick={() => expandable && toggle(c.id)}
        >
          <span
            className={cx('smod-twisty', !expandable && 'is-leaf')}
            aria-hidden="true"
            onClick={(e) => {
              e.stopPropagation()
              if (expandable) toggle(c.id)
            }}
          >
            {expandable && <AppIcon name={open ? 'chevron-down' : 'chevron-right'} size={14} />}
          </span>
          <AppIcon name={iconFor(c.metaclass)} size={16} />
          <span className="smod-tree-name">{c.name ?? c.shortName ?? `(${c.metaclass})`}</span>
          <span className="smod-tree-kind">{keywordOf(s.get(c.id)!)}</span>
        </div>
        {open && expandable && <div role="group">{children(model, c.id).map((k) => row(k, depth + 1))}</div>}
      </div>
    )
  }

  return (
    <div className="smod-browser" data-help-id="sysml-modeler.browser">
      <div className="smod-browser-filters">
        <SearchField label="Search the model" placeholder="Search names" value={vs.search} onChange={(v) => update({ search: v })} />
        <Select ariaLabel="Filter by kind" size="sm" value={vs.metaclassFilter} onChange={(v) => update({ metaclassFilter: v })} options={FILTERS} />
      </div>
      {results ? (
        <div className="smod-tree" role="listbox" aria-label="Search results">
          {results.length === 0 && <p className="smod-muted">No elements match.</p>}
          {results.map((r) => (
            <div key={r.id} role="option" tabIndex={0} aria-selected={vs.selectedId === r.id} className={cx('smod-tree-row', vs.selectedId === r.id && 'is-selected')} data-depth={0} onClick={() => select(r.id)} onKeyDown={(e) => e.key === 'Enter' && select(r.id)}>
              <AppIcon name={iconFor(r.metaclass)} size={16} />
              <span className="smod-tree-name">{r.name ?? r.shortName}</span>
              <span className="smod-tree-kind">{r.qualifiedName}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="smod-tree" role="tree" aria-label="Model containment" ref={treeRef} onKeyDown={onKey}>
          {children(model).map((c) => row(c, 0))}
        </div>
      )}
    </div>
  )
}
