import { useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspaceStore } from '../sdk/store'
import type { ComponentType, SVGProps } from 'react'
import { Icons, iconForType } from '../sdk/icons'
import { getTools } from '../tools/registry'

interface Result {
  key: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  primary: string
  secondary: string
  group: 'Objects' | 'Outputs' | 'Tools'
  run: () => void
}

/** Searches model objects, saved outputs and tools by ID or name. */
export function GlobalSearch() {
  const model = useWorkspaceStore((s) => s.model)!
  const outputs = useWorkspaceStore((s) => s.outputs)
  const configurationId = useWorkspaceStore((s) => s.context.configurationId)
  const select = useWorkspaceStore((s) => s.select)
  const activateTool = useWorkspaceStore((s) => s.activateTool)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // "/" focuses search from anywhere outside a form field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.key === '/' && !target.closest('input, textarea, select')) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const match = (...texts: string[]) => texts.some((t) => t.toLowerCase().includes(q))
    const objects: Result[] = model.objects
      .filter((o) => match(o.id, o.name, String(o.properties.statement ?? '')))
      .map((o) => ({
        key: o.id,
        icon: iconForType(o.type),
        primary: `${o.id} ${o.name}`,
        secondary: o.type,
        group: 'Objects',
        run: () => select([o.id]),
      }))
    const outs: Result[] = outputs
      .filter((o) => o.configurationId === configurationId && match(o.id, o.title, o.summary))
      .map((o) => ({
        key: o.id,
        icon: Icons.save,
        primary: `${o.id} ${o.title}`,
        secondary: model.scenario(o.scenarioId)?.name ?? '',
        group: 'Outputs',
        run: () => select(o.objectIds.filter((id) => model.get(id)?.type !== 'procedure').slice(0, 1)),
      }))
    const tools: Result[] = getTools()
      .filter((t) => match(t.name, t.category, t.description))
      .map((t) => ({
        key: `tool-${t.id}`,
        icon: t.icon,
        primary: t.name,
        secondary: `Tool · ${t.category}`,
        group: 'Tools',
        run: () => activateTool(t.id),
      }))
    return [...objects, ...outs, ...tools].slice(0, 12)
  }, [query, model, outputs, configurationId, select, activateTool])

  const choose = (r: Result | undefined) => {
    if (!r) return
    r.run()
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <div className="ws-search">
      <Icons.search className="ws-search-icon" width={14} height={14} />
      <input
        ref={inputRef}
        type="search"
        placeholder="Search objects, outputs, tools  ( / )"
        aria-label="Global search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setCursor(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, results.length - 1))
          else if (e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0))
          else if (e.key === 'Enter') choose(results[cursor])
          else if (e.key === 'Escape') {
            setQuery('')
            inputRef.current?.blur()
          } else return
          e.preventDefault()
        }}
      />
      {open && query.trim() && (
        <div className="ws-popover ws-search-results" role="listbox">
          {results.length === 0 && <div className="ws-muted ws-search-empty">No matches</div>}
          {results.map((r, i) => {
            const Icon = r.icon
            return (
              <div key={r.key}>
                {(i === 0 || results[i - 1].group !== r.group) && <div className="ws-search-group">{r.group}</div>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === cursor}
                  className={`ws-search-item${i === cursor ? ' is-active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(r)}
                  onMouseEnter={() => setCursor(i)}
                >
                  <Icon width={14} height={14} />
                  <span>{r.primary}</span>
                  <span className="ws-muted">{r.secondary}</span>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
