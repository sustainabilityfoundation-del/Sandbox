import { memo, useEffect, useRef, useState } from 'react'
import type { LoadedModel, ModelTreeNode } from '../loading/types'
import { NARROW_LAYOUT, useViewerStore } from '../state/viewerStore'
import { formatCount } from './format'
import { AssemblyIcon, ChevronIcon, EyeIcon, EyeOffIcon, PartIcon } from './icons'

/** Expand the top two levels by default; deep CAD trees stay collapsed. */
function initialExpanded(tree: ModelTreeNode): Set<string> {
  const ids = new Set<string>([tree.id])
  tree.children.forEach((c) => ids.add(c.id))
  return ids
}

interface RowProps {
  node: ModelTreeNode
  depth: number
  expanded: ReadonlySet<string>
  selectedId: string | null
  hiddenIds: ReadonlySet<string>
  ancestorHidden: boolean
  onToggleExpand: (id: string) => void
}

const TreeRow = memo(function TreeRow({
  node,
  depth,
  expanded,
  selectedId,
  hiddenIds,
  ancestorHidden,
  onToggleExpand,
}: RowProps) {
  const select = useViewerStore((s) => s.select)
  const toggleHidden = useViewerStore((s) => s.toggleHidden)
  const hasChildren = node.children.length > 0
  const isOpen = expanded.has(node.id)
  const hidden = hiddenIds.has(node.id)
  const selected = selectedId === node.id
  const Icon = node.kind === 'mesh' ? PartIcon : AssemblyIcon

  return (
    <li role="none">
      <div
        role="treeitem"
        aria-selected={selected}
        aria-expanded={hasChildren ? isOpen : undefined}
        aria-level={depth + 1}
        data-node-id={node.id}
        className={`tree-row${selected ? ' is-selected' : ''}${hidden || ancestorHidden ? ' is-hidden' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => select(selected ? null : node.id)}
        title={`${node.name}\n${formatCount(node.meshCount)} meshes · ${formatCount(node.triangleCount)} triangles`}
      >
        <button
          type="button"
          className={`tree-caret${isOpen ? ' is-open' : ''}`}
          tabIndex={-1}
          aria-hidden={!hasChildren}
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand(node.id)
          }}
        >
          <ChevronIcon width={12} height={12} />
        </button>
        <Icon className="tree-icon" width={14} height={14} />
        <span className="tree-name">{node.name}</span>
        <button
          type="button"
          className="tree-eye"
          aria-label={hidden ? `Show ${node.name}` : `Hide ${node.name}`}
          title={hidden ? 'Show' : 'Hide'}
          aria-pressed={hidden}
          onClick={(e) => {
            e.stopPropagation()
            toggleHidden(node.id)
          }}
        >
          {hidden ? <EyeOffIcon width={14} height={14} /> : <EyeIcon width={14} height={14} />}
        </button>
      </div>
      {hasChildren && isOpen && (
        <ul role="group">
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedId={selectedId}
              hiddenIds={hiddenIds}
              ancestorHidden={ancestorHidden || hidden}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </ul>
      )}
    </li>
  )
})

function ModelTree({ model }: { model: LoadedModel }) {
  const selectedId = useViewerStore((s) => s.selectedId)
  const hiddenIds = useViewerStore((s) => s.hiddenIds)
  const showAll = useViewerStore((s) => s.showAll)
  const [expanded, setExpanded] = useState(() => initialExpanded(model.tree))
  const listRef = useRef<HTMLUListElement>(null)

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  // Reveal a selection made in the viewport: expand its ancestors and scroll to it.
  useEffect(() => {
    if (!selectedId) return
    setExpanded((prev) => {
      let next: Set<string> | null = null
      for (let id = model.parentById.get(selectedId); id; id = model.parentById.get(id)) {
        if (!prev.has(id)) (next ??= new Set(prev)).add(id)
      }
      return next ?? prev
    })
    const frame = requestAnimationFrame(() => {
      listRef.current
        ?.querySelector(`[data-node-id="${CSS.escape(selectedId)}"]`)
        ?.scrollIntoView({ block: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [selectedId, model])

  return (
    <>
      <div className="sidebar-header">
        <h2>Model tree</h2>
        <button type="button" className="link-button" onClick={showAll} disabled={hiddenIds.size === 0}>
          Show all
        </button>
      </div>
      <ul className="tree" role="tree" aria-label="Model components" ref={listRef}>
        <TreeRow
          node={model.tree}
          depth={0}
          expanded={expanded}
          selectedId={selectedId}
          hiddenIds={hiddenIds}
          ancestorHidden={false}
          onToggleExpand={toggleExpand}
        />
      </ul>
    </>
  )
}

export function HierarchySidebar() {
  const model = useViewerStore((s) => s.model)
  const open = useViewerStore((s) => s.sidebarOpen)
  const setSidebarOpen = useViewerStore((s) => s.setSidebarOpen)

  // On narrow screens the sidebar overlays the viewport, so close it when the
  // layout switches to narrow and reopen it when there is room again.
  useEffect(() => {
    const media = window.matchMedia(NARROW_LAYOUT)
    const onChange = () => setSidebarOpen(!media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [setSidebarOpen])

  return (
    <>
      <aside className={`sidebar${open ? ' is-open' : ''}`} aria-label="Model tree" aria-hidden={!open}>
        {model ? (
          <ModelTree key={model.id} model={model} />
        ) : (
          <>
            <div className="sidebar-header">
              <h2>Model tree</h2>
            </div>
            <p className="sidebar-empty">Open a model to see its components.</p>
          </>
        )}
      </aside>
      {open && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}
    </>
  )
}
