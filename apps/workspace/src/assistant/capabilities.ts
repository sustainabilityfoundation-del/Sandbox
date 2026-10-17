/**
 * AI capability coverage inventory (AI Interface sprint 1, docs/modules/ai-interface/development-plan.md).
 *
 * Lists what a user can do in the product, UI controls and backend operations, and records whether
 * the assistant can do the same, through which operation, and how honestly that is implemented. It
 * is an inspection aid, not a registry the assistant executes from: execution still goes through
 * PLATFORM_TOOLS, tool AssistantContributions and the repository/API validation (ADR-0010). The
 * proposed registry (ADR-0013) is not implemented; nothing here grants an operation.
 *
 * Keep it complete: capabilities.test.ts fails when a tool toolbar item, an assistant operation or a
 * Requirements API operation exists without an entry here.
 */

import { installed } from '../platform/installedModules'
import type { AiCoverage, CapabilityEffect, CapabilityEntry, CapabilityModule, CapabilityStatus, CapabilitySurface } from '@ews/platform-sdk'

// The entry types are the SDK's (module manifests, SDK 1.10); re-exported for the Coverage dialog and tests.
export type { AiCoverage, CapabilityEffect, CapabilityEntry, CapabilityModule, CapabilitySurface }
/** Same members as before; renamed `CapabilityStatus` in the SDK (`ImplementationStatus` collides there). */
export type ImplementationStatus = CapabilityStatus

const e = (entry: CapabilityEntry) => entry

