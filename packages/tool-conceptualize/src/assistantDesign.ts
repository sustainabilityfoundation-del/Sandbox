import { ActionError, argOptionalString, argString, type AssistantActionDefinition, type DemoPlanner, type ServiceProposalItem } from '@ews/platform-sdk'
import type { BatchItem, ConstraintKind, DesignEntityType, DesignRef, Quantity } from '@ews/conceptualize-client'
import { formatQuantity } from './domain'
import { assistantProvenance, connection, proposal, resolve, resolveRef, string } from './assistantShared'

/**
 * Assistant operations for design knowledge (Design Reasoning P1: Functions, Constraints, Assumptions,
 * typed links, rationale and graph queries). Reads return data; every change is a service proposal
 * applied by the user, sent with assistant provenance and an idempotency key scoped by conversation.
 * The server labels the content ai-hypothesis and refuses what the assistant may not assert.
 */

const UNDO = 'Undo of an assistant proposal (compensating change)'
const OPERATORS = ['<=', '<', '=', '>=', '>'] as const

function quantityArg(args: Record<string, unknown>): Quantity | undefined {
  const unit = argOptionalString(args, 'unit')
  const value = typeof args.value === 'number' ? args.value : undefined
  if (value === undefined) return undefined
  return { value, unit: unit ?? '-' }
}

