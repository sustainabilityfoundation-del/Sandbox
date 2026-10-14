import type { ObjectType } from '@ews/model-service'

/**
 * Help and documentation contract (SDK 1.4). See docs/modules/help.md.
 *
 * Each module ships a help manifest built from Markdown files kept next to its source
 * (`packages/<module>/help/*.md`, front matter + body). The platform Help Service registers the
 * manifests of installed, enabled and entitled modules, answers searches and contextual lookups for
 * people (Help menu, Help Centre, F1) and for the AI assistant, and degrades gracefully when
 * documentation is missing. The same Markdown is the source for the documentation portal.
 *
 * Help IDs are stable, namespaced and lower-case: `<module>.<area>.<item>`, e.g.
 * `requirements.requirement.create`. Keep them when the interface is redesigned.
 */

export const HELP_SCHEMA_VERSION = 1

/** `<module>.<segment>[.<segment>…]`, lower-case letters, digits and hyphens. */
export type HelpId = string
export const HELP_ID_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/

export type HelpTopicKind = 'overview' | 'guide' | 'reference' | 'tutorial' | 'shortcuts' | 'troubleshooting' | 'api'

export interface HelpTopic {
  id: HelpId
  title: string
  kind: HelpTopicKind
  /** One or two sentences; shown in search results and passed to the assistant first. */
  summary: string
  /** Markdown body. Links to other topics use `help:<id>`. */
  body: string
  keywords: string[]
  related?: HelpId[]
  /** Engineering object types this topic explains (for help on a selected object). */
  objectTypes?: ObjectType[]
  /** Executable operations the topic documents (assistant operation names); the registry stays authoritative. */
  operations?: string[]
  /** Repository path of the source file, for provenance. */
  source?: string
}

/** A guided walkthrough. Steps point at controls by help ID (`data-help-id`), never by CSS selector. */
export interface HelpTutorial {
  id: HelpId
  title: string
  summary: string
  /** Topic with the written version of the same steps (always required: tours are an enhancement). */
  topic: HelpId
  steps: { control?: HelpId; title: string; text: string }[]
}

export interface HelpShortcut {
  keys: string
  action: string
  helpId?: HelpId
}

/** Maps interface elements to help topics, for F1 and "?" links. */
export interface HelpContextMapping {
  helpId: HelpId
  /** Toolbar item ID of this module's toolbar. */
  toolbarItem?: string
  /** A control inside the module's view, marked with `data-help-id`. */
  control?: HelpId
  /** Assistant operation or command name. */
  operation?: string
  objectType?: ObjectType
  /** Property of an object type (field help). */
  property?: string
}

export interface HelpApiReference {
  title: string
  /** Same-origin URL (e.g. "/api/requirements/v1/docs") or a help topic. */
  url?: string
  helpId?: HelpId
  kind: 'openapi' | 'typedoc' | 'guide'
}

export interface HelpManifest {
  schemaVersion: typeof HELP_SCHEMA_VERSION
  moduleId: string
  displayName: string
  moduleVersion: string
  /** Version of the module the documentation was written for (semver). */
  docsVersion: string
  landingTopic: HelpId
  topics: HelpTopic[]
  contextMappings: HelpContextMapping[]
  tutorials: HelpTutorial[]
  shortcuts: HelpShortcut[]
  apiReferences: HelpApiReference[]
  /** Extra search terms for the module as a whole. */
  keywords?: string[]
}

/** Where a person (or the assistant) needs help. */
export interface HelpContext {
  moduleId?: string
  toolbarItem?: string
  control?: HelpId
  operation?: string
  objectType?: ObjectType
  property?: string
}

export interface HelpModuleInfo {
  moduleId: string
  displayName: string
  moduleVersion: string
  docsVersion: string
  landingTopic: HelpId | null
  topicCount: number
  /** Documentation written for another major version than the installed module. */
  versionMismatch: boolean
  /** Problems that made the manifest unusable or incomplete. */
  issues: string[]
  apiReferences: HelpApiReference[]
  /** Topic of each kind, for menus (first topic of that kind). */
  topicsByKind: Partial<Record<HelpTopicKind, HelpId[]>>
}

export interface HelpTopicResult {
  topic: HelpTopic
  moduleId: string
  displayName: string
  docsVersion: string
}

export interface HelpSearchHit {
  id: HelpId
  moduleId: string
  title: string
  kind: HelpTopicKind
  summary: string
  /** Text around the best match, for display and for retrieval-augmented answers. */
  snippet: string
  score: number
  docsVersion: string
  source?: string
}

