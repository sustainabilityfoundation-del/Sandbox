import type { InspectorSubject } from '@ews/platform-sdk'
import type { AlternativeSet, Assumption, CalculationModel, Concept, DesignConstraint, DesignFunction } from '@ews/conceptualize-client'
import { BASIS, MATURITY, boundText, formatQuantity } from './domain'

/**
 * What the workspace Inspector shows for the record open in Conceptualize (SDK 1.16, `ToolApi.setInspectorSubject`).
 * Pure data: the platform renders it. Keys are the human keys (CST-001), never the canonical UUIDs.
 */

const field = (label: string, value: string | null | undefined) => (value ? [{ label, value }] : [])

export function constraintSubject(c: DesignConstraint): InspectorSubject {
  return {
    id: c.id,
    key: c.key,
    kind: 'Constraint',
    title: c.statement,
    badges: [{ label: c.status, tone: c.status === 'active' ? 'success' : 'neutral' }, { label: c.strength }, { label: BASIS[c.basis].label, tone: BASIS[c.basis].tone }],
    sections: [
      { title: 'Bound', fields: [...field('Bound', boundText(c) || 'No numeric bound (qualitative)'), ...field('Kind', c.kind)] },
      { title: 'Record', fields: [...field('Revision', String(c.revision)), ...field('Source', c.source.kind)] },
    ],
  }
}

export function functionSubject(f: DesignFunction): InspectorSubject {
  return {
    id: f.id,
    key: f.key,
    kind: 'Function',
    title: f.name,
    badges: [{ label: f.status, tone: f.status === 'active' ? 'success' : 'neutral' }],
    sections: [
      { title: 'Function', fields: [...field('Verb phrase', f.verbPhrase), ...field('Purpose', f.purpose), ...field('Description', f.description)] },
      { title: 'Record', fields: field('Revision', String(f.revision)) },
    ],
  }
}

export function assumptionSubject(a: Assumption): InspectorSubject {
  return {
    id: a.id,
    key: a.key,
    kind: 'Assumption',
    title: a.statement,
    badges: [{ label: a.validationStatus, tone: a.validationStatus === 'validated' ? 'success' : 'warning' }, { label: BASIS[a.basis].label, tone: BASIS[a.basis].tone }],
    sections: [
      { title: 'Value', fields: field('Quantity', a.quantity ? formatQuantity(a.quantity) : null) },
      { title: 'Record', fields: field('Revision', String(a.revision)) },
    ],
  }
}

export function calculationSubject(m: CalculationModel): InspectorSubject {
  return {
    id: m.id,
    key: m.key,
    kind: 'Calculation model',
    title: m.name,
    badges: [{ label: m.validationStatus, tone: m.validationStatus === 'validated' ? 'success' : 'warning' }, { label: BASIS[m.basis].label, tone: BASIS[m.basis].tone }],
    sections: [
      { title: 'Model', fields: [...field('Description', m.description), ...field('Parameters', String(m.parameters.length)), ...field('Relations', String(m.relations.length))] },
      { title: 'Record', fields: field('Revision', String(m.revision)) },
    ],
  }
}

export function conceptSubject(c: Concept): InspectorSubject {
  return {
    id: c.id,
    key: c.key,
    kind: 'Concept',
    title: c.name,
    badges: [{ label: MATURITY[c.maturity].label, tone: MATURITY[c.maturity].tone }],
    sections: [
      { title: 'Concept', fields: [...field('Summary', c.summary), ...field('Abstraction', c.abstraction), ...field('Purpose', c.purpose)] },
      { title: 'Status', fields: [...field('Verification', c.verificationStatus), ...field('Implementation', c.implementationStatus), ...field('Revision', String(c.revision))] },
    ],
  }
}

export function alternativeSetSubject(s: AlternativeSet, nameOf: (conceptId: string) => string): InspectorSubject {
  return {
    id: s.id,
    key: s.key,
    kind: 'Alternative set',
    title: s.name,
    badges: [{ label: `${s.members.length} alternative${s.members.length === 1 ? '' : 's'}`, tone: 'info' }],
    sections: [
      { title: 'Question', fields: field('Question', s.question) },
      { title: 'Alternatives', fields: s.members.map((m) => ({ label: nameOf(m.conceptId), value: m.status })) },
    ],
  }
}