export const designActions: AssistantActionDefinition[] = [
  {
    name: 'conceptualize.create_function',
    label: 'Prepare a Function',
    description:
      'Prepare a Function (what must be accomplished, independent of how), optionally as a sub-function of another Function (FN-…) and performed by existing Concepts (CON-…). One atomic batch; the Function and the performs links are AI hypotheses until a person confirms them.',
    parameters: {
      type: 'object',
      properties: { name: string, verbPhrase: string, description: string, parentFunctionId: string, performedBy: { type: 'array', items: string, maxItems: 20 } },
      required: ['name'],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const name = argString(args, 'name')
      const parentArg = argOptionalString(args, 'parentFunctionId')
      const parent = parentArg ? await resolveRef(client, parentArg, ['function']) : undefined
      const performers = await Promise.all((Array.isArray(args.performedBy) ? args.performedBy : []).map((k) => resolve(client, String(k))))
      const description = argOptionalString(args, 'description')
      const verbPhrase = argOptionalString(args, 'verbPhrase')
      let fnId: string | undefined
      let linkIds: string[] = []
      return proposal({
        title: `Create Function “${name}”`,
        explanation: `Creates a Function${parent ? ` as a sub-function of ${parent.key}` : ''}${performers.length ? ` performed by ${performers.map((c) => c.key).join(', ')}` : ''}, in one atomic change. A Function is never implemented directly and is never an alternative.`,
        preview: [
          { label: 'New Function', proposed: name, basis: 'ai-hypothesis' },
          ...(verbPhrase ? [{ label: 'Verb phrase', proposed: verbPhrase, basis: 'ai-hypothesis' as const }] : []),
          ...(description ? [{ label: 'Description', proposed: description, basis: 'ai-hypothesis' as const }] : []),
          ...(parent ? [{ label: 'Decomposes', proposed: `${parent.key} ${parent.label} decomposes into ${name}`, targetId: parent.ref.id, basis: 'ai-hypothesis' as const }] : []),
          ...performers.map((c): ServiceProposalItem => ({ label: 'Performs (link)', proposed: `${c.key} ${c.name} performs ${name}`, targetId: c.id, basis: 'ai-hypothesis' })),
        ],
        async apply(p) {
          const ops: BatchItem[] = [{ op: 'createFunction', as: '$fn', body: { name, ...(verbPhrase ? { verbPhrase } : {}), ...(description ? { description } : {}), ...(parent ? { parentFunctionId: parent.ref.id } : {}), reason: `Assistant proposal ${p.proposalId}` } }]
          for (const c of performers) ops.push({ op: 'createLink', as: `$l${ops.length}`, body: { type: 'performs', from: { module: 'conceptualize', type: 'concept', id: c.id }, to: { module: 'conceptualize', type: 'function', id: '$fn' } } })
          const r = await client.batch(ops, { provenance: assistantProvenance(p), idempotencyKey: `${p.conversationId}:${p.proposalId}:function`, reason: `Assistant proposal ${p.proposalId}` })
          fnId = r.ids.$fn
          linkIds = Object.entries(r.ids).filter(([k]) => k !== '$fn').map(([, v]) => v)
          const fnKey = r.results[0]?.key ?? 'the Function'
          return { summary: `Created ${fnKey} ${name}${linkIds.length ? ` with ${linkIds.length} performs link(s)` : ''}`, createdIds: [fnId, ...linkIds] }
        },
        async undo() {
          if (!fnId) return { summary: 'Nothing to undo.' }
          for (const id of linkIds) {
            const l = await client.designLink(id)
            if (!l.removed) await client.removeDesignLink(id, { expectedRevision: l.revision, reason: UNDO })
          }
          const f = await client.function(fnId)
          await client.updateFunction(fnId, { status: 'retired' }, { expectedRevision: f.revision, reason: UNDO })
          return { summary: `Retired ${f.key} and removed its links (kept in the history)` }
        },
      })
    },
  },
  {
    name: 'conceptualize.convert_to_function',
    label: 'Prepare a conversion to Function',
    description:
      'Prepare the explicit conversion of a function-Concept (CON-…) into a Function: copies its function, behaviour, performance and constraint statements (quantified ones become objectives), records derived-from the Concept revision, and re-expresses implements relationships as performs. The Concept is not changed and stays as history.',
    parameters: { type: 'object', properties: { conceptId: string }, required: ['conceptId'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const c = await resolve(client, argString(args, 'conceptId'))
      const implementers = (await client.relationships({ conceptId: c.id, type: 'implements' })).filter((r) => r.toId === c.id)
      const copied = c.statements.filter((s) => ['function', 'behavior', 'performance', 'constraint'].includes(s.kind))
      let result: { functionId: string; links: string[] } | undefined
      return proposal({
        title: `Convert ${c.key} ${c.name} to a Function`,
        explanation: `${c.key} names something to accomplish rather than a solution. The conversion creates a Function derived from revision ${c.revision}; ${implementers.length} implementing Concept(s) will perform it instead. Nothing is deleted.`,
        preview: [
          { label: 'New Function', proposed: c.name, targetId: c.id, basis: 'ai-hypothesis' },
          ...copied.map((s): ServiceProposalItem => ({ label: s.quantity ? 'Objective (copied)' : 'Statement (copied)', proposed: `${s.text}${s.quantity ? ` ${formatQuantity(s.quantity)}` : ''}`, basis: s.basis === 'ai-hypothesis' ? 'ai-hypothesis' : s.basis === 'assumption' ? 'assumption' : s.basis === 'estimate' ? 'estimate' : 'user-statement' })),
          ...implementers.map((r): ServiceProposalItem => ({ label: 'Implements → performs', proposed: `${r.fromId.slice(0, 8)} performs the new Function`, targetId: r.fromId, basis: 'ai-hypothesis' })),
        ],
        assumptions: ['The Concept, its relationships and history are kept unchanged; undo retires the Function and removes the new links.'],
        async apply(p) {
          const r = await client.convertToFunction(c.id, { expectedRevision: c.revision, reason: `Assistant proposal ${p.proposalId}`, provenance: assistantProvenance(p), idempotencyKey: `${p.conversationId}:${p.proposalId}:convert` })
          result = { functionId: r.function.id, links: [r.derivedLinkId, ...r.performsLinkIds] }
          return { summary: `Created ${r.function.key} ${r.function.name} from ${c.key} (${r.performsLinkIds.length} performs link(s))`, createdIds: [r.function.id, ...result.links] }
        },
        async undo() {
          if (!result) return { summary: 'Nothing to undo.' }
          for (const id of result.links) {
            const l = await client.designLink(id)
            if (!l.removed) await client.removeDesignLink(id, { expectedRevision: l.revision, reason: UNDO })
          }
          const f = await client.function(result.functionId)
          await client.updateFunction(f.id, { status: 'retired' }, { expectedRevision: f.revision, reason: UNDO })
          return { summary: `Retired ${f.key} and removed its links; ${c.key} is unchanged` }
        },
      })
    },
  },
  {
    name: 'conceptualize.create_constraint',
    label: 'Prepare a design constraint',
    description:
      'Prepare a PROPOSED design constraint on a Concept or Function (CON-…, FN-…), optionally with a bound (operator, value, unit). It is an AI hypothesis; a person activates it. To formalize a requirement, a person creates the constraint in Conceptualize. To turn a Concept constraint statement into a constraint, use promote_constraint.',
    parameters: {
      type: 'object',
      properties: { subjectId: string, statement: string, kind: { type: 'string', enum: ['qualitative', 'logical', 'mathematical', 'dimensional', 'interface'] }, operator: { type: 'string', enum: [...OPERATORS] }, value: { type: 'number' }, unit: string, symbol: string, strength: { type: 'string', enum: ['hard', 'soft', 'preference'] } },
      required: ['subjectId', 'statement'],
      additionalProperties: false,
    },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const subject = await resolveRef(client, argString(args, 'subjectId'), ['concept', 'function'])
      const statement = argString(args, 'statement')
      const quantity = quantityArg(args)
      const operator = (argOptionalString(args, 'operator') ?? (quantity ? '<=' : undefined)) as (typeof OPERATORS)[number] | undefined
      const symbol = argOptionalString(args, 'symbol')
      const kind = (argOptionalString(args, 'kind') ?? (quantity ? 'mathematical' : 'qualitative')) as ConstraintKind
      const strength = (argOptionalString(args, 'strength') ?? 'hard') as 'hard' | 'soft' | 'preference'
      const bound = quantity && operator ? { operator, quantity, ...(symbol ? { symbol } : {}) } : undefined
      let createdId: string | undefined
      return proposal({
        title: `Propose constraint on ${subject.key}`,
        explanation: `A ${strength} ${kind} constraint on ${subject.key} ${subject.label}, recorded as proposed. A person activates it after review.`,
        preview: [
          { label: 'Constraint (proposed)', proposed: statement, basis: 'ai-hypothesis', targetId: subject.ref.id },
          ...(bound ? [{ label: 'Bound', proposed: `${symbol ? `${symbol} ` : ''}${operator} ${formatQuantity(quantity)}`, basis: 'ai-hypothesis' as const }] : []),
        ],
        async apply(p) {
          const c = await client.createConstraint({ kind, statement, ...(bound ? { bound } : {}), strength, status: 'proposed', source: { kind: 'stated' }, subjects: [subject.ref], reason: `Assistant proposal ${p.proposalId}` }, { provenance: assistantProvenance(p), idempotencyKey: `${p.conversationId}:${p.proposalId}:constraint` })
          createdId = c.id
          return { summary: `Proposed ${c.key} on ${subject.key}`, createdIds: [c.id] }
        },
        async undo() {
          if (!createdId) return { summary: 'Nothing to undo.' }
          const c = await client.constraint(createdId)
          await client.changeConstraintStatus(c.id, 'retired', { expectedRevision: c.revision, reason: UNDO })
          return { summary: `Retired ${c.key} (kept in the history)` }
        },
      })
    },
  },
  {
    name: 'conceptualize.promote_constraint',
    label: 'Prepare a statement promotion',
    description: 'Prepare the promotion of a quantified constraint statement of a Concept (CON-…) into a design constraint. The statement stays unchanged; the constraint keeps the statement’s basis. Without statementText, promotes every quantified constraint statement not yet promoted.',
    parameters: { type: 'object', properties: { conceptId: string, statementText: string }, required: ['conceptId'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const c = await resolve(client, argString(args, 'conceptId'))
      const text = argOptionalString(args, 'statementText')?.toLowerCase()
      const existing = await client.constraints({ subjectId: c.id })
      const statements = c.statements.filter((s) => s.kind === 'constraint' && s.quantity && !existing.some((x) => x.origin?.statementId === s.id) && (!text || s.text.toLowerCase().includes(text)))
      if (!statements.length) throw new ActionError('no-op', `${c.key} has no quantified constraint statement${text ? ` matching “${text}”` : ''} that is not yet a constraint.`)
      const created: string[] = []
      return proposal({
        title: `Promote ${statements.length} statement(s) of ${c.key} to constraints`,
        explanation: 'Each constraint statement with a quantity becomes a design constraint (operator from min/max). The statements stay as they are.',
        preview: statements.map((s): ServiceProposalItem => ({ label: 'Constraint from statement', proposed: `${s.text} ${formatQuantity(s.quantity)}`, targetId: c.id, basis: s.basis === 'ai-hypothesis' ? 'ai-hypothesis' : s.basis === 'assumption' ? 'assumption' : s.basis === 'estimate' ? 'estimate' : 'user-statement' })),
        async apply(p) {
          for (const [i, s] of statements.entries()) {
            const x = await client.promoteStatement(c.id, { statementId: s.id, reason: `Assistant proposal ${p.proposalId}` }, { provenance: assistantProvenance(p), idempotencyKey: `${p.conversationId}:${p.proposalId}:promote:${i}` })
            created.push(x.id)
          }
          return { summary: `Created ${created.length} constraint(s) from ${c.key}`, createdIds: [...created] }
        },
        async undo() {
          for (const id of created) {
            const x = await client.constraint(id)
            if (x.status !== 'retired') await client.changeConstraintStatus(id, 'retired', { expectedRevision: x.revision, reason: UNDO })
          }
          return { summary: `Retired ${created.length} constraint(s); the statements are unchanged` }
        },
      })
    },
  },
  {
    name: 'conceptualize.record_assumption',
    label: 'Prepare an assumption',
    description: 'Prepare an Assumption (optionally with a value and unit) scoped to a Concept, Function or Constraint (CON-…, FN-…, CST-…). It is recorded as an AI hypothesis and unvalidated; a person validates it with evidence.',
    parameters: { type: 'object', properties: { statement: string, subjectId: string, value: { type: 'number' }, unit: string, applicability: string }, required: ['statement'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const statement = argString(args, 'statement')
      const subjectArg = argOptionalString(args, 'subjectId')
      const subject = subjectArg ? await resolveRef(client, subjectArg, ['concept', 'function', 'constraint']) : undefined
      const quantity = quantityArg(args)
      const applicability = argOptionalString(args, 'applicability')
      let createdId: string | undefined
      return proposal({
        title: `Record assumption${subject ? ` for ${subject.key}` : ''}`,
        explanation: 'Recorded as unvalidated with basis AI hypothesis. Decisions that rest on it can be flagged for review if it is later invalidated.',
        preview: [
          { label: 'Assumption', proposed: `${statement}${quantity ? ` (${formatQuantity(quantity)})` : ''}`, basis: 'ai-hypothesis', ...(subject ? { targetId: subject.ref.id } : {}) },
          ...(applicability ? [{ label: 'Applies when', proposed: applicability, basis: 'ai-hypothesis' as const }] : []),
        ],
        async apply(p) {
          const a = await client.createAssumption({ statement, ...(quantity ? { quantity } : {}), scope: { subjects: subject ? [subject.ref] : [], ...(applicability ? { applicability } : {}) }, reason: `Assistant proposal ${p.proposalId}` }, { provenance: assistantProvenance(p), idempotencyKey: `${p.conversationId}:${p.proposalId}:assumption` })
          createdId = a.id
          return { summary: `Recorded ${a.key} (unvalidated)`, createdIds: [a.id] }
        },
        async undo() {
          if (!createdId) return { summary: 'Nothing to undo.' }
          const a = await client.assumption(createdId)
          // The assistant may only propose a review; retiring is the user's own undo action here.
          await client.changeAssumptionValidation(a.id, 'retired', { expectedRevision: a.revision, reason: UNDO })
          return { summary: `Retired ${a.key} (kept in the history)` }
        },
      })
    },
  },
  {
    name: 'conceptualize.create_link',
    label: 'Prepare a design link',
    description:
      'Prepare a typed design link between two Conceptualize records by key (e.g. CON-006 performs FN-001, CON-001 depends-on ASM-002, CST-001 constrains FN-001). The type must be registered and allow these endpoints; links the assistant may not assert (verified-by, formalizes and similar) are refused. Recorded as an AI hypothesis.',
    parameters: { type: 'object', properties: { type: string, from: string, to: string, note: string }, required: ['type', 'from', 'to'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const type = argString(args, 'type')
      const lt = (await client.linkTypes()).find((t) => t.name === type)
      if (!lt || lt.stored !== 'design-links') throw new ActionError('invalid-arguments', `${type} is not a design link type (see the link types in Conceptualize).`)
      if (!lt.assistantAssertable) throw new ActionError('not-allowed', `The assistant cannot assert ${type} links; a person records them.`)
      const from = await resolveRef(client, argString(args, 'from'))
      const to = await resolveRef(client, argString(args, 'to'))
      if (!lt.fromTypes.includes(from.ref.type) || !lt.toTypes.includes(to.ref.type)) throw new ActionError('invalid-arguments', `${type} links ${lt.fromTypes.join('/')} to ${lt.toTypes.join('/')}; ${from.key} → ${to.key} does not fit.`)
      const note = argOptionalString(args, 'note')
      let createdId: string | undefined
      return proposal({
        title: `Link ${from.key} ${lt.label} ${to.key}`,
        explanation: `${lt.description || lt.label}. Recorded as an AI hypothesis.`,
        preview: [{ label: 'Design link', proposed: `${from.key} ${from.label} — ${lt.label} → ${to.key} ${to.label}`, targetId: from.ref.id, basis: 'ai-hypothesis' }, ...(note ? [{ label: 'Note', proposed: note, basis: 'ai-hypothesis' as const }] : [])],
        async apply(p) {
          const l = await client.createDesignLink({ type, from: from.ref, to: to.ref as DesignRef, ...(note ? { note } : {}), reason: `Assistant proposal ${p.proposalId}` }, { provenance: assistantProvenance(p), idempotencyKey: `${p.conversationId}:${p.proposalId}:link` })
          createdId = l.id
          return { summary: `Linked ${from.key} ${lt.label} ${to.key}`, createdIds: [l.id] }
        },
        async undo() {
          if (!createdId) return { summary: 'Nothing to undo.' }
          const l = await client.designLink(createdId)
          if (!l.removed) await client.removeDesignLink(l.id, { expectedRevision: l.revision, reason: UNDO })
          return { summary: 'Removed the link (kept in the history)' }
        },
      })
    },
  },
  {
    name: 'conceptualize.rationale',
    label: 'Explain a decision',
    description: 'Assemble the rationale of a design decision (DEC-…): alternatives and outcomes, supporting evidence with review status, assumptions and constraints with pinned and current revisions, trade study, invalidation conditions and validity. Deterministic, no model.',
    parameters: { type: 'object', properties: { decisionId: string }, required: ['decisionId'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const d = await resolveRef(client, argString(args, 'decisionId'), ['decision'])
      const r = await client.rationale(d.ref.id)
      return {
        kind: 'data',
        data: { decision: `${d.key} ${d.label}`, question: r.question, validity: r.validity, alternatives: r.alternatives, support: r.support, assumptions: r.assumptions, constraints: r.constraints, tradeStudy: r.tradeStudy, invalidationConditions: r.invalidationConditions, stale: r.stale, supersedes: r.supersedes, supersededBy: r.supersededBy },
        summary: `Rationale of ${d.key}: ${r.validity}${r.stale.length ? `, ${r.stale.length} stale pin(s)` : ''}`,
        inspected: [{ id: d.key, detail: 'decision, evidence, assumptions, constraints' }],
      }
    },
  },
  {
    name: 'conceptualize.traverse',
    label: 'Follow design links',
    description: 'Follow typed links from a record (CON-…, FN-…, CST-…, ASM-…, DEC-…, EVD-…) up to a depth, optionally only some link types (e.g. performs, decomposes-into, constrains, depends-on). Answers questions such as “which Concepts perform FN-001” or “what rests on ASM-002”.',
    parameters: { type: 'object', properties: { start: string, follow: { type: 'array', items: string, maxItems: 20 }, depth: { type: 'integer', minimum: 1, maximum: 4 } }, required: ['start'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const start = await resolveRef(client, argString(args, 'start'))
      const follow = (Array.isArray(args.follow) ? args.follow : []).map((t) => ({ type: String(t), direction: 'both' as const }))
      const depth = typeof args.depth === 'number' ? args.depth : 2
      const r = await client.traverse({ start: [start.ref], ...(follow.length ? { follow } : {}), maxDepth: depth, limit: 200 })
      const label = new Map(r.nodes.map((n) => [n.ref.id, `${n.key} ${n.label}`]))
      return {
        kind: 'data',
        data: { start: `${start.key} ${start.label}`, nodes: r.nodes.map((n) => ({ key: n.key, label: n.label, type: n.type, status: n.status })), links: r.edges.map((e) => ({ type: e.type, from: label.get(e.from.id) ?? e.from.id, to: label.get(e.to.id) ?? e.to.id, basis: e.basis, stored: e.stored })), truncated: r.truncated },
        summary: `Followed ${r.edges.length} link(s) from ${start.key} (${r.nodes.length} record(s))`,
        inspected: [{ id: start.key, detail: `depth ${depth}` }],
      }
    },
  },
  {
    name: 'conceptualize.search_design',
    label: 'Search design knowledge',
    description: 'Full-text search across Concepts, Functions, Constraints, Assumptions, Decisions and Evidence, optionally limited to some types.',
    parameters: { type: 'object', properties: { text: string, types: { type: 'array', items: { type: 'string', enum: ['concept', 'function', 'constraint', 'assumption', 'decision', 'evidence'] } } }, required: ['text'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const text = argString(args, 'text')
      const types = Array.isArray(args.types) ? (args.types.map(String) as DesignEntityType[]) : undefined
      const r = await client.search(text, types, 30)
      return { kind: 'data', data: { total: r.total, items: r.items.map((i) => ({ key: i.key, type: i.ref.type, label: i.label, status: i.status, snippet: i.snippet })) }, summary: `Found ${r.total} record(s) for “${text}”`, inspected: r.items.slice(0, 10).map((i) => ({ id: i.key, detail: i.ref.type })) }
    },
  },
]

const KEYS = /\b((?:CON|FN|CST|ASM|DEC|EVD)-\d{3,})\b/gi
const keysIn = (t: string) => [...t.matchAll(KEYS)].map((m) => m[1].toUpperCase())

/** DEMO ONLY: example prompts for the design-knowledge operations (no model provider). */
export const designDemo: DemoPlanner = (text) => {
  const t = text.trim()
  const note = '\n\nScripted demo assistant: no language model is connected; what I prepare is labelled as AI hypotheses.'
  let m: RegExpExecArray | null
  if ((m = /\bconvert\s+(CON-\d{3,})\s+(?:in)?to\s+(?:a\s+)?function\b/i.exec(t))) {
    return { reply: `I prepared the conversion of ${m[1].toUpperCase()} into a Function. The Concept is kept as history; implementing Concepts will perform the Function.${note}`, calls: [{ name: 'conceptualize.convert_to_function', arguments: { conceptId: m[1].toUpperCase() } }] }
  }
  if ((m = /\b(?:create|add|new)\s+(?:a\s+)?function\s+(?:called\s+|named\s+)?["“]?([^"”]+?)["”]?(?:\s+(?:performed|done)\s+by\s+(.+))?$/i.exec(t))) {
    const performedBy = keysIn(m[2] ?? '').filter((k) => k.startsWith('CON-'))
    return { reply: `I prepared a Function “${m[1].trim()}”${performedBy.length ? ` performed by ${performedBy.join(', ')}` : ''}.${note}`, calls: [{ name: 'conceptualize.create_function', arguments: { name: m[1].trim(), ...(performedBy.length ? { performedBy } : {}) } }] }
  }
  if ((m = /\bpromote\b.*?(CON-\d{3,})/i.exec(t)) && /constraint/i.test(t)) {
    return { reply: `I prepared constraints from the quantified constraint statements of ${m[1].toUpperCase()}.${note}`, calls: [{ name: 'conceptualize.promote_constraint', arguments: { conceptId: m[1].toUpperCase() } }] }
  }
  if ((m = /\b(?:record|add|note)\s+(?:an?\s+)?assumption\s*(?:for|on)?\s*((?:CON|FN|CST)-\d{3,})?\s*:?\s*(.+)$/i.exec(t)) && m[2].trim().length > 3) {
    return { reply: `I prepared an assumption${m[1] ? ` for ${m[1].toUpperCase()}` : ''}. It stays unvalidated until someone validates it with evidence.${note}`, calls: [{ name: 'conceptualize.record_assumption', arguments: { statement: m[2].trim(), ...(m[1] ? { subjectId: m[1].toUpperCase() } : {}) } }] }
  }
  if ((m = /\b((?:CON|FN|CST|ASM)-\d{3,})\s+(performs|depends-on|depends on|constrains|interfaces-with|interfaces with|derived-from|derived from|supported-by|supported by)\s+((?:CON|FN|CST|ASM|EVD)-\d{3,})\b/i.exec(t))) {
    const type = m[2].toLowerCase().replace(/\s+/g, '-')
    return { reply: `I prepared a ${type} link from ${m[1].toUpperCase()} to ${m[3].toUpperCase()}.${note}`, calls: [{ name: 'conceptualize.create_link', arguments: { type, from: m[1].toUpperCase(), to: m[3].toUpperCase() } }] }
  }
  if ((m = /\b(?:why|rationale|explain)\b.*?(DEC-\d{3,})/i.exec(t))) {
    return { reply: `Here is what ${m[1].toUpperCase()} rests on, assembled from the records (no model involved).${note}`, calls: [{ name: 'conceptualize.rationale', arguments: { decisionId: m[1].toUpperCase() } }] }
  }
  if ((m = /\b(?:what|which)\b.*?\b(performs?|depends on|rests on|constrains|decomposes)\b.*?((?:CON|FN|CST|ASM|DEC|EVD)-\d{3,})/i.exec(t))) {
    return { reply: `I followed the design links from ${m[2].toUpperCase()}.${note}`, calls: [{ name: 'conceptualize.traverse', arguments: { start: m[2].toUpperCase(), depth: 2 } }] }
  }
  if ((m = /\bsearch\s+(?:design|functions?|constraints?|assumptions?)\s+(?:for\s+)?(.+)$/i.exec(t))) {
    const types = /function/i.test(t) ? ['function'] : /constraint/i.test(t) ? ['constraint'] : /assumption/i.test(t) ? ['assumption'] : undefined
    return { reply: `Design records matching “${m[1].trim()}”.${note}`, calls: [{ name: 'conceptualize.search_design', arguments: { text: m[1].trim(), ...(types ? { types } : {}) } }] }
  }
  return null
}