/** Platform-owned entries (platform shell, assistant); module entries come from the installed modules' manifests. */
export const PLATFORM_CAPABILITIES: CapabilityEntry[] = [
  // ---- platform shell ------------------------------------------------------------------------
  e({ id: 'platform.select', module: 'platform', surface: 'tree', label: 'Select objects (tree, tools, references)', effect: 'view', status: 'implemented', coverage: 'shared', aiOperations: ['select_objects'] }),
  e({ id: 'platform.open-tool', module: 'platform', surface: 'palette', label: 'Open or focus a tool', effect: 'view', status: 'implemented', coverage: 'shared', aiOperations: ['open_tool'], note: 'Subscription checked for both.' }),
  e({ id: 'platform.close-tool', module: 'platform', surface: 'palette', label: 'Close a tool tab', effect: 'view', status: 'implemented', coverage: 'none' }),
  e({ id: 'platform.read-object', module: 'platform', surface: 'inspector', label: 'Inspect an object: properties, relationships, revision', effect: 'query', status: 'implemented', coverage: 'equivalent', aiOperations: ['read_object', 'read_relationships'] }),
  e({ id: 'platform.search', module: 'platform', surface: 'header', label: 'Search objects, outputs and tools', effect: 'query', status: 'implemented', coverage: 'partial', aiOperations: ['search_objects'], note: 'Assistant searches objects only, not outputs or tools.' }),
  e({ id: 'platform.artifacts', module: 'platform', surface: 'inspector', label: 'Saved artifacts and freshness', effect: 'query', status: 'implemented', coverage: 'equivalent', aiOperations: ['read_artifacts'] }),
  e({ id: 'platform.review-status', module: 'platform', surface: 'inspector', label: 'Set an artifact review status', effect: 'mutation', status: 'implemented', coverage: 'none' }),
  e({ id: 'platform.context', module: 'platform', surface: 'header', label: 'Change configuration or scenario', effect: 'view', status: 'implemented', coverage: 'none', note: 'The assistant reads the context captured with each message but cannot change it.' }),
  e({ id: 'platform.change-impact', module: 'platform', surface: 'inspector', label: 'Change impact and revision history', effect: 'query', status: 'implemented', coverage: 'partial', aiOperations: ['read_relationships', 'read_artifacts'], note: 'No operation returns baselines that pin an object or its revision history.' }),
  e({ id: 'platform.baseline-create', module: 'platform', surface: 'header', label: 'Create a baseline', effect: 'mutation', status: 'implemented', coverage: 'none' }),
  e({ id: 'platform.baseline-compare', module: 'platform', surface: 'dialog', label: 'Compare with a baseline', effect: 'query', status: 'implemented', coverage: 'none' }),
  e({ id: 'platform.activity', module: 'platform', surface: 'panel', label: 'Activity log and filters', effect: 'query', status: 'implemented', coverage: 'none' }),
  e({ id: 'platform.layout', module: 'platform', surface: 'palette', label: 'Panels, split view, layout sizes', effect: 'view', status: 'implemented', coverage: 'none' }),
  e({ id: 'platform.windows', module: 'platform', surface: 'header', label: 'Open views in separate windows, pin views', effect: 'view', status: 'implemented', coverage: 'none' }),
  e({ id: 'platform.display', module: 'platform', surface: 'header', label: 'Theme and density', effect: 'view', status: 'implemented', coverage: 'none' }),
  e({ id: 'platform.settings', module: 'platform', surface: 'header', label: 'Settings centre: Platform page and module settings pages (search, deep links)', effect: 'mutation', status: 'implemented', coverage: 'none', note: 'Module settings are typed definitions (SDK 1.6) validated by the settings service; no assistant operation reads or changes them yet.' }),
  e({ id: 'platform.favourites', module: 'platform', surface: 'palette', label: 'Favourite tools', effect: 'view', status: 'implemented', coverage: 'none' }),
  e({ id: 'platform.help', module: 'platform', surface: 'header', label: 'Help Centre, contextual help (F1), module documentation and search', effect: 'query', status: 'implemented', coverage: 'shared', aiOperations: ['read_help'], note: 'Same Help Service and the same pages; filtered by subscription.' }),
  e({ id: 'platform.tutorials', module: 'platform', surface: 'header', label: 'Guided tutorials (tours)', effect: 'view', status: 'implemented', coverage: 'none', note: 'Tours highlight controls for a person; the assistant reads the written version instead (read_help).' }),
  e({ id: 'platform.about', module: 'platform', surface: 'palette', label: 'About this platform (capability status)', effect: 'query', status: 'implemented', coverage: 'none' }),
  e({ id: 'platform.subscription', module: 'platform', surface: 'header', label: 'Switch demo subscription plan', effect: 'external', status: 'mock', coverage: 'restricted', note: 'Client-side prototype (ADR-0008); entitlement administration is not an assistant operation.' }),
  e({ id: 'platform.services', module: 'platform', surface: 'header', label: 'Requirements service mode and development user', effect: 'external', status: 'experimental', coverage: 'restricted', note: 'Identity selection; development only.' }),
  e({ id: 'platform.repository-reset', module: 'platform', surface: 'header', label: 'Reset demo data, simulate outage', effect: 'external', status: 'mock', coverage: 'restricted', note: 'Destructive demo control.' }),
  e({ id: 'platform.undo', module: 'assistant', surface: 'panel', label: 'Undo an applied assistant change', effect: 'mutation', status: 'implemented', coverage: 'shared', aiOperations: ['propose_changes'], note: 'Compensating revision through propose_changes with undoOf; preview still required.' }),
  // ---- assistant itself ----------------------------------------------------------------------
  e({ id: 'assistant.conversation', module: 'assistant', surface: 'panel', label: 'Conversation with tool calling', effect: 'query', status: 'experimental', coverage: 'shared', aiOperations: ['propose_changes'], note: 'Scripted demo by default. With a connected account (Settings → AI and reasoning) the backend assistant service (services/assistant, OpenAI first) answers through the same operations, filtered by the server-enforced AI access policy; answer quality is not evaluated.' }),
  e({ id: 'assistant.connect', module: 'assistant', surface: 'dialog', label: 'Connect or disconnect your AI account, choose the model, test the connection', effect: 'external', status: 'experimental', coverage: 'restricted', note: 'Sign-in and credentials are never assistant operations (secrets stay on the server).' }),
  e({ id: 'assistant.policy', module: 'assistant', surface: 'dialog', label: 'AI access policy: modules, operation classes, data sharing, limits, project limits', effect: 'mutation', status: 'implemented', coverage: 'restricted', note: 'The assistant cannot change its own access; the server enforces the policy on every request.' }),
  e({ id: 'assistant.send-preview', module: 'assistant', surface: 'dialog', label: 'Preview what is sent to the AI provider', effect: 'query', status: 'implemented', coverage: 'restricted', note: 'Shows a person what leaves the platform; not an assistant operation.' }),
  e({ id: 'assistant.audit', module: 'assistant', surface: 'dialog', label: 'Audit of recent AI calls', effect: 'query', status: 'implemented', coverage: 'restricted', note: 'Oversight of the assistant by the person; not available to the assistant itself.' }),
  e({ id: 'assistant.preview', module: 'assistant', surface: 'panel', label: 'Preview, apply or reject a proposal', effect: 'mutation', status: 'implemented', coverage: 'restricted', note: 'Applying is the user’s approval point (current preview policy, ADR-0013 keeps it).' }),
  // ---- Requirements --------------------------------------------------------------------------
  // ---- SysML ---------------------------------------------------------------------------------
  // ---- CAD -----------------------------------------------------------------------------------
  // ---- Conceptualize (appended by the Conceptualize agent; API: /api/concepts/v1, OpenAPI operationIds in services/conceptualize) ----
  // ---- Project Management (platform module, headless; demonstration D1) ------------------------------------
  // ---- CAD (CAD program Phase 1; appended by the CAD agent, coordinator review) -------
  // ---- System Model (appended by the SysML agent; API /api/sysml/v1, typed commands in @ews/sysml-core) ----
]

