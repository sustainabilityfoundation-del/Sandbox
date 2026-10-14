import {
  HELP_SCHEMA_VERSION,
  majorVersion,
  validateHelpManifest,
  type HelpContext,
  type HelpId,
  type HelpManifest,
  type HelpModuleInfo,
  type HelpSearchHit,
  type HelpService,
  type HelpTopicResult,
  type HelpTutorial,
} from '@ews/platform-sdk'

/**
 * Platform Help Service (docs/modules/help.md). Modules are discovered from a source function
 * (the tool registry plus the platform's own manifests), so installing, removing or losing access
 * to a module changes what is listed, searched and returned to the assistant at the next call.
 * Nothing here executes operations: the assistant's executable actions come from the operation
 * registry, never from documentation text.
 */

export interface HelpModuleSource {
  moduleId: string
  displayName: string
  /** Installed module version (for documentation compatibility). */
  moduleVersion: string
  /** Undefined when the module ships no help manifest yet. */
  manifest?: HelpManifest
  /** Installed, enabled and permitted for the current user. Evaluated on every call. */
  available: () => boolean
}

interface LoadedModule {
  info: HelpModuleInfo
  manifest: HelpManifest | null
}

const tokenize = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1)

function loadModule(source: HelpModuleSource): LoadedModule {
  const m = source.manifest
  if (!m) {
    return {
      manifest: null,
      info: { moduleId: source.moduleId, displayName: source.displayName, moduleVersion: source.moduleVersion, docsVersion: '', landingTopic: null, topicCount: 0, versionMismatch: false, issues: ['No documentation yet.'], apiReferences: [], topicsByKind: {} },
    }
  }
  const issues = validateHelpManifest(m)
  if (m.moduleId !== source.moduleId) issues.push(`manifest is for "${m.moduleId}", not "${source.moduleId}"`)
  // An unsupported schema cannot be interpreted safely: list the module, serve no topics.
  const usable = m.schemaVersion === HELP_SCHEMA_VERSION && m.moduleId === source.moduleId
  const versionMismatch = majorVersion(m.docsVersion) !== majorVersion(source.moduleVersion)
  if (versionMismatch) issues.push(`documentation was written for version ${m.docsVersion}; installed version is ${source.moduleVersion}`)
  return {
    manifest: usable ? m : null,
    info: {
      moduleId: source.moduleId,
      displayName: source.displayName,
      moduleVersion: source.moduleVersion,
      docsVersion: m.docsVersion,
      landingTopic: usable && m.topics.some((t) => t.id === m.landingTopic) ? m.landingTopic : null,
      topicCount: usable ? m.topics.length : 0,
      versionMismatch,
      issues,
      apiReferences: usable ? m.apiReferences : [],
      topicsByKind: usable ? m.topics.reduce<HelpModuleInfo['topicsByKind']>((acc, t) => ({ ...acc, [t.kind]: [...(acc[t.kind] ?? []), t.id] }), {}) : {},
    },
  }
}

