import { create } from 'zustand'

/**
 * The explorer's search filter (per window, not persisted): the product tree and the project explorer show
 * matching items with their ancestors. View state only; no engineering data is touched.
 */
export const useExplorerFilter = create<{ query: string; setQuery: (query: string) => void }>()((set) => ({
  query: '',
  setQuery: (query) => set({ query }),
}))

/** Case-insensitive match of any of the texts against the query (empty query matches everything). */
export function matchesQuery(query: string, ...texts: (string | undefined)[]): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return texts.some((t) => !!t && t.toLowerCase().includes(q))
}

/**
 * Items to show for a filter: every match plus its ancestors (so the hierarchy stays readable). `parentOf`
 * returns the parent's ID or undefined. Returns null when the query is empty (show everything).
 */
export function visibleWithAncestors<T extends { id: string }>(
  items: readonly T[],
  query: string,
  texts: (item: T) => (string | undefined)[],
  parentOf: (item: T) => string | undefined,
): Set<string> | null {
  if (!query.trim()) return null
  const byId = new Map(items.map((i) => [i.id, i]))
  const visible = new Set<string>()
  for (const item of items) {
    if (!matchesQuery(query, ...texts(item))) continue
    let current: T | undefined = item
    while (current && !visible.has(current.id)) {
      visible.add(current.id)
      const parent = parentOf(current)
      current = parent ? byId.get(parent) : undefined
    }
  }
  return visible
}