/**
 * Merges the platform-owned (legacy) entries with the module entries collected from manifests. An ID defined in
 * both places is a mistake (the entry moved to a manifest but the old one was not deleted), so it throws.
 */
export function mergeCapabilities(legacy: readonly CapabilityEntry[], fromManifests: readonly CapabilityEntry[]): CapabilityEntry[] {
  const legacyIds = new Set(legacy.map((c) => c.id))
  const duplicated = fromManifests.filter((c) => legacyIds.has(c.id)).map((c) => c.id)
  if (duplicated.length) throw new Error(`Capability entries defined both in the legacy inventory and in a module manifest: ${duplicated.join(', ')}.`)
  return [...legacy, ...fromManifests]
}

/** The whole inventory: platform-owned entries, then the installed modules' manifest entries in list order. */
export const CAPABILITIES: CapabilityEntry[] = mergeCapabilities(PLATFORM_CAPABILITIES, installed().capabilities)

/** Assistant operations the platform itself offers (see toolSpecs.ts); listed for completeness checks. */
export const PLATFORM_OPERATION_ENTRIES = ['read_object', 'search_objects', 'read_relationships', 'read_artifacts', 'read_help', 'propose_changes', 'select_objects', 'open_tool'] as const

/**
 * Engineering operations (queries, domain changes, jobs, exports, imports, external requests) and view controls
 * (panels, filters, cameras, selection, windows) are measured separately (integration milestone 1 §4.5): a high
 * share of covered view controls must not hide gaps in engineering operations, or the reverse.
 */
export type CapabilityKind = 'engineering' | 'view'

export function kindOf(entry: CapabilityEntry): CapabilityKind {
  return entry.effect === 'view' ? 'view' : 'engineering'
}

export interface KindSummary {
  total: number
  /** Not restricted. */
  eligible: number
  /** Shared or equivalent. */
  covered: number
  coveredShare: number
}

export interface CoverageSummary {
  total: number
  byCoverage: Record<AiCoverage, number>
  /** Share of non-restricted capabilities the assistant can do fully (shared or equivalent). */
  coveredShare: number
  engineering: KindSummary
  view: KindSummary
}

function kindSummary(entries: CapabilityEntry[]): KindSummary {
  const eligible = entries.filter((e) => e.coverage !== 'restricted')
  const covered = eligible.filter((e) => e.coverage === 'shared' || e.coverage === 'equivalent').length
  return { total: entries.length, eligible: eligible.length, covered, coveredShare: eligible.length ? covered / eligible.length : 0 }
}

export function summarize(entries: CapabilityEntry[]): CoverageSummary {
  const byCoverage: Record<AiCoverage, number> = { shared: 0, equivalent: 0, partial: 0, none: 0, restricted: 0 }
  for (const entry of entries) byCoverage[entry.coverage]++
  const eligible = entries.length - byCoverage.restricted
  return {
    total: entries.length,
    byCoverage,
    coveredShare: eligible ? (byCoverage.shared + byCoverage.equivalent) / eligible : 0,
    engineering: kindSummary(entries.filter((e) => kindOf(e) === 'engineering')),
    view: kindSummary(entries.filter((e) => kindOf(e) === 'view')),
  }
}
