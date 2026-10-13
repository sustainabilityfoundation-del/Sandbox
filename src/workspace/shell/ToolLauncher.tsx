import { useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspaceStore } from '../sdk/store'
import { Icons } from '../sdk/icons'
import { TOOL_CATEGORIES, type ToolDefinition } from '../sdk/toolTypes'
import { getTools } from '../tools/registry'

/**
 * Searchable catalogue of registered tools with favorites, recents and
 * categories. Scales to many tools without a permanent sidebar.
 */
export function ToolLauncher({ onClose }: { onClose: () => void }) {
  const favorites = useWorkspaceStore((s) => s.favorites)
  const recents = useWorkspaceStore((s) => s.recents)
  const openToolIds = useWorkspaceStore((s) => s.openToolIds)
  const activateTool = useWorkspaceStore((s) => s.activateTool)
  const toggleFavorite = useWorkspaceStore((s) => s.toggleFavorite)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const tools = getTools()

  useEffect(() => inputRef.current?.focus(), [])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const byId = (id: string) => tools.find((t) => t.id === id)
    if (q) {
      const matches = tools.filter((t) =>
        [t.name, t.category, t.description, t.id].some((text) => text.toLowerCase().includes(q)),
      )
      return [{ title: `Results (${matches.length})`, items: matches }]
    }
    const list: { title: string; items: ToolDefinition<unknown>[] }[] = []
    const fav = favorites.map(byId).filter((t): t is ToolDefinition<unknown> => !!t)
    const rec = recents.map(byId).filter((t): t is ToolDefinition<unknown> => !!t)
    if (fav.length) list.push({ title: 'Favorites', items: fav })
    if (rec.length) list.push({ title: 'Recent', items: rec.slice(0, 4) })
    for (const category of TOOL_CATEGORIES) {
      const items = tools.filter((t) => t.category === category)
      if (items.length) list.push({ title: category, items })
    }
    return list
  }, [query, tools, favorites, recents])

  const flat = groups.flatMap((g) => g.items.map((t) => ({ group: g.title, tool: t })))
  const open = (tool: ToolDefinition<unknown>) => {
    activateTool(tool.id)
    onClose()
  }

  return (
    <div className="ws-modal-backdrop" onMouseDown={onClose}>
      <div
        className="ws-modal ws-launcher"
        role="dialog"
        aria-modal="true"
        aria-label="Tool launcher"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ws-launcher-search">
          <Icons.search width={16} height={16} />
          <input
            ref={inputRef}
            placeholder={`Search ${tools.length} tools by name, category or purpose`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCursor(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, flat.length - 1))
              else if (e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0))
              else if (e.key === 'Enter' && flat[cursor]) open(flat[cursor].tool)
              else if (e.key === 'Escape') onClose()
              else return
              e.preventDefault()
            }}
            aria-label="Search tools"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="ws-launcher-list">
          {flat.length === 0 && <p className="ws-muted ws-launcher-empty">No tools match “{query}”.</p>}
          {groups.map((group) =>
            group.items.length ? (
              <section key={group.title}>
                <h4>{group.title}</h4>
                {group.items.map((tool) => {
                  const index = flat.findIndex((f) => f.group === group.title && f.tool.id === tool.id)
                  const Icon = tool.icon
                  const favorite = favorites.includes(tool.id)
                  return (
                    <div
                      key={tool.id}
                      className={`ws-launcher-item${index === cursor ? ' is-active' : ''}`}
                      onMouseEnter={() => setCursor(index)}
                      onClick={() => open(tool)}
                      role="option"
                      aria-selected={index === cursor}
                    >
                      <span className="ws-launcher-icon">
                        <Icon width={18} height={18} />
                      </span>
                      <span className="ws-launcher-text">
                        <strong>{tool.name}</strong>
                        <span className="ws-muted">{tool.description}</span>
                      </span>
                      <span className="ws-launcher-meta">
                        {openToolIds.includes(tool.id) && <span className="ws-muted">Open</span>}
                        <span className="ws-badge ws-tone-neutral">{tool.category}</span>
                        <button
                          type="button"
                          className={`ws-star${favorite ? ' is-on' : ''}`}
                          aria-pressed={favorite}
                          aria-label={favorite ? `Remove ${tool.name} from favorites` : `Add ${tool.name} to favorites`}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleFavorite(tool.id)
                          }}
                        >
                          <Icons.star width={14} height={14} />
                        </button>
                      </span>
                    </div>
                  )
                })}
              </section>
            ) : null,
          )}
        </div>
        <footer className="ws-launcher-footer ws-muted">↑↓ to move · Enter to open · Ctrl+K to toggle</footer>
      </div>
    </div>
  )
}
