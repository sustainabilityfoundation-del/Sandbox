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

export type CapabilityModule = 'platform' | 'requirements' | 'sysml' | 'cad' | 'cad-modeler' | 'assistant' | 'conceptualize' | 'sysml-modeler'

/** Where the capability is reached by a person. */
export type CapabilitySurface = 'toolbar' | 'panel' | 'field' | 'header' | 'palette' | 'tree' | 'inspector' | 'dialog' | 'api'

/** What it does (proposed capability metadata, ai-interface.md §4). */
export type CapabilityEffect = 'query' | 'view' | 'mutation' | 'job' | 'export' | 'import' | 'external'

/** How real the capability is. Mock features are never labelled implemented. */
export type ImplementationStatus = 'implemented' | 'mock' | 'experimental' | 'restricted'

/**
 * Whether the assistant can do the same thing:
 * - shared: the assistant calls the same operation the UI calls.
 * - equivalent: a different entry point, but the same repository/API validation and ownership checks.
 * - partial: only some of it, or only under conditions (see note).
 * - none: no assistant path yet (a coverage gap).
 * - restricted: deliberately not available to the assistant (secrets, sign-in, infrastructure).
 */
export type AiCoverage = 'shared' | 'equivalent' | 'partial' | 'none' | 'restricted'

export interface CapabilityEntry {
  id: string
  module: CapabilityModule
  surface: CapabilitySurface
  label: string
  effect: CapabilityEffect
  status: ImplementationStatus
  coverage: AiCoverage
  /** Assistant operations (platform operation names or tool action names) that provide the coverage. */
  aiOperations?: string[]
  /** Toolbar item ID within the tool, for toolbar entries (checked against the tool definitions). */
  toolbarItem?: string
  /** Requirements API operationIds behind the capability. */
  apiOperations?: string[]
  note?: string
}

const e = (entry: CapabilityEntry) => entry

