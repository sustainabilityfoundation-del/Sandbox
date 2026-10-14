import { useMemo, useState, type ReactNode } from 'react'
import { Button as AriaButton, Tree, TreeItem, TreeItemContent, type Key, type Selection } from 'react-aria-components'
import { displayId, outputFreshness } from '@ews/model-service'
import type { EngineeringObject } from '@ews/model-service'
import { iconForType } from '@ews/platform-sdk/react'
import { useWorkspaceStore } from '../platform/store'
import { AppIcon, Icon, cx, type IconName } from '@ews/design-system'

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

/** Group headings are tree items that expand and collapse but can't be selected. */
const GROUPS: { id: string; title: string; icon: IconName; hideWhenEmpty?: boolean }[] = [
  { id: 'grp:structure', title: 'Product structure', icon: 'assembly' },
  { id: 'grp:requirements', title: 'Requirements', icon: 'requirements' },
  { id: 'grp:sysml', title: 'SysML model', icon: 'sysml' },
  { id: 'grp:cad', title: 'CAD representations', icon: 'cad' },
  // Saved by the retired Verification tool; kept read-only.
  { id: 'grp:retired', title: 'Retired tool data', icon: 'archive', hideWhenEmpty: true },
]

function Content({ children, hasChildren }: { children: ReactNode; hasChildren: boolean }) {
  return (
    <TreeItemContent>
      {({ isExpanded, level }) => (
        <div className="ws-tree-row" style={{ paddingInlineStart: 4 + (level - 1) * 16 }}>
          {hasChildren ? (
            <AriaButton slot="chevron" className="ws-tree-caret" aria-label={isExpanded ? 'Collapse' : 'Expand'}>
              <Icon name="chevron-right" size={18} className={cx('transition-transform duration-[var(--ws-motion-short)]', isExpanded && 'rotate-90')} />
            </AriaButton>
          ) : (
            <span className="ws-tree-caret" aria-hidden="true" />
          )}
          {children}
        </div>
      )}
    </TreeItemContent>
  )
}

/**
 * Product tree (React Aria Tree): arrow keys move and expand, Enter/Space
 * selects; click selects one object, Ctrl/Cmd/Shift-click adds to the
 * selection. On touch, a long press starts multiple selection.
 */
export function ProductTree() {
  const model = useWorkspaceStore((s) => s.model)!
  const selectedIds = useWorkspaceStore((s) => s.context.selectedIds)
  const select = useWorkspaceStore((s) => s.select)
  const [collapsed, setCollapsed] = useState<Set<Key>>(new Set())
  const stale = useStaleObjects()

  const roots = model.objects.filter((o) => (o.type === 'assembly' || o.type === 'part') && !o.parentId)
  const groupItems: Record<string, EngineeringObject[]> = {
    'grp:structure': roots,
    'grp:requirements': model.objects.filter((o) => o.type === 'requirement'),
    'grp:sysml': model.objects.filter((o) => o.type === 'sysml-element' && !o.parentId),
    'grp:cad': model.objects.filter((o) => o.type === 'cad-representation'),
    'grp:retired': model.objects.filter((o) => o.type === 'procedure'),
  }
  const expandable = [...GROUPS.map((g) => g.id), ...model.objects.filter((o) => model.childrenOf(o.id).length).map((o) => o.id)]
  const expandedKeys = new Set<Key>(expandable.filter((id) => !collapsed.has(id)))

  const onExpandedChange = (keys: Set<Key>) => setCollapsed(new Set(expandable.filter((id) => !keys.has(id))))
  const onSelectionChange = (keys: Selection) => {
    const next = keys === 'all' ? model.objects.map((o) => o.id) : [...keys].map(String).filter((id) => !id.startsWith('grp:'))
    select(next)
  }

  const renderObject = (object: EngineeringObject): ReactNode => {
    const children = model.childrenOf(object.id)
    return (
      <TreeItem
        key={object.id}
        id={object.id}
        textValue={`${displayId(object)} ${object.name}`}
        className="ws-tree-item"
        data-object-id={object.id}
      >
        <Content hasChildren={children.length > 0}>
          <AppIcon name={iconForType(object.type)} size={18} className="ws-tree-icon" />
          <span className="ws-tree-id font-mono">{displayId(object)}</span>
          <span className="ws-tree-name" title={`${displayId(object)} ${object.name} (rev ${object.revision})`}>
            {object.name}
          </span>
          {stale.has(object.id) && <Icon name="history" size={16} className="ws-tree-stale" label="Has potentially stale outputs" />}
        </Content>
        {children.map(renderObject)}
      </TreeItem>
    )
  }

  return (
    <nav className="ws-tree" aria-label="Product tree">
      <Tree
        aria-label="Product tree"
        selectionMode="multiple"
        selectionBehavior="replace"
        selectedKeys={selectedIds}
        onSelectionChange={onSelectionChange}
        expandedKeys={expandedKeys}
        onExpandedChange={onExpandedChange}
        disabledKeys={GROUPS.map((g) => g.id)}
        disabledBehavior="selection"
        escapeKeyBehavior="none"
        className="ws-tree-list"
      >
        {GROUPS.filter((g) => !g.hideWhenEmpty || groupItems[g.id].length).map((group) => (
          <TreeItem key={group.id} id={group.id} textValue={group.title} className="ws-tree-item ws-tree-group">
            <Content hasChildren>
              <Icon name={group.icon} size={18} className="ws-tree-icon" />
              <span className="ws-tree-name">{group.title}</span>
              <span className="ws-tree-count">{groupItems[group.id].length}</span>
            </Content>
            {groupItems[group.id].map(renderObject)}
          </TreeItem>
        ))}
      </Tree>
    </nav>
  )
}