/** The platform Help Service, offered to tools and the assistant as `services.help`. */
export interface HelpService {
  readonly schemaVersion: number
  /** Modules whose documentation the current user may see (installed, enabled, entitled). */
  modules: () => HelpModuleInfo[]
  /** A topic, or undefined when it does not exist or its module is not available. */
  topic: (id: HelpId) => HelpTopicResult | undefined
  search: (query: string, options?: { moduleId?: string; limit?: number }) => HelpSearchHit[]
  /** Best topics for a context, most specific first; falls back to the module landing page. */
  contextual: (context: HelpContext) => HelpTopicResult[]
  tutorials: (moduleId?: string) => (HelpTutorial & { moduleId: string })[]
  /** Opens the Help Centre at a topic (or the context's best topic). UI hosts only; no-op elsewhere. */
  open: (target?: HelpId | HelpContext) => void
}

// ---- Markdown sources --------------------------------------------------------------------------

/**
 * Parses a help Markdown file: YAML-like front matter (`key: value`, `key: [a, b]`) and body.
 * Required keys: help_id, title, kind, summary. Docusaurus reads the same files (it ignores
 * the extra keys), so one source serves the app and the portal.
 */
export function parseHelpMarkdown(raw: string, source?: string): HelpTopic {
  const text = raw.replace(/\r\n/g, '\n')
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text)
  if (!match) throw new Error(`${source ?? 'help file'}: missing front matter`)
  const meta: Record<string, string | string[]> = {}
  for (const line of match[1].split('\n')) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line.trim())
    if (!kv) continue
    const value = kv[2].trim()
    meta[kv[1]] = value.startsWith('[') && value.endsWith(']')
      ? value.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter(Boolean)
      : unquote(value)
  }
  const str = (k: string) => (typeof meta[k] === 'string' ? (meta[k] as string) : '')
  const list = (k: string) => (Array.isArray(meta[k]) ? (meta[k] as string[]) : meta[k] ? [meta[k] as string] : [])
  return {
    id: str('help_id'),
    title: str('title'),
    kind: str('kind') as HelpTopicKind,
    summary: str('summary') || str('description'),
    body: match[2].trim(),
    keywords: list('keywords'),
    related: list('related'),
    objectTypes: list('object_types') as ObjectType[],
    operations: list('operations'),
    source,
  }
}

function unquote(s: string): string {
  return s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) ? s.slice(1, -1) : s
}

const KINDS: HelpTopicKind[] = ['overview', 'guide', 'reference', 'tutorial', 'shortcuts', 'troubleshooting', 'api']

/** Checks a manifest against the shared schema; returns problems (empty when valid). */
export function validateHelpManifest(m: HelpManifest): string[] {
  const issues: string[] = []
  if (m.schemaVersion !== HELP_SCHEMA_VERSION) issues.push(`schema version ${m.schemaVersion} is not supported (expected ${HELP_SCHEMA_VERSION})`)
  if (!m.moduleId || !m.displayName) issues.push('moduleId and displayName are required')
  const ids = new Set<string>()
  for (const t of m.topics) {
    if (!HELP_ID_PATTERN.test(t.id)) issues.push(`topic "${t.id}" is not a valid help ID`)
    else if (!t.id.startsWith(`${m.moduleId}.`)) issues.push(`topic ${t.id} is outside the module namespace "${m.moduleId}."`)
    if (ids.has(t.id)) issues.push(`duplicate topic ${t.id}`)
    ids.add(t.id)
    if (!t.title || !t.summary || !t.body) issues.push(`topic ${t.id} needs a title, summary and body`)
    if (!KINDS.includes(t.kind)) issues.push(`topic ${t.id} has unknown kind "${t.kind}"`)
  }
  const known = (id: HelpId) => ids.has(id) || !id.startsWith(`${m.moduleId}.`)
  if (!ids.has(m.landingTopic)) issues.push(`landing topic ${m.landingTopic} does not exist`)
  for (const t of m.topics) for (const r of t.related ?? []) if (!known(r)) issues.push(`topic ${t.id} links to missing ${r}`)
  for (const t of m.topics) for (const link of t.body.matchAll(/\(help:([a-z0-9.-]+)\)/g)) if (!known(link[1])) issues.push(`topic ${t.id} links to missing ${link[1]}`)
  for (const c of m.contextMappings) if (!ids.has(c.helpId)) issues.push(`context mapping points to missing ${c.helpId}`)
  for (const t of m.tutorials) {
    if (!HELP_ID_PATTERN.test(t.id)) issues.push(`tutorial "${t.id}" is not a valid help ID`)
    if (!ids.has(t.topic)) issues.push(`tutorial ${t.id} needs an existing written topic (${t.topic})`)
    if (!t.steps.length) issues.push(`tutorial ${t.id} has no steps`)
  }
  for (const s of m.shortcuts) if (s.helpId && !ids.has(s.helpId)) issues.push(`shortcut ${s.keys} points to missing ${s.helpId}`)
  for (const a of m.apiReferences) if (a.helpId && !ids.has(a.helpId)) issues.push(`API reference ${a.title} points to missing ${a.helpId}`)
  return issues
}

/** Major version, for documentation compatibility ("1.2.0" → 1). */
export function majorVersion(version: string): number {
  const m = /^(\d+)\./.exec(version.trim())
  return m ? Number(m[1]) : NaN
}