export function createHelpService(sources: () => HelpModuleSource[], onOpen: (target?: HelpId | HelpContext) => void = () => undefined): HelpService {
  const cache = new WeakMap<HelpModuleSource, LoadedModule>()
  const available = (): LoadedModule[] =>
    sources()
      .filter((s) => s.available())
      .map((s) => {
        let loaded = cache.get(s)
        if (!loaded) cache.set(s, (loaded = loadModule(s)))
        return loaded
      })

  const result = (mod: LoadedModule, id: HelpId): HelpTopicResult | undefined => {
    const topic = mod.manifest?.topics.find((t) => t.id === id)
    return topic && { topic, moduleId: mod.info.moduleId, displayName: mod.info.displayName, docsVersion: mod.info.docsVersion }
  }

  const topic = (id: HelpId): HelpTopicResult | undefined => {
    const mod = available().find((m) => id.startsWith(`${m.info.moduleId}.`))
    return mod && result(mod, id)
  }

  const search = (query: string, options: { moduleId?: string; limit?: number } = {}): HelpSearchHit[] => {
    const terms = tokenize(query)
    if (!terms.length) return []
    const hits: HelpSearchHit[] = []
    for (const mod of available()) {
      if (!mod.manifest || (options.moduleId && mod.info.moduleId !== options.moduleId)) continue
      for (const t of mod.manifest.topics) {
        const title = tokenize(t.title)
        const keywords = tokenize([...t.keywords, ...(mod.manifest.keywords ?? [])].join(' '))
        const summary = tokenize(t.summary)
        const body = t.body.toLowerCase()
        let score = 0
        for (const term of terms) {
          if (title.some((w) => w.startsWith(term))) score += 6
          if (keywords.some((w) => w.startsWith(term))) score += 4
          if (summary.some((w) => w.startsWith(term))) score += 2
          if (body.includes(term)) score += 1
          if (t.id.includes(term)) score += 2
        }
        if (!score) continue
        const at = Math.max(0, ...terms.map((term) => body.indexOf(term)))
        const snippet = (at > 0 ? '…' : '') + t.body.slice(Math.max(0, at - 60), at + 160).replace(/\s+/g, ' ').trim() + '…'
        hits.push({ id: t.id, moduleId: mod.info.moduleId, title: t.title, kind: t.kind, summary: t.summary, snippet, score, docsVersion: mod.info.docsVersion, source: t.source })
      }
    }
    return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, options.limit ?? 20)
  }

  const contextual = (ctx: HelpContext): HelpTopicResult[] => {
    const mods = available()
    const found: HelpTopicResult[] = []
    const push = (mod: LoadedModule, id: HelpId | undefined) => {
      const r = id ? result(mod, id) : undefined
      if (r && !found.some((f) => f.topic.id === r.topic.id)) found.push(r)
    }
    const scope = ctx.moduleId ? mods.filter((m) => m.info.moduleId === ctx.moduleId) : mods
    const mappings = (pred: (c: HelpManifest['contextMappings'][number]) => boolean) =>
      scope.flatMap((mod) => (mod.manifest?.contextMappings ?? []).filter(pred).map((c) => [mod, c.helpId] as const))
    // Most specific first: a focused control, a toolbar item, an operation, a property, an object type.
    if (ctx.control) {
      for (const mod of mods) push(mod, mod.manifest?.topics.some((t) => t.id === ctx.control) ? ctx.control : undefined)
      for (const [mod, id] of mods.flatMap((mod) => (mod.manifest?.contextMappings ?? []).filter((c) => c.control === ctx.control).map((c) => [mod, c.helpId] as const))) push(mod, id)
    }
    if (ctx.toolbarItem) for (const [mod, id] of mappings((c) => c.toolbarItem === ctx.toolbarItem)) push(mod, id)
    if (ctx.operation) for (const [mod, id] of mods.flatMap((mod) => (mod.manifest?.contextMappings ?? []).filter((c) => c.operation === ctx.operation).map((c) => [mod, c.helpId] as const))) push(mod, id)
    if (ctx.objectType && ctx.property) for (const [mod, id] of mods.flatMap((mod) => (mod.manifest?.contextMappings ?? []).filter((c) => c.objectType === ctx.objectType && c.property === ctx.property).map((c) => [mod, c.helpId] as const))) push(mod, id)
    if (ctx.objectType) for (const [mod, id] of mods.flatMap((mod) => (mod.manifest?.contextMappings ?? []).filter((c) => c.objectType === ctx.objectType && !c.property).map((c) => [mod, c.helpId] as const))) push(mod, id)
    // Fallbacks: the module's landing page, then the workspace's.
    for (const mod of scope) push(mod, mod.info.landingTopic ?? undefined)
    if (!found.length) for (const mod of mods.filter((m) => m.info.moduleId === 'platform')) push(mod, mod.info.landingTopic ?? undefined)
    return found
  }

  return {
    schemaVersion: HELP_SCHEMA_VERSION,
    modules: () => available().map((m) => m.info),
    topic,
    search,
    contextual,
    tutorials: (moduleId) =>
      available()
        .filter((m) => !moduleId || m.info.moduleId === moduleId)
        .flatMap((m) => (m.manifest?.tutorials ?? []).map((t: HelpTutorial) => ({ ...t, moduleId: m.info.moduleId }))),
    open: onOpen,
  }
}
