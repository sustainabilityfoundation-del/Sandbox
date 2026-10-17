import type { ServerModuleDescriptor } from '@ews/platform-sdk'
import { BASE_PATH } from './http/openapi'

/**
 * Conceptualize's server manifest (docs/specifications/module-registration.md, M2): API base path and documentation
 * page, provisioning, its place in the AI access policy (module descriptor and operation classes) and its target for
 * the assistant's declarative proposals. The plugin registration needs the API host object, so `register` stays in
 * services/api/src/modules.ts, which spreads this descriptor.
 */
export const conceptualizeServerManifest: ServerModuleDescriptor = {
  id: 'conceptualize',
  name: 'Conceptualize',
  basePath: BASE_PATH,
  docs: 'Conceptualize API',
  provisioning: { lazyReason: 'Conceptualize stores data by project ID; its project space appears with the first concept.' },
  proposals: { entitlement: 'tool:conceptualize', projectParam: 'projectId' },
  aiModule: { id: 'conceptualize', label: 'Conceptualize', description: 'Concepts, alternatives, trade studies and decisions.', entitlement: 'tool:conceptualize', prefixes: ['conceptualize.'] },
  operations: {
    'conceptualize.search': 'search',
    'conceptualize.read': 'read',
    'conceptualize.create': 'propose',
    'conceptualize.develop_alternatives': 'propose',
    'conceptualize.decompose': 'propose',
    'conceptualize.compare': 'calculate',
    'conceptualize.propose_decision': 'propose',
    'conceptualize.link_artifact': 'propose',
    'conceptualize.propose_requirement': 'propose',
    'conceptualize.request_realization': 'external-generation',
    'conceptualize.next_steps': 'calculate',
    // Design knowledge (Conceptualize sprint 2; appended by the Conceptualize agent, COORDINATOR REVIEW)
    'conceptualize.create_function': 'propose',
    'conceptualize.convert_to_function': 'propose',
    'conceptualize.create_constraint': 'propose',
    'conceptualize.promote_constraint': 'propose',
    'conceptualize.record_assumption': 'propose',
    'conceptualize.create_link': 'propose',
    'conceptualize.rationale': 'read',
    'conceptualize.traverse': 'read',
    'conceptualize.search_design': 'search',
    // D1-CON (appended by the Conceptualize agent, COORDINATOR REVIEW)
    'conceptualize.revise_constraint': 'propose',
    'conceptualize.record_evidence': 'propose',
    'conceptualize.review_flags': 'read',
    'conceptualize.list_constraints': 'read',
    // CR-C8 (appended by the Conceptualize agent, COORDINATOR REVIEW)
    'conceptualize.evaluate_calculation': 'calculate',
    'conceptualize.record_calculation': 'propose',
    // Visual concept exploration (appended by the Conceptualize agent, COORDINATOR REVIEW)
    'conceptualize.define_concept': 'propose',
    'conceptualize.read_visuals': 'read',
    'conceptualize.request_illustration': 'external-generation',
    'conceptualize.annotate_visual': 'propose',
    'conceptualize.refine_from_annotations': 'propose',
    'conceptualize.compare_cards': 'read',
    'conceptualize.reject_alternative': 'propose',
    'conceptualize.create_cad_handoff': 'propose',
    // ECII increment 1: engineering intent and clarification (appended by the ECII implementer, COORDINATOR REVIEW)
    'conceptualize.interpret_intent': 'propose',
    'conceptualize.read_context': 'read',
    'conceptualize.identify_gaps': 'calculate',
  },
}
