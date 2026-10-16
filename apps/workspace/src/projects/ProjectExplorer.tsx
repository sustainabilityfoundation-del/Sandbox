import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button as AriaButton, Tree, TreeItem, TreeItemContent, type Key } from 'react-aria-components'
import { AppIcon, Icon, cx, type IconName } from '@ews/design-system'
import { getProjectsClient, type Artifact } from '@ews/projects-client'
import { workspaceServices } from '../platform/services'
import { openToolOrExplain } from '../platform/api'
import { useExplorerFilter, visibleWithAncestors } from '../shell/layout/explorerFilter'
import { useWorkspaceStore } from '../platform/store'

/**
 * Project Explorer (brief §6, the "artifact and document browser" view of views.md): the project's registered
 * artifacts by module, from the Project Management registry, which every module feeds (ADR-0062). It is a
 * projection: nothing here is stored, and each item opens its owning tool. Used for projects other than the
 * example; PRJ-ACT100 keeps the product tree of its browser twin.
 */
interface Group {
  id: string
  title: string
  icon: IconName
  /** Registry module(s) shown in the group. */
  modules: string[]
  /** Tool that owns the module's artifacts (when an artifact has no deep link of its own). */
  toolId?: string
}

const GROUPS: Group[] = [
  { id: 'grp:product', title: 'Product structure', icon: 'assembly', modules: ['product'] },
  { id: 'grp:concepts', title: 'Concepts and design knowledge', icon: 'category', modules: ['conceptualize'], toolId: 'conceptualize' },
  { id: 'grp:requirements', title: 'Requirements', icon: 'requirements', modules: ['requirements'], toolId: 'requirements' },
  { id: 'grp:sysml', title: 'SysML models', icon: 'sysml', modules: ['sysml'], toolId: 'sysml-modeler' },
  { id: 'grp:cad', title: 'CAD documents', icon: 'cad', modules: ['cad'], toolId: 'cad-modeler' },
  { id: 'grp:project', title: 'Tasks, milestones and documents', icon: 'artifact', modules: ['projects'] },
]

/** Kind order and labels inside a group (unknown kinds follow, alphabetically). */
const KIND_LABEL: Record<string, string> = {
  concept: 'Concepts',
  function: 'Functions',
  'alternative-set': 'Alternative sets',
  decision: 'Decisions',
  constraint: 'Constraints',
  assumption: 'Assumptions',
  'trade-study': 'Trade studies',
  evidence: 'Evidence',
  'concept-implementation': 'Implementations',
  'calculation-model': 'Calculation models',
  'requirement-collection': 'Collections',
  requirement: 'Requirements',
  'requirements-baseline': 'Baselines',
  'sysml-project': 'Models',
  'sysml-tag': 'Tags',
  'cad-document': 'Documents',
  task: 'Tasks',
  issue: 'Issues',
  risk: 'Risks',
  milestone: 'Milestones',
  document: 'Documents',
}
const KIND_ORDER = Object.keys(KIND_LABEL)

const ICON: Record<string, IconName> = {
  'product-element': 'component',
  concept: 'category',
  function: 'run',
  decision: 'approved',
  requirement: 'requirement',
  'sysml-project': 'sysml',
  'sysml-model-element': 'sysml-element',
  'cad-document': 'cad',
  'cad-modeler-entity': 'cad-representation',
  document: 'artifact',
  milestone: 'baseline',
}

