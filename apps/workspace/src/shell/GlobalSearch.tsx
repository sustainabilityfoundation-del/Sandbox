import { useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspaceStore } from '../platform/store'
import { isTypingTarget } from '../platform/shortcuts'
import { getTools, toolName } from '../platform/registry'
import { canOpenTool } from '../platform/entitlements'
import { openToolOrExplain } from '../platform/api'
import { ComboBox, type ComboOption } from '@ews/design-system'
import { OBJECT_TYPE_LABEL, iconForType } from '@ews/platform-sdk/react'

/**
 * Searchable combobox over model objects, saved outputs and tools. Choosing an
 * object selects it; choosing an output reveals its component; a tool opens.
 */
export function GlobalSearch({ autoFocus = false, onDone }: { autoFocus?: boolean; onDone?: () => void } = {}) {
  const model = useWorkspaceStore((s) => s.model)!
  const outputs = useWorkspaceStore((s) => s.outputs)
  const configurationId = useWorkspaceStore((s) => s.context.configurationId)
  const select = useWorkspaceStore((s) => s.select)
  const [query, setQuery] = useState('')
  const wrapper = useRef<HTMLDivElement>(null)

  // "/" focuses search from anywhere except while typing in a field.
  useEffect(() => {
    if (autoFocus) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !isTypingTarget(e.target)) {
        e.preventDefault()
        wrapper.current?.querySelector('input')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [autoFocus])

  const options = useMemo<(ComboOption & { run: () => void })[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const match = (...texts: string[]) => texts.some((t) => t.toLowerCase().includes(q))
    const objects = model.objects
      .filter((o) => match(o.id, o.name, String(o.properties.statement ?? '')))
      .map((o) => ({ id: `obj:${o.id}`, label: `${o.id} ${o.name}`, description: OBJECT_TYPE_LABEL[o.type], icon: iconForType(o.type), run: () => select([o.id]) }))
    const outs = outputs
      .filter((o) => o.configurationId === configurationId && match(o.id, o.title, o.summary))
      .map((o) => ({
        id: `out:${o.id}`,
        label: `${o.id} ${o.title}`,
        description: `Artifact · ${toolName(o.toolId)}`,
        icon: 'artifact' as const,
        run: () => select(o.objectIds.filter((id) => model.get(id)?.type !== 'procedure').slice(0, 1)),
      }))
    const tools = getTools()
      .filter((t) => match(t.name, t.category, t.description))
      .map((t) => ({
        id: `tool:${t.id}`,
        label: t.name,
        description: canOpenTool(t.id) ? `Tool · ${t.category}` : 'Tool · not in your subscription',
        icon: canOpenTool(t.id) ? t.icon : ('locked' as const),
        run: () => void openToolOrExplain(t.id),
      }))
    return [...objects, ...outs, ...tools].slice(0, 12)
  }, [query, model, outputs, configurationId, select])

  return (
    <div ref={wrapper} className="ws-search">
      <ComboBox
        ariaLabel="Search objects, outputs and tools"
        placeholder="Search objects, outputs, tools  ( / )"
        options={options}
        inputValue={query}
        onInputChange={setQuery}
        autoFocus={autoFocus}
        selectedKey={null}
        onSelect={(option) => {
          options.find((o) => o.id === option.id)?.run()
          setQuery('')
          onDone?.()
        }}
        inputClassName="ws-search-input"
      />
    </div>
  )
}
