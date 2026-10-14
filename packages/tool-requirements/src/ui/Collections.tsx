import { Button, IconButton, LoadingState, MenuButton, MenuItem, Select, TextField } from '@ews/design-system'
import type { CollectionNode, CollectionTree } from '@ews/requirements-client'
import { useState } from 'react'
import { useModuleData, useResource } from '../data'
import { ApiErrorNotice, LifecycleBadge } from './common'

/**
 * Collections (documents): headings and requirement references in order. Reordering uses
 * explicit buttons (no dragging). Structure edits send the structure revision; a concurrent
 * change is reported, not overwritten. Nesting is document structure only.
 */
export function CollectionsPanel({
  collectionId,
  setCollectionId,
  baselineId,
  openRequirementId,
  onOpen,
  selectedRequirementId,
}: {
  collectionId: string | null
  setCollectionId: (id: string | null) => void
  baselineId: string | null
  openRequirementId: string | null
  onOpen: (id: string) => void
  selectedRequirementId: string | null
}) {
  const { client, can, invalidate } = useModuleData()
  const collections = useResource(() => client.collections(), [client])
  const tree = useResource(collectionId ? () => client.tree(collectionId, baselineId ?? undefined) : null, [client, collectionId, baselineId])
  const [error, setError] = useState<unknown>(null)
  const [newName, setNewName] = useState<string | null>(null)
  const [heading, setHeading] = useState<string | null>(null)
  const editable = can('author') && !baselineId && !!tree.data && !tree.data.collection.archived

  const act = async (fn: (t: CollectionTree) => Promise<unknown>) => {
    if (!tree.data) return
    setError(null)
    try {
      await fn(tree.data)
      invalidate()
    } catch (e) {
      setError(e)
      tree.reload()
    }
  }
  const siblings = (n: CollectionNode) => (tree.data?.nodes ?? []).filter((x) => x.parentId === n.parentId).sort((a, b) => a.position - b.position)
  const move = (n: CollectionNode, delta: number) => act((t) => client.moveNode(t.collection.id, n.id, { parentId: n.parentId, position: Math.max(0, n.position + delta) }, t.collection.structureRevision))
  const indent = (n: CollectionNode) => {
    const prev = siblings(n).filter((s) => s.position < n.position).at(-1)
    if (prev) void act((t) => client.moveNode(t.collection.id, n.id, { parentId: prev.id, position: 9999 }, t.collection.structureRevision))
  }
  const outdent = (n: CollectionNode) => {
    const parent = tree.data?.nodes.find((x) => x.id === n.parentId)
    if (parent) void act((t) => client.moveNode(t.collection.id, n.id, { parentId: parent.parentId, position: parent.position + 1 }, t.collection.structureRevision))
  }

  return (
    <aside className="req-collections" aria-label="Collections">
      <div className="req-collections-head">
        <Select
          label="Collection"
          size="sm"
          value={collectionId ?? '__all'}
          onChange={(v) => setCollectionId(v === '__all' ? null : v)}
          options={[{ id: '__all', label: 'All requirements' }, ...(collections.data ?? []).map((c) => ({ id: c.id, label: `${c.name} (${c.requirementCount})` }))]}
        />
        {can('author') && !baselineId && (
          <IconButton icon="add" label="New collection" onPress={() => setNewName('')} />
        )}
      </div>
      {newName !== null && (
        <form
          className="req-inline-form"
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)
            try {
              const c = await client.createCollection({ name: newName })
              setNewName(null)
              invalidate()
              setCollectionId(c.id)
            } catch (err) {
              setError(err)
            }
          }}
        >
          <TextField label="Collection name" value={newName} onChange={setNewName} autoFocus />
          <div className="req-actions-row">
            <Button size="sm" variant="filled" type="submit" isDisabled={!newName.trim()}>
              Create
            </Button>
            <Button size="sm" variant="text" onPress={() => setNewName(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {collections.error && <ApiErrorNotice error={new Error(collections.error)} title="Could not load collections" onRetry={collections.reload} />}
      {collectionId && !tree.data && tree.loading && <LoadingState label="Loading structure…" />}
      {tree.error && <ApiErrorNotice error={new Error(tree.error)} title="Could not load the structure" onRetry={tree.reload} />}
      {tree.data && (
        <>
          {tree.data.collection.description && <p className="ws-hint m-0">{tree.data.collection.description}</p>}
          <ol className="req-tree" aria-label={`Structure of ${tree.data.collection.name}`}>
            {tree.data.nodes.map((n) => {
              const sib = siblings(n)
              const first = sib[0]?.id === n.id
              const last = sib.at(-1)?.id === n.id
              return (
                <li key={n.id} className={`req-tree-node depth-${Math.min(n.depth, 5)}${n.requirementId && n.requirementId === openRequirementId ? ' is-open' : ''}`} data-node-kind={n.kind}>
                  <span className="req-tree-number">{n.number}</span>
                  {n.kind === 'heading' ? (
                    <strong className="req-tree-label">{n.heading}</strong>
                  ) : (
                    <Button size="sm" variant="text" className="req-tree-label" onPress={() => onOpen(n.requirementId!)}>
                      <span className="font-mono">{n.key}</span> {n.title}
                    </Button>
                  )}
                  {n.status && <LifecycleBadge status={n.status} />}
                  {editable && (
                    <MenuButton label={`Arrange ${n.kind === 'heading' ? n.heading : n.key}`} icon="more-vertical">
                      <MenuItem icon="arrow-right" isDisabled={first} onAction={() => void move(n, -1)}>
                        Move up
                      </MenuItem>
                      <MenuItem isDisabled={last} onAction={() => void move(n, 1)}>
                        Move down
                      </MenuItem>
                      <MenuItem isDisabled={first} onAction={() => indent(n)}>
                        Nest under previous
                      </MenuItem>
                      <MenuItem isDisabled={!n.parentId} onAction={() => outdent(n)}>
                        Move out one level
                      </MenuItem>
                      <MenuItem tone="danger" icon="close" onAction={() => void act((t) => client.removeNode(t.collection.id, n.id, t.collection.structureRevision))}>
                        Remove from collection
                      </MenuItem>
                    </MenuButton>
                  )}
                </li>
              )
            })}
          </ol>
          {tree.data.nodes.length === 0 && <p className="m-0 text-fg-3">This collection is empty.</p>}
          {editable && (
            <div className="req-actions-row">
              {heading === null ? (
                <Button size="sm" variant="text" icon="add" onPress={() => setHeading('')}>
                  Heading
                </Button>
              ) : (
                <form
                  className="req-inline-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void act((t) => client.addNode(t.collection.id, { kind: 'heading', heading: heading! }, t.collection.structureRevision)).then(() => setHeading(null))
                  }}
                >
                  <TextField label="Heading text" value={heading} onChange={setHeading} autoFocus />
                  <Button size="sm" variant="filled" type="submit" isDisabled={!heading.trim()}>
                    Add heading
                  </Button>
                </form>
              )}
              {selectedRequirementId && !tree.data.nodes.some((n) => n.requirementId === selectedRequirementId) && (
                <Button size="sm" variant="text" icon="add" onPress={() => void act((t) => client.addNode(t.collection.id, { kind: 'requirement', requirementId: selectedRequirementId }, t.collection.structureRevision))}>
                  Add selected requirement
                </Button>
              )}
            </div>
          )}
          <p className="ws-hint m-0">Headings and nesting are document structure. They never mean derivation or decomposition; use Trace for those.</p>
          {baselineId && <p className="ws-hint m-0">Structure as pinned by the baseline (structure revision {tree.data.collection.structureRevision}).</p>}
        </>
      )}
      {error ? <ApiErrorNotice error={error} title="The structure was not changed" /> : null}
    </aside>
  )
}