function Row({ children, hasChildren }: { children: ReactNode; hasChildren: boolean }) {
  return (
    <TreeItemContent>
      {({ isExpanded, level }) => (
        <div className="ws-tree-row" style={{ paddingInlineStart: 4 + (level - 1) * 16 }}>
          {hasChildren ? (
            <AriaButton slot="chevron" className="ws-tree-caret" aria-label={isExpanded ? 'Collapse' : 'Expand'}>
              <Icon name="chevron-right" size={14} className={cx('transition-transform duration-[var(--ws-motion-short)]', isExpanded && 'rotate-90')} />
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

async function loadAll(projectId: string): Promise<Artifact[]> {
  const client = getProjectsClient(workspaceServices.projects!)!
  const all: Artifact[] = []
  let cursor: string | undefined
  do {
    const page = await client.artifacts(projectId, { sort: 'key', limit: 200, cursor })
    all.push(...page.items)
    cursor = page.nextCursor
  } while (cursor && all.length < 5000)
  return all
}

export function ProjectExplorer({ projectId }: { projectId: string }) {
  const select = useWorkspaceStore((s) => s.select)
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<Key>>(new Set())

  const reload = useCallback(() => {
    loadAll(projectId).then(
      (items) => {
        setArtifacts(items.filter((a) => a.lifecycle !== 'retired' || a.ref.module === 'projects'))
        setError(null)
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    )
  }, [projectId])

  // Registry events (artifact registered, updated, availability changed) refresh the explorer.
  useEffect(() => {
    reload()
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = workspaceServices.projects?.subscribe(projectId, (e) => {
      if (!e.type.startsWith('artifact.')) return
      clearTimeout(timer)
      timer = setTimeout(reload, 300)
    })
    return () => {
      clearTimeout(timer)
      off?.()
    }
  }, [projectId, reload])

  // Explorer search (shell filter): matches and their containers; the data access is unchanged.
  const query = useExplorerFilter((s) => s.query)
  const filtering = query.trim().length > 0
  const tree = useMemo(() => {
    const all = artifacts ?? []
    const visible = visibleWithAncestors(all.map((a) => ({ ...a, id: a.artifactId })), query, (a) => [a.key, a.title], (a) => a.containerId)
    const items = visible ? all.filter((a) => visible.has(a.artifactId)) : all
    const byId = new Map(items.map((a) => [a.artifactId, a]))
    const childrenOf = new Map<string, Artifact[]>()
    for (const a of items) if (a.containerId && byId.has(a.containerId)) childrenOf.set(a.containerId, [...(childrenOf.get(a.containerId) ?? []), a])
    const top = (g: Group) => items.filter((a) => g.modules.includes(a.ref.module) && !(a.containerId && byId.has(a.containerId)))
    return { childrenOf, top }
  }, [artifacts, query])

  const open = (a: Artifact) => {
    const group = GROUPS.find((g) => g.modules.includes(a.ref.module))
    // Requirements and product elements are in the workspace model: select them, so every tool and the inspector follow.
    if (a.ref.module === 'requirements' || a.ref.module === 'product') select([a.ref.id])
    const toolId = a.open?.toolId && a.open.toolId !== 'projects' ? a.open.toolId : group?.toolId
    if (toolId) openToolOrExplain(toolId)
  }

  const expandable: string[] = [...GROUPS.map((g) => g.id)]
  const renderArtifact = (a: Artifact): ReactNode => {
    const children = tree.childrenOf.get(a.artifactId) ?? []
    if (children.length) expandable.push(a.artifactId)
    return (
      <TreeItem key={a.artifactId} id={a.artifactId} textValue={`${a.key} ${a.title}`} className="ws-tree-item" data-artifact-id={a.artifactId}>
        <Row hasChildren={children.length > 0}>
          <AppIcon name={ICON[a.ref.kind] ?? 'artifact'} size={16} className="ws-tree-icon" />
          <span className="ws-tree-id font-mono">{a.key}</span>
          <span className="ws-tree-name" title={`${a.key} ${a.title} · ${a.ref.module}/${a.ref.kind} · version ${a.version.value} · ${a.lifecycle}`}>
            {a.title}
          </span>
          {a.availability !== 'available' && <Icon name="warning" size={16} className="text-fg-3" label={a.availability === 'module-unavailable' ? 'Module unavailable' : 'No longer in its module'} />}
        </Row>
        {children.map(renderArtifact)}
      </TreeItem>
    )
  }
  const renderGroup = (g: Group): ReactNode => {
    const items = tree.top(g)
    const kinds = [...new Set(items.map((a) => a.ref.kind))].sort((x, y) => (KIND_ORDER.indexOf(x) + 1 || 999) - (KIND_ORDER.indexOf(y) + 1 || 999) || x.localeCompare(y))
    // Several kinds in a group get a sub-heading each; one kind is listed directly.
    const body = kinds.length > 1
      ? kinds.map((k) => {
          const id = `${g.id}:${k}`
          expandable.push(id)
          const ofKind = items.filter((a) => a.ref.kind === k)
          return (
            <TreeItem key={id} id={id} textValue={KIND_LABEL[k] ?? k} className="ws-tree-item ws-tree-group">
              <Row hasChildren>
                <span className="ws-tree-name">{KIND_LABEL[k] ?? k}</span>
                <span className="ws-tree-count">{ofKind.length}</span>
              </Row>
              {ofKind.map(renderArtifact)}
            </TreeItem>
          )
        })
      : items.map(renderArtifact)
    return (
      <TreeItem key={g.id} id={g.id} textValue={g.title} className="ws-tree-item ws-tree-group">
        <Row hasChildren>
          <Icon name={g.icon} size={16} className="ws-tree-icon" />
          <span className="ws-tree-name">{g.title}</span>
          <span className="ws-tree-count">{items.length}</span>
        </Row>
        {body}
      </TreeItem>
    )
  }
  const groups = GROUPS.filter((g) => !filtering || tree.top(g).length > 0).map(renderGroup)
  const expandedKeys = new Set<Key>(filtering ? expandable : expandable.filter((id) => !collapsed.has(id)))
  const groupIds = new Set<string>(expandable.filter((id) => id.startsWith('grp:')))

  return (
    <nav className="ws-tree" aria-label="Project explorer" data-help-id="projects.explorer">
      {error && (
        <p className="m-0 px-3 py-2 text-ui-sm text-fg-2" role="alert">
          Project artifacts could not be loaded: {error}
        </p>
      )}
      {artifacts === null && !error ? (
        <p className="m-0 px-3 py-2 text-ui-sm text-fg-3">Loading project artifacts…</p>
      ) : (
        <Tree
          aria-label="Project explorer"
          selectionMode="none"
          expandedKeys={expandedKeys}
          onExpandedChange={(keys) => setCollapsed(new Set(expandable.filter((id) => !keys.has(id))))}
          onAction={(key) => {
            const a = artifacts?.find((x) => x.artifactId === String(key))
            if (a) open(a)
          }}
          disabledKeys={[...groupIds]}
          disabledBehavior="selection"
          escapeKeyBehavior="none"
          className="ws-tree-list"
        >
          {groups}
        </Tree>
      )}
    </nav>
  )
}