export const CAPABILITIES: CapabilityEntry[] = [
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
  e({ id: 'platform.favourites', module: 'platform', surface: 'palette', label: 'Favourite tools', effect: 'view', status: 'implemented', coverage: 'none' }),
  e({ id: 'platform.help', module: 'platform', surface: 'header', label: 'Help Centre, contextual help (F1), module documentation and search', effect: 'query', status: 'implemented', coverage: 'shared', aiOperations: ['read_help'], note: 'Same Help Service and the same pages; filtered by subscription.' }),
  e({ id: 'platform.tutorials', module: 'platform', surface: 'header', label: 'Guided tutorials (tours)', effect: 'view', status: 'implemented', coverage: 'none', note: 'Tours highlight controls for a person; the assistant reads the written version instead (read_help).' }),
  e({ id: 'platform.about', module: 'platform', surface: 'palette', label: 'About this platform (capability status)', effect: 'query', status: 'implemented', coverage: 'none' }),
  e({ id: 'platform.subscription', module: 'platform', surface: 'header', label: 'Switch demo subscription plan', effect: 'external', status: 'mock', coverage: 'restricted', note: 'Client-side prototype (ADR-0008); entitlement administration is not an assistant operation.' }),
  e({ id: 'platform.services', module: 'platform', surface: 'header', label: 'Requirements service mode and development user', effect: 'external', status: 'experimental', coverage: 'restricted', note: 'Identity selection; development only.' }),
  e({ id: 'platform.repository-reset', module: 'platform', surface: 'header', label: 'Reset demo data, simulate outage', effect: 'external', status: 'mock', coverage: 'restricted', note: 'Destructive demo control.' }),
  e({ id: 'platform.undo', module: 'assistant', surface: 'panel', label: 'Undo an applied assistant change', effect: 'mutation', status: 'implemented', coverage: 'shared', aiOperations: ['propose_changes'], note: 'Compensating revision through propose_changes with undoOf; preview still required.' }),

  // ---- assistant itself ----------------------------------------------------------------------
  e({ id: 'assistant.conversation', module: 'assistant', surface: 'panel', label: 'Conversation with tool calling', effect: 'query', status: 'mock', coverage: 'shared', aiOperations: ['propose_changes'], note: 'Scripted demo service; no model provider is connected (RemoteAssistantService is only an adapter).' }),
  e({ id: 'assistant.preview', module: 'assistant', surface: 'panel', label: 'Preview, apply or reject a proposal', effect: 'mutation', status: 'implemented', coverage: 'restricted', note: 'Applying is the user’s approval point (current preview policy, ADR-0013 keeps it).' }),

  // ---- Requirements --------------------------------------------------------------------------
  e({ id: 'requirements.add', module: 'requirements', surface: 'toolbar', toolbarItem: 'add', label: 'Create a requirement', effect: 'mutation', status: 'implemented', coverage: 'none', apiOperations: ['createRequirement'] }),
  e({ id: 'requirements.filter', module: 'requirements', surface: 'toolbar', toolbarItem: 'filter', label: 'Filter by the selected component', effect: 'view', status: 'implemented', coverage: 'partial', aiOperations: ['requirements.read_for_component'], note: 'The assistant reads the same set; it does not change the view filter.' }),
  e({ id: 'requirements.sysml-column', module: 'requirements', surface: 'toolbar', toolbarItem: 'trace', label: 'SysML column', effect: 'view', status: 'implemented', coverage: 'none' }),
  e({ id: 'requirements.allocate', module: 'requirements', surface: 'toolbar', toolbarItem: 'allocate', label: 'Trace: relationships and allocation of the open requirement', effect: 'mutation', status: 'implemented', coverage: 'partial', aiOperations: ['propose_changes'], apiOperations: ['createRelationship', 'deleteRelationship'], note: 'The assistant’s allocated-to rule targets the twin copy; allocation is owned by the Requirements service (ADR-0012), so it does not reach the authoritative data.' }),
  e({ id: 'requirements.list', module: 'requirements', surface: 'panel', label: 'Search, filter, sort and page requirements', effect: 'query', status: 'implemented', coverage: 'partial', aiOperations: ['requirements.search', 'requirements.read_for_component'], apiOperations: ['listRequirements', 'getRequirement', 'getRequirementById', 'resolveRequirement'], note: 'API-mode actions need an open Requirements view (module-level connection).' }),
  e({ id: 'requirements.columns-views', module: 'requirements', surface: 'panel', label: 'Columns and saved views', effect: 'view', status: 'implemented', coverage: 'none', apiOperations: ['listViews', 'createView', 'updateView', 'deleteView'] }),
  e({ id: 'requirements.fields', module: 'requirements', surface: 'field', label: 'Edit title, statement, rationale, type, source, owner, priority, applicability, verification method, acceptance criteria', effect: 'mutation', status: 'implemented', coverage: 'partial', aiOperations: ['requirements.update'], apiOperations: ['updateRequirement'], note: 'Statement and rationale only. In API mode the preview is shown inside the Requirements tool, not the platform preview (contract request 3 deferred).' }),
  e({ id: 'requirements.custom-attributes', module: 'requirements', surface: 'field', label: 'Custom attribute values and definitions', effect: 'mutation', status: 'implemented', coverage: 'none', apiOperations: ['listAttributeDefinitions', 'createAttributeDefinition', 'updateAttributeDefinition'] }),
  e({ id: 'requirements.archive', module: 'requirements', surface: 'panel', label: 'Archive and restore', effect: 'mutation', status: 'implemented', coverage: 'none' }),
  e({ id: 'requirements.lifecycle', module: 'requirements', surface: 'panel', label: 'Request review, withdraw, retire, reinstate', effect: 'mutation', status: 'implemented', coverage: 'none', apiOperations: ['transitionRequirement', 'requirementLifecycle'] }),
  e({ id: 'requirements.reviews', module: 'requirements', surface: 'panel', label: 'Review decisions (approve, reject, comment)', effect: 'mutation', status: 'implemented', coverage: 'restricted', apiOperations: ['listReviews', 'decideReview'], note: 'Approval is a human reviewer decision; not an assistant operation.' }),
  e({ id: 'requirements.history', module: 'requirements', surface: 'panel', label: 'Revisions, history and revision comparison', effect: 'query', status: 'implemented', coverage: 'none', apiOperations: ['listRevisions', 'compareRevisions', 'requirementHistory'] }),
  e({ id: 'requirements.comments', module: 'requirements', surface: 'panel', label: 'Comments and external references', effect: 'mutation', status: 'implemented', coverage: 'none', apiOperations: ['listComments', 'addComment', 'listExternalReferences', 'addExternalReference'] }),
  e({ id: 'requirements.relationships', module: 'requirements', surface: 'panel', label: 'Trace links: derives-from, decomposes, depends-on', effect: 'mutation', status: 'implemented', coverage: 'none', apiOperations: ['relationshipTypes', 'listRelationships', 'requirementRelationships', 'traceLinks'] }),
  e({ id: 'requirements.impact', module: 'requirements', surface: 'panel', label: 'Impact of a requirement change', effect: 'query', status: 'implemented', coverage: 'none', apiOperations: ['requirementImpact'] }),
  e({ id: 'requirements.collections', module: 'requirements', surface: 'panel', label: 'Collections: headings, membership, order', effect: 'mutation', status: 'implemented', coverage: 'none', apiOperations: ['requirementCollections', 'listCollections', 'createCollection', 'getCollectionTree', 'updateCollection', 'addCollectionNode', 'moveCollectionNode', 'renameHeading', 'removeCollectionNode'] }),
  e({ id: 'requirements.matrix', module: 'requirements', surface: 'panel', label: 'Traceability matrix', effect: 'query', status: 'implemented', coverage: 'none', apiOperations: ['traceMatrix'] }),
  e({ id: 'requirements.baselines', module: 'requirements', surface: 'panel', label: 'Requirements baselines and comparison', effect: 'mutation', status: 'implemented', coverage: 'none', apiOperations: ['listBaselines', 'createBaseline', 'getBaseline', 'compareBaselines'] }),
  e({ id: 'requirements.bulk', module: 'requirements', surface: 'panel', label: 'Bulk edit', effect: 'mutation', status: 'implemented', coverage: 'none', apiOperations: ['bulkUpdate'] }),
  e({ id: 'requirements.quality', module: 'requirements', surface: 'panel', label: 'Quality findings, dismissal, conventions', effect: 'query', status: 'implemented', coverage: 'partial', aiOperations: ['requirements.explain_quality'], apiOperations: ['requirementQuality', 'dismissFinding', 'qualitySummary', 'getConventions', 'putConventions'], note: 'The assistant explains findings; it cannot dismiss them or change conventions.' }),
  e({ id: 'requirements.import', module: 'requirements', surface: 'panel', label: 'ReqIF / JSON import with preview', effect: 'import', status: 'implemented', coverage: 'none', apiOperations: ['previewImport', 'listImports', 'getImport', 'applyImport', 'discardImport', 'listExchangeSources', 'getAttachmentContent'] }),
  e({ id: 'requirements.export', module: 'requirements', surface: 'panel', label: 'ReqIF / JSON export', effect: 'export', status: 'implemented', coverage: 'none', apiOperations: ['createExport', 'getExport', 'getExportContent'] }),
  e({ id: 'requirements.verification', module: 'requirements', surface: 'panel', label: 'Record a verification result', effect: 'mutation', status: 'implemented', coverage: 'none', note: 'Saved as a twin artifact (ADR-0007).' }),
  e({ id: 'requirements.events', module: 'requirements', surface: 'api', label: 'Committed-change events', effect: 'query', status: 'implemented', coverage: 'restricted', apiOperations: ['events'], note: 'Infrastructure stream, not a user capability.' }),
  e({ id: 'requirements.permissions', module: 'requirements', surface: 'api', label: 'My permissions', effect: 'query', status: 'implemented', coverage: 'restricted', apiOperations: ['myPermissions'], note: 'Used by clients to hide actions; the assistant’s discovery must be filtered server-side instead (future gateway).' }),
  e({ id: 'requirements.legacy-twin', module: 'requirements', surface: 'panel', label: 'Requirement edits on the old twin copies', effect: 'mutation', status: 'implemented', coverage: 'equivalent', aiOperations: ['requirements.update', 'propose_changes'], note: 'Used only without a connected Requirements service (tests, static preview).' }),

  // ---- SysML ---------------------------------------------------------------------------------
  e({ id: 'sysml.read', module: 'sysml', surface: 'panel', label: 'Diagram, property panel and text notation', effect: 'query', status: 'experimental', coverage: 'equivalent', aiOperations: ['sysml.read_model'], note: 'Text notation is illustrative, not SysML v2.' }),
  e({ id: 'sysml.select', module: 'sysml', surface: 'toolbar', toolbarItem: 'select', label: 'Select mode', effect: 'view', status: 'experimental', coverage: 'none' }),
  e({ id: 'sysml.add-part', module: 'sysml', surface: 'toolbar', toolbarItem: 'add-part', label: 'Add a part', effect: 'mutation', status: 'experimental', coverage: 'equivalent', aiOperations: ['sysml.create_part'] }),
  e({ id: 'sysml.add-requirement', module: 'sysml', surface: 'toolbar', toolbarItem: 'add-requirement', label: 'Add a requirement reference', effect: 'mutation', status: 'experimental', coverage: 'equivalent', aiOperations: ['sysml.add_requirement_reference'] }),
  e({ id: 'sysml.connect', module: 'sysml', surface: 'toolbar', toolbarItem: 'connect', label: 'Connect parts or satisfy a requirement usage', effect: 'mutation', status: 'experimental', coverage: 'equivalent', aiOperations: ['sysml.connect'] }),
  e({ id: 'sysml.fit', module: 'sysml', surface: 'toolbar', toolbarItem: 'fit', label: 'Fit the diagram', effect: 'view', status: 'experimental', coverage: 'none' }),
  e({ id: 'sysml.text', module: 'sysml', surface: 'toolbar', toolbarItem: 'text', label: 'Show text notation', effect: 'view', status: 'experimental', coverage: 'none' }),
  e({ id: 'sysml.edit-properties', module: 'sysml', surface: 'field', label: 'Rename an element, set its type name, remove links', effect: 'mutation', status: 'experimental', coverage: 'partial', aiOperations: ['propose_changes'], note: 'Field rules cover the SysML editable fields; link removal is limited to editable relationship rules.' }),
  e({ id: 'sysml.create-requirement', module: 'sysml', surface: 'dialog', label: 'Create a requirement from SysML (stored in the Requirements service) and reference it', effect: 'mutation', status: 'experimental', coverage: 'none', note: 'Sprint 003, via createRequirement. Assistant proposals cannot carry Requirements service writes yet (contract request 3).' }),
  e({ id: 'sysml.edit-requirement', module: 'sysml', surface: 'inspector', label: 'Edit a referenced requirement’s canonical title and statement from SysML', effect: 'mutation', status: 'experimental', coverage: 'partial', aiOperations: ['requirements.update'], note: 'The assistant edits through the Requirements action (needs an open Requirements view); not from SysML.' }),
  e({ id: 'sysml.open-in-requirements', module: 'sysml', surface: 'inspector', label: 'Open a referenced requirement in Requirements; show a requirement’s SysML usage', effect: 'view', status: 'experimental', coverage: 'partial', aiOperations: ['open_tool', 'select_objects'], note: 'The assistant can open the tool and select the object; there is no single navigation operation.' }),
  e({ id: 'sysml.pan-zoom', module: 'sysml', surface: 'panel', label: 'Pan and zoom the diagram', effect: 'view', status: 'experimental', coverage: 'none' }),

  // ---- CAD -----------------------------------------------------------------------------------
  e({ id: 'cad.read', module: 'cad', surface: 'panel', label: 'Read a representation and its dimensions', effect: 'query', status: 'mock', coverage: 'equivalent', aiOperations: ['cad.read_representation'], note: 'Mock geometry; no CAD kernel.' }),
  e({ id: 'cad.select', module: 'cad', surface: 'toolbar', toolbarItem: 'select', label: 'Select mode', effect: 'view', status: 'mock', coverage: 'none' }),
  e({ id: 'cad.pan', module: 'cad', surface: 'toolbar', toolbarItem: 'pan', label: 'Pan mode', effect: 'view', status: 'mock', coverage: 'none' }),
  e({ id: 'cad.zoom-in', module: 'cad', surface: 'toolbar', toolbarItem: 'zoom-in', label: 'Zoom in', effect: 'view', status: 'mock', coverage: 'none' }),
  e({ id: 'cad.zoom-out', module: 'cad', surface: 'toolbar', toolbarItem: 'zoom-out', label: 'Zoom out', effect: 'view', status: 'mock', coverage: 'none' }),
  e({ id: 'cad.fit', module: 'cad', surface: 'toolbar', toolbarItem: 'fit', label: 'Fit', effect: 'view', status: 'mock', coverage: 'none' }),
  e({ id: 'cad.dimensions', module: 'cad', surface: 'toolbar', toolbarItem: 'dimensions', label: 'Edit dimensions (also updates the mapped component property)', effect: 'mutation', status: 'mock', coverage: 'equivalent', aiOperations: ['cad.set_dimension'], note: 'Same unit/range validation and CAD delegation in both paths; geometry is a mock drawing.' }),
  e({ id: 'cad.visibility', module: 'cad', surface: 'toolbar', toolbarItem: 'visibility', label: 'Hide or show parts in a view', effect: 'view', status: 'mock', coverage: 'none' }),
  e({ id: 'cad.snapshot', module: 'cad', surface: 'panel', label: 'Save a representation snapshot', effect: 'mutation', status: 'mock', coverage: 'none' }),
  e({ id: 'cad.export', module: 'cad', surface: 'panel', label: 'Native CAD model, geometric checks, STL export', effect: 'export', status: 'restricted', coverage: 'restricted', note: 'Not implemented: needs a real CAD kernel (development plan sprints 8–9). Listed so it is never presented as available.' }),

  // ---- Conceptualize (appended by the Conceptualize agent; API: /api/concepts/v1, OpenAPI operationIds in services/conceptualize) ----
  e({ id: 'conceptualize.new', module: 'conceptualize', surface: 'toolbar', toolbarItem: 'new', label: 'Create a Concept from a natural-language description', effect: 'mutation', status: 'implemented', coverage: 'equivalent', aiOperations: ['conceptualize.create'], note: 'Both use the same deterministic draft and createConcept; the assistant path is a service proposal applied by the user (API: createConcept).' }),
  e({ id: 'conceptualize.child', module: 'conceptualize', surface: 'toolbar', toolbarItem: 'child', label: 'Add a child Concept (decomposition)', effect: 'mutation', status: 'implemented', coverage: 'equivalent', aiOperations: ['conceptualize.decompose'], note: 'API: createConcept with parentId (contains).' }),
  e({ id: 'conceptualize.branch', module: 'conceptualize', surface: 'toolbar', toolbarItem: 'branch', label: 'Branch a Concept into a new alternative', effect: 'mutation', status: 'implemented', coverage: 'none', note: 'API: branchConcept.' }),
  e({ id: 'conceptualize.alternatives', module: 'conceptualize', surface: 'toolbar', toolbarItem: 'alternatives', label: 'Alternative Explorer: side-by-side comparison and trade study', effect: 'view', status: 'implemented', coverage: 'partial', aiOperations: ['conceptualize.compare'], note: 'The assistant reads the same comparison; it does not change the view (API: listAlternativeSets, listTradeStudies).' }),
  e({ id: 'conceptualize.graph', module: 'conceptualize', surface: 'toolbar', toolbarItem: 'graph', label: 'Graph view of Concept relationships', effect: 'view', status: 'implemented', coverage: 'none' }),
  e({ id: 'conceptualize.explorer', module: 'conceptualize', surface: 'tree', label: 'Concept Explorer: search, filters, hierarchy with decompositions and alternative sets', effect: 'query', status: 'implemented', coverage: 'partial', aiOperations: ['conceptualize.search', 'conceptualize.read'], note: 'The assistant searches and reads Concepts; it does not navigate the tree (API: listConcepts, conceptGraph, getConcept).' }),
  e({ id: 'conceptualize.edit-intent', module: 'conceptualize', surface: 'field', label: 'Edit intent: description, purpose, statements with basis and quantities; confirm AI hypotheses', effect: 'mutation', status: 'implemented', coverage: 'none', note: 'Confirmation of AI hypotheses is deliberately a person’s action (API: updateConcept).' }),
  e({ id: 'conceptualize.relationships', module: 'conceptualize', surface: 'panel', label: 'Typed relationships, decompositions', effect: 'mutation', status: 'implemented', coverage: 'partial', aiOperations: ['conceptualize.decompose'], note: 'The assistant adds contains links through decomposition only (API: createRelationship, removeRelationship, createDecomposition, updateDecomposition).' }),
  e({ id: 'conceptualize.maturity', module: 'conceptualize', surface: 'panel', label: 'Maturity changes, verification status, maturity assessment', effect: 'mutation', status: 'implemented', coverage: 'partial', aiOperations: ['conceptualize.next_steps'], note: 'The assistant reads the assessment; approval gates (selected and later, verification) are restricted to reviewers (API: changeMaturity, changeVerificationStatus, assessConcept).' }),
  e({ id: 'conceptualize.explore', module: 'conceptualize', surface: 'panel', label: 'Generate alternatives with decomposition, preliminary estimates and a trade study', effect: 'mutation', status: 'mock', coverage: 'shared', aiOperations: ['conceptualize.develop_alternatives'], note: 'Scripted demo generator (no model provider); the exploration API is real (createExploration, undoExploration).' }),
  e({ id: 'conceptualize.tradestudy', module: 'conceptualize', surface: 'panel', label: 'Trade studies: criteria, weights, scores with units and ranges', effect: 'mutation', status: 'implemented', coverage: 'partial', aiOperations: ['conceptualize.compare'], note: 'The assistant reads results; scoring is a user action (API: createTradeStudy, updateTradeStudy, putTradeScores).' }),
  e({ id: 'conceptualize.decisions', module: 'conceptualize', surface: 'dialog', label: 'Design decisions: propose, record (approval gate), supersede', effect: 'mutation', status: 'implemented', coverage: 'partial', aiOperations: ['conceptualize.propose_decision'], note: 'The assistant can only propose; recording is a reviewer decision (API: createDecision, recordDecision, withdrawDecision).' }),
  e({ id: 'conceptualize.implementations', module: 'conceptualize', surface: 'panel', label: 'ConceptImplementations: link, replace, unlink, repin artifacts', effect: 'mutation', status: 'implemented', coverage: 'partial', aiOperations: ['conceptualize.link_artifact'], note: 'The assistant creates an implementation with one artifact; replacing and repinning are user actions (API: createImplementation, linkArtifact, unlinkArtifact, repinArtifact).' }),
  e({ id: 'conceptualize.realization', module: 'conceptualize', surface: 'panel', label: 'Request CAD generation (recorded realization request)', effect: 'external', status: 'mock', coverage: 'shared', aiOperations: ['conceptualize.request_realization'], note: 'No CAD generation API exists: the request is recorded and stays pending (API: requestRealization).' }),
  e({ id: 'conceptualize.requirements', module: 'conceptualize', surface: 'panel', label: 'Requirement traceability and draft requirement proposals', effect: 'mutation', status: 'implemented', coverage: 'partial', aiOperations: ['conceptualize.propose_requirement'], note: 'Draft requirements through the Requirements service; approval stays in Requirements (API: createLink, repinLink, removeLink).' }),
  e({ id: 'conceptualize.evidence', module: 'conceptualize', surface: 'panel', label: 'Evidence records (preliminary and verified)', effect: 'mutation', status: 'implemented', coverage: 'partial', aiOperations: ['conceptualize.develop_alternatives'], note: 'The assistant records estimates only inside explorations; verified evidence is a person’s action (API: createEvidence).' }),
  e({ id: 'conceptualize.integration', module: 'conceptualize', surface: 'panel', label: 'Engineering integration: stale and broken links, change notifications', effect: 'query', status: 'implemented', coverage: 'none', note: 'Checked in the browser through the SDK (contracts §9).' }),
  e({ id: 'conceptualize.history', module: 'conceptualize', surface: 'panel', label: 'Revisions, history and AI provenance', effect: 'query', status: 'implemented', coverage: 'partial', aiOperations: ['conceptualize.read'], note: 'API: listConceptRevisions, conceptHistory, projectHistory.' }),
  // ---- CAD Modeler (CAD program Phase 1; appended by the CAD agent, coordinator review) -------
  // UI and assistant run the same typed cad-core commands (ADR-0023); mutations are service proposals.
  e({ id: 'cad-modeler.new', module: 'cad-modeler', surface: 'toolbar', toolbarItem: 'new', label: 'New CAD document with one part', effect: 'mutation', status: 'implemented', coverage: 'equivalent', aiOperations: ['cad-modeler.new_document', 'cad-modeler.run_commands'], note: 'run_commands also creates a document when none is open.' }),
  e({ id: 'cad-modeler.open', module: 'cad-modeler', surface: 'toolbar', toolbarItem: 'open', label: 'Open a native .ewscad file (other formats detected and explained)', effect: 'import', status: 'implemented', coverage: 'partial', aiOperations: ['cad-modeler.open_document'], note: 'The assistant opens native JSON it holds (for example from query get_document); it cannot read files from the user’s disk.' }),
  e({ id: 'cad-modeler.save', module: 'cad-modeler', surface: 'toolbar', toolbarItem: 'save', label: 'Save the native parametric model (.ewscad download)', effect: 'export', status: 'implemented', coverage: 'shared', aiOperations: ['cad-modeler.export'], note: 'format ewscad; same session save.' }),
  e({ id: 'cad-modeler.sketch', module: 'cad-modeler', surface: 'toolbar', toolbarItem: 'sketch', label: 'Create a sketch on a standard plane', effect: 'mutation', status: 'implemented', coverage: 'shared', aiOperations: ['cad-modeler.run_commands'], note: 'create_sketch.' }),
  e({ id: 'cad-modeler.extrude', module: 'cad-modeler', surface: 'toolbar', toolbarItem: 'extrude', label: 'Extrude a profile (new body, join, cut), with preview', effect: 'mutation', status: 'implemented', coverage: 'shared', aiOperations: ['cad-modeler.run_commands'], note: 'extrude_profile / edit_feature; the assistant preview is the same dry run.' }),
  e({ id: 'cad-modeler.revolve', module: 'cad-modeler', surface: 'toolbar', toolbarItem: 'revolve', label: 'Revolve a profile about an axis, with preview', effect: 'mutation', status: 'implemented', coverage: 'shared', aiOperations: ['cad-modeler.run_commands'], note: 'revolve_profile / edit_feature.' }),
  e({ id: 'cad-modeler.undo', module: 'cad-modeler', surface: 'toolbar', toolbarItem: 'undo', label: 'Undo the last CAD transaction', effect: 'mutation', status: 'implemented', coverage: 'shared', aiOperations: ['cad-modeler.undo'] }),
  e({ id: 'cad-modeler.redo', module: 'cad-modeler', surface: 'toolbar', toolbarItem: 'redo', label: 'Redo a CAD transaction', effect: 'mutation', status: 'implemented', coverage: 'none' }),
  e({ id: 'cad-modeler.fit', module: 'cad-modeler', surface: 'toolbar', toolbarItem: 'fit', label: 'Fit the model in the 3D view', effect: 'view', status: 'implemented', coverage: 'none' }),
  e({ id: 'cad-modeler.export-step', module: 'cad-modeler', surface: 'toolbar', toolbarItem: 'export-step', label: 'Export STEP AP242 with a structural check', effect: 'export', status: 'implemented', coverage: 'shared', aiOperations: ['cad-modeler.export'] }),
  e({ id: 'cad-modeler.sketch-edit', module: 'cad-modeler', surface: 'panel', label: 'Sketch geometry, constraints, dimensions, construction, delete', effect: 'mutation', status: 'implemented', coverage: 'shared', aiOperations: ['cad-modeler.run_commands'] }),
  e({ id: 'cad-modeler.parameters', module: 'cad-modeler', surface: 'panel', label: 'Parameters and expressions (create, edit, delete)', effect: 'mutation', status: 'implemented', coverage: 'shared', aiOperations: ['cad-modeler.run_commands'] }),
  e({ id: 'cad-modeler.feature-tree', module: 'cad-modeler', surface: 'tree', label: 'Feature tree: status, edit, suppress, delete, rename', effect: 'mutation', status: 'implemented', coverage: 'shared', aiOperations: ['cad-modeler.describe_model', 'cad-modeler.run_commands'] }),
  e({ id: 'cad-modeler.inspect', module: 'cad-modeler', surface: 'inspector', label: 'Face, body and feature properties; mass properties; stable face names', effect: 'query', status: 'implemented', coverage: 'equivalent', aiOperations: ['cad-modeler.query'] }),
  e({ id: 'cad-modeler.semantics', module: 'cad-modeler', surface: 'inspector', label: 'Material, named interfaces and cross-module references', effect: 'mutation', status: 'implemented', coverage: 'partial', aiOperations: ['cad-modeler.run_commands', 'read_object'], note: 'The view validates twin components against the model; the assistant checks targets with read_object first. Other modules do not show CAD links yet.' }),
  e({ id: 'cad-modeler.diagnostics', module: 'cad-modeler', surface: 'panel', label: 'Kernel, regeneration (rebuilt/reused), failures, STEP report, operation log', effect: 'query', status: 'implemented', coverage: 'equivalent', aiOperations: ['cad-modeler.query', 'cad-modeler.describe_model'] }),
  e({ id: 'cad-modeler.viewport', module: 'cad-modeler', surface: 'panel', label: '3D view: orbit, pan, zoom, standard views, face picking and highlight', effect: 'view', status: 'implemented', coverage: 'partial', aiOperations: ['cad-modeler.query'], note: 'The assistant identifies faces by stable name (get_entities); camera control and viewport images are not available to it.' }),
  // ---- SysML Modeler (appended by the SysML agent; API /api/sysml/v1, typed commands in @ews/sysml-core) ----
  e({ id: 'sysml-modeler.add', module: 'sysml-modeler', surface: 'toolbar', toolbarItem: 'add', label: 'Add a package, definition or usage (Add dialog, Add member)', effect: 'mutation', status: 'implemented', coverage: 'shared', aiOperations: ['sysml-modeler.propose_commands'], note: 'Both issue createElement through a transaction; the assistant path is a previewed service proposal.' }),
  e({ id: 'sysml-modeler.connect', module: 'sysml-modeler', surface: 'toolbar', toolbarItem: 'connect', label: 'Connect parts or ports (connection, interface, flow, binding, succession, allocation)', effect: 'mutation', status: 'implemented', coverage: 'shared', aiOperations: ['sysml-modeler.propose_commands'], note: 'Command connect.' }),
  e({ id: 'sysml-modeler.general', module: 'sysml-modeler', surface: 'toolbar', toolbarItem: 'general', label: 'General View of a namespace (projection, automatic layout)', effect: 'view', status: 'implemented', coverage: 'partial', aiOperations: ['sysml-modeler.read_element', 'sysml-modeler.find_elements'], note: 'The assistant reads the same model content; it does not open or arrange the view.' }),
  e({ id: 'sysml-modeler.interconnection', module: 'sysml-modeler', surface: 'toolbar', toolbarItem: 'interconnection', label: 'Interconnection View of a part definition', effect: 'view', status: 'implemented', coverage: 'partial', aiOperations: ['sysml-modeler.read_element'], note: 'The assistant reads parts, ports and connections; it does not open the view.' }),
  e({ id: 'sysml-modeler.text', module: 'sysml-modeler', surface: 'toolbar', toolbarItem: 'text', label: 'Edit a namespace as SysML v2 text with preview and apply (identity-preserving)', effect: 'mutation', status: 'implemented', coverage: 'shared', aiOperations: ['sysml-modeler.propose_text', 'sysml-modeler.read_element'], note: 'Command applyText in both paths.' }),
  e({ id: 'sysml-modeler.validate', module: 'sysml-modeler', surface: 'toolbar', toolbarItem: 'validate', label: 'Validation results (17 rules)', effect: 'query', status: 'implemented', coverage: 'shared', aiOperations: ['sysml-modeler.validate'] }),
  e({ id: 'sysml-modeler.history', module: 'sysml-modeler', surface: 'toolbar', toolbarItem: 'history', label: 'Commit history with provenance', effect: 'query', status: 'implemented', coverage: 'equivalent', aiOperations: ['sysml-modeler.explain_commit'] }),
  e({ id: 'sysml-modeler.undo', module: 'sysml-modeler', surface: 'toolbar', toolbarItem: 'undo', label: 'Undo a commit (compensating commit)', effect: 'mutation', status: 'implemented', coverage: 'partial', aiOperations: ['sysml-modeler.propose_commands'], note: 'The assistant undoes its own applied proposals (proposal undo → revert); it has no operation to revert other commits.' }),
  e({ id: 'sysml-modeler.browser', module: 'sysml-modeler', surface: 'tree', label: 'Model browser: containment tree, search, kind filter', effect: 'query', status: 'implemented', coverage: 'equivalent', aiOperations: ['sysml-modeler.find_elements', 'sysml-modeler.read_element'] }),
  e({ id: 'sysml-modeler.properties', module: 'sysml-modeler', surface: 'panel', label: 'Properties: rename, typing, specialization, multiplicity, value, direction, abstract, documentation, delete', effect: 'mutation', status: 'implemented', coverage: 'shared', aiOperations: ['sysml-modeler.propose_commands'], note: 'rename, setTyping, addSpecialization, setMultiplicity, setValue, setDirection, setAbstract, setDocumentation, deleteElement.' }),
  e({ id: 'sysml-modeler.impact', module: 'sysml-modeler', surface: 'panel', label: 'Referenced by (impact analysis)', effect: 'query', status: 'implemented', coverage: 'shared', aiOperations: ['sysml-modeler.impact'] }),
  e({ id: 'sysml-modeler.requirement-link', module: 'sysml-modeler', surface: 'panel', label: 'Link a SysML requirement to a managed requirement (pinned revision, live text, stale pin, update pin, unlink)', effect: 'mutation', status: 'implemented', coverage: 'partial', aiOperations: ['sysml-modeler.link_requirement'], note: 'The assistant proposes new links; updating a pin and unlinking are a person’s actions (command setMetadata in all paths).' }),
  e({ id: 'sysml-modeler.schema', module: 'sysml-modeler', surface: 'api', label: 'Command schemas and supported metaclasses (schema discovery)', effect: 'query', status: 'implemented', coverage: 'shared', aiOperations: ['sysml-modeler.describe_commands'] }),
  e({ id: 'sysml-modeler.projects', module: 'sysml-modeler', surface: 'header', label: 'Choose or create a SysML project and branch', effect: 'view', status: 'implemented', coverage: 'none', note: 'Branch and tag creation are API-only in this version.' }),
  e({ id: 'sysml-modeler.matrix', module: 'sysml-modeler', surface: 'toolbar', toolbarItem: 'matrix', label: 'Relationship matrices: satisfy, allocate, connect (grid views, projections)', effect: 'query', status: 'implemented', coverage: 'equivalent', aiOperations: ['sysml-modeler.matrix'], note: 'Same core function (relationshipMatrix) in both paths; read-only.' }),
  e({ id: 'sysml-modeler.coverage', module: 'sysml-modeler', surface: 'toolbar', toolbarItem: 'coverage', label: 'Requirement coverage: satisfied by, verified by, managed link, status, gaps', effect: 'query', status: 'implemented', coverage: 'equivalent', aiOperations: ['sysml-modeler.coverage'], note: 'Same core function (requirementCoverage); modelled claims, not test evidence.' }),
  e({ id: 'sysml-modeler.action-flow', module: 'sysml-modeler', surface: 'toolbar', toolbarItem: 'action-flow', label: 'Action Flow View: actions, parameters, successions, flows (projection)', effect: 'view', status: 'implemented', coverage: 'partial', aiOperations: ['sysml-modeler.behavior'], note: 'The assistant reads the same projection; it does not open the view. Decision/fork/join nodes are not drawn yet.' }),
  e({ id: 'sysml-modeler.state-transition', module: 'sysml-modeler', surface: 'toolbar', toolbarItem: 'state-transition', label: 'State Transition View: states, entry/do/exit, transitions with triggers and guards (projection)', effect: 'view', status: 'implemented', coverage: 'partial', aiOperations: ['sysml-modeler.behavior'], note: 'The assistant reads the same projection; it does not open the view. Descriptive only, not simulated.' }),
]

/** Assistant operations the platform itself offers (see toolSpecs.ts); listed for completeness checks. */
export const PLATFORM_OPERATION_ENTRIES = ['read_object', 'search_objects', 'read_relationships', 'read_artifacts', 'read_help', 'propose_changes', 'select_objects', 'open_tool'] as const

export interface CoverageSummary {
  total: number
  byCoverage: Record<AiCoverage, number>
  /** Share of non-restricted capabilities the assistant can do fully (shared or equivalent). */
  coveredShare: number
}

export function summarize(entries: CapabilityEntry[]): CoverageSummary {
  const byCoverage: Record<AiCoverage, number> = { shared: 0, equivalent: 0, partial: 0, none: 0, restricted: 0 }
  for (const entry of entries) byCoverage[entry.coverage]++
  const eligible = entries.length - byCoverage.restricted
  return { total: entries.length, byCoverage, coveredShare: eligible ? (byCoverage.shared + byCoverage.equivalent) / eligible : 0 }
}
