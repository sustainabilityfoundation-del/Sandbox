import { ActionError, argString, type AssistantActionDefinition, type AssistantContribution, type DemoPlanner, type ServiceProposalItem } from '@ews/platform-sdk'
import { draftConcept, referencePortsFor, isLegacyTwinReference, isRealModuleReference, referenceKind, scopedId } from '@ews/conceptualize-client'
import type { ArtifactModule } from '@ews/platform-sdk'
import { registeredReferencePorts } from './references'
import { designActions, designDemo } from './assistantDesign'
import { visualActions } from './assistantVisual'
import { intentActions } from './assistantIntent'
import { architectureActions } from './assistantArchitecture'
import { assistantProvenance, connection, constraintBindingRef, optString, proposal, resolve, string, UUID } from './assistantShared'
import { generateExploration } from './ai/generator'
import { demoAlternativesArguments, developAlternatives, modelStatements, statementsSchema } from './assistantAlternatives'
import { formatQuantity, KIND_LABEL } from './domain'

/**
 * Assistant operations for Conceptualize (`concepts.*`). Reads return data; every change is a
 * ServiceProposal: the platform shows the preview (with the basis of each item) and calls `apply`
 * only when the user chooses Apply. `apply` uses the Conceptualize API with an idempotency key and the
 * conversation/proposal provenance, so the server records who asked for what and refuses to record
 * AI output as user assertions, verified evidence or approved decisions. `undo` is a compensating
 * change (archive, withdraw, unlink), never a deletion.
 */

const bad = (message: string): never => {
  throw new ActionError('invalid-arguments', message)
}

const conceptActions: AssistantActionDefinition[] = [
  {
    name: 'conceptualize.search',
    label: 'Search Concepts',
    description: 'Search Concepts by words in key, name, summary or description. Returns keys, names, maturity and counts of open questions and unconfirmed AI hypotheses.',
    parameters: { type: 'object', properties: { text: string }, required: ['text'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const text = argString(args, 'text')
      const page = await client.list({ text, limit: 20 })
      return {
        kind: 'data',
        data: { total: page.total, concepts: page.items.map((c) => ({ key: c.key, id: c.id, name: c.name, summary: c.summary, maturity: c.maturity, implementationStatus: c.implementationStatus, openQuestions: c.openQuestions, unconfirmedHypotheses: c.unconfirmedHypotheses })) },
        summary: `Found ${page.total} Concept(s) for “${text}”`,
        inspected: page.items.map((c) => ({ id: c.key, detail: `rev ${c.revision}` })),
      }
    },
  },
  {
    name: 'conceptualize.read',
    label: 'Read Concept',
    description: 'Read one Concept: intent statements with their basis, relationships, implementations, its design constraints (id, key, revision, bound and the CAD binding reference) and the maturity assessment.',
    parameters: { type: 'object', properties: { conceptId: string }, required: ['conceptId'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const c = await resolve(client, argString(args, 'conceptId'))
      const [relationships, implementations, assessment, constraints] = await Promise.all([client.relationships({ conceptId: c.id }), client.implementations(c.id), client.assessment(c.id), client.constraints({ subjectId: c.id })])
      return {
        kind: 'data',
        data: {
          concept: { key: c.key, name: c.name, description: c.description, purpose: c.purpose, maturity: c.maturity, revision: c.revision, statements: c.statements.map((s) => ({ kind: s.kind, text: s.text, quantity: s.quantity, basis: s.basis, state: s.state })) },
          relationships: relationships.map((r) => ({ type: r.type, from: r.fromId, to: r.toId })),
          implementations: implementations.map((i) => ({ key: i.key, name: i.name, status: i.status, artifacts: i.artifacts.filter((a) => !a.removed).map((a) => `${a.module}:${a.artifactId}${a.revision ? `@${a.revision}` : ''}`) })),
          assessment: { completeness: assessment.completeness, suggestedMaturity: assessment.suggestedMaturity, nextSteps: assessment.nextSteps.map((s) => s.text) },
          // CR-AI-9: constraints with their UUID, revision and the binding reference other modules (CAD) use.
          constraints: constraints.filter((x) => x.status !== 'retired').map((x) => ({ id: x.id, key: x.key, revision: x.revision, statement: x.statement, bound: x.bound, strength: x.strength, status: x.status, bindingRef: constraintBindingRef(x) })),
        },
        summary: `Read ${c.key} ${c.name} (rev ${c.revision})`,
        inspected: [{ id: c.key, detail: `statements, relationships, implementations (rev ${c.revision})` }],
      }
    },
  },
  {
    name: 'conceptualize.create',
    label: 'Prepare a new Concept',
    description:
      'Prepare a new Concept. text is the user’s description, kept verbatim. YOU give the name, optionally a summary and the statements you read from the description (kind, text, quantity with unit, basis); they are recorded exactly as you write them, as AI hypotheses (or assumption, estimate). Nothing is interpreted by this operation. Optionally as a child of another Concept (parentId).',
    parameters: { type: 'object', properties: { text: string, name: string, summary: string, statements: statementsSchema, parentId: string }, required: ['text', 'name'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const text = argString(args, 'text')
      // CR-AI-1: the caller writes name and statements; no scripted interpretation reaches a model's request.
      const name = optString(args, 'name') ?? bad('Give the Concept a name (name), and the statements you read from the description (statements: [{ kind, text, quantity?, basis? }]).')
      const statements = modelStatements(args.statements, 'statements')
      const summary = optString(args, 'summary')
      const parentArg = optString(args, 'parentId')
      const parent = parentArg ? await resolve(client, parentArg) : undefined
      const d = { name, description: text, statements, ...(summary ? { summary } : {}) }
      let createdId: string | undefined
      return proposal({
        title: `Create Concept “${d.name}”`,
        explanation: `Your description is kept verbatim${parent ? `; the Concept is part of ${parent.key}` : ''}. Saved as maturity “idea”; the statements stay AI hypotheses (or their stated basis) until you confirm them.`,
        preview: [
          { label: 'New Concept', proposed: d.name, basis: 'ai-hypothesis' },
          { label: 'Description (your words, verbatim)', proposed: d.description, basis: 'user-statement' },
          ...(parent ? [{ label: 'Part of', proposed: `${parent.key} ${parent.name}`, targetId: parent.id }] : []),
          ...d.statements.map((s): ServiceProposalItem => ({ label: KIND_LABEL[s.kind], proposed: `${s.text}${s.quantity ? ` ${formatQuantity(s.quantity)}` : ''}`, basis: (s.basis ?? 'ai-hypothesis') as 'ai-hypothesis' | 'assumption' | 'estimate' })),
        ],
        assumptions: ['The name and statements are the assistant’s reading of your description; check names, quantities and units.'],
        async apply(p) {
          const c = await client.createConcept(
            { ...d, maturity: 'idea', parentId: parent?.id, reason: `Assistant proposal ${p.proposalId}` },
            { provenance: assistantProvenance(p), idempotencyKey: `${p.conversationId}:${p.proposalId}:create` },
          )
          createdId = c.id
          return { summary: `Created ${c.key} ${c.name}`, createdIds: [c.id] }
        },
        async undo() {
          if (!createdId) return { summary: 'Nothing to undo.' }
          const c = await client.concept(createdId)
          await client.changeMaturity(c.id, 'archived', { expectedRevision: c.revision, reason: 'Undo of an assistant proposal (compensating change)' })
          return { summary: `Archived ${c.key} (kept in the history)` }
        },
      })
    },
  },
  developAlternatives,
  {
    name: 'conceptualize.decompose',
    label: 'Prepare a decomposition',
    description: 'Prepare child Concepts (functions or parts) of a Concept, linked with contains. Children may later be shared by other parents.',
    parameters: { type: 'object', properties: { conceptId: string, children: { type: 'array', items: string, minItems: 1, maxItems: 20 } }, required: ['conceptId', 'children'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const parent = await resolve(client, argString(args, 'conceptId'))
      const children = (Array.isArray(args.children) ? args.children : []).map((c) => String(c).trim()).filter(Boolean)
      if (!children.length) throw new ActionError('invalid-arguments', 'Name at least one child Concept.')
      const created: string[] = []
      return proposal({
        title: `Decompose ${parent.key} ${parent.name}`,
        explanation: `Adds ${children.length} child Concept(s) to ${parent.key}. Concept decomposition need not match the CAD or SysML structure.`,
        preview: children.map((c) => ({ label: 'New child Concept', proposed: c, basis: 'ai-hypothesis', current: undefined })),
        async apply(p) {
          for (const [i, name] of children.entries()) {
            const c = await client.createConcept({ name, abstraction: 'function', parentId: parent.id, maturity: 'idea', statements: [{ kind: 'function', text: name, basis: 'ai-hypothesis' }], reason: `Assistant proposal ${p.proposalId}` }, { provenance: assistantProvenance(p), idempotencyKey: `${p.conversationId}:${p.proposalId}:child:${i}` })
            created.push(c.id)
          }
          return { summary: `Added ${created.length} child Concept(s) to ${parent.key}`, createdIds: [...created] }
        },
        async undo() {
          for (const id of created) {
            const c = await client.concept(id)
            await client.changeMaturity(id, 'archived', { expectedRevision: c.revision, reason: 'Undo of an assistant proposal' })
          }
          return { summary: `Archived ${created.length} child Concept(s)` }
        },
      })
    },
  },
  {
    name: 'conceptualize.compare',
    label: 'Compare alternatives',
    description: 'Compare the alternatives of a Concept (as parent or member of an alternative set): trade-study scores, weighted results with uncertainty ranges, coverage and recorded decisions.',
    parameters: { type: 'object', properties: { conceptId: string }, required: ['conceptId'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const c = await resolve(client, argString(args, 'conceptId'))
      const sets = await client.alternativeSets(c.id)
      if (!sets.length) throw new ActionError('not-found', `${c.key} has no alternatives yet.`)
      const out = []
      for (const s of sets) {
        const names = new Map((await Promise.all(s.members.map((m) => client.concept(m.conceptId)))).map((x) => [x.id, `${x.key} ${x.name}`]))
        const studies = await client.tradeStudies({ setId: s.id })
        out.push({
          set: `${s.key} ${s.name}`,
          alternatives: s.members.map((m) => ({ concept: names.get(m.conceptId), status: m.status })),
          tradeStudies: studies.map((t) => ({ title: t.title, preliminary: t.result.preliminary, ranking: t.result.ranking, results: t.result.options.map((o) => ({ concept: names.get(o.conceptId), score: o.score, range: [o.low, o.high], coverage: o.coverage, rank: o.rank })) })),
        })
      }
      return { kind: 'data', data: { comparisons: out, note: 'Scores are preliminary unless every score is verified evidence.' }, summary: `Compared ${sets.length} alternative set(s) of ${c.key}`, inspected: sets.map((s) => ({ id: s.key, detail: 'members, trade studies' })) }
    },
  },
  {
    name: 'conceptualize.propose_decision',
    label: 'Prepare a design decision',
    description: 'Prepare a PROPOSED decision to pursue one alternative (others deferred) with a rationale. A reviewer records it in Conceptualize; the assistant cannot record decisions.',
    parameters: { type: 'object', properties: { conceptId: string, rationale: string }, required: ['conceptId'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const chosen = await resolve(client, argString(args, 'conceptId'))
      const sets = (await client.alternativeSets(chosen.id)).filter((s) => s.members.some((m) => m.conceptId === chosen.id))
      if (!sets.length) throw new ActionError('invalid-arguments', `${chosen.key} is not an alternative in any set.`)
      const set = sets[0]
      const rationale = optString(args, 'rationale') ?? `Proposed in the conversation: pursue ${chosen.name}.`
      let decisionId: string | undefined
      return proposal({
        title: `Propose: pursue ${chosen.key} ${chosen.name}`,
        explanation: `Creates a proposed decision on ${set.key} ${set.name}: ${chosen.key} accepted, the other alternatives deferred. It takes effect only when a reviewer records it.`,
        preview: [
          { label: 'Accepted (proposed)', proposed: `${chosen.key} ${chosen.name}`, basis: 'ai-hypothesis', targetId: chosen.id },
          ...set.members.filter((m) => m.conceptId !== chosen.id && m.status !== 'withdrawn').map((m) => ({ label: 'Deferred (proposed)', proposed: m.conceptId, basis: 'ai-hypothesis' as const, targetId: m.conceptId })),
          { label: 'Rationale', proposed: rationale, basis: 'ai-hypothesis' },
        ],
        assumptions: ['Recording the decision (approval gate) is a reviewer action in Conceptualize.'],
        async apply(p) {
          const d = await client.createDecision(
            { title: `Pursue ${chosen.name}`, rationale, setId: set.id, question: set.question, outcomes: set.members.filter((m) => m.status !== 'withdrawn').map((m) => ({ conceptId: m.conceptId, outcome: m.conceptId === chosen.id ? 'accepted' : 'deferred' })) },
            { provenance: assistantProvenance(p), idempotencyKey: `${p.conversationId}:${p.proposalId}:decision` },
          )
          decisionId = d.id
          return { summary: `Proposed ${d.key} (waiting for a reviewer)`, createdIds: [d.id] }
        },
        async undo() {
          if (!decisionId) return { summary: 'Nothing to undo.' }
          const d = await client.decision(decisionId)
          await client.withdrawDecision(d.id, { expectedRevision: d.recordVersion, reason: 'Undo of an assistant proposal' })
          return { summary: `Withdrew ${d.key}` }
        },
      })
    },
  },
  {
    name: 'conceptualize.link_artifact',
    label: 'Prepare an implementation link',
    description:
      'Prepare a ConceptImplementation linking a Concept to an artifact of another module: a System Model element (<projectId>/<elementId>, revision = commit number), a CAD entity (<documentUuid>/<entityId>, revision = document revision), a Project Management product element (UUID) or project document (UUID, module projects), an analysis result (test adapter) or an external document. The reference is checked through the owning module and pinned to the given or current revision. Twin objects (SYS-…, CAD-…, ROD-…) are only the PRJ-ACT100 demo.',
    parameters: { type: 'object', properties: { conceptId: string, artifactId: string, module: { type: 'string', enum: ['sysml', 'cad', 'product', 'projects', 'twin', 'analysis', 'external'] }, revision: { type: 'integer', minimum: 1 } }, required: ['conceptId', 'artifactId'], additionalProperties: false },
    async run(args, ctx) {
      const { client, projectId } = connection(ctx)
      const c = await resolve(client, argString(args, 'conceptId'))
      const artifactId = argString(args, 'artifactId')
      const given = optString(args, 'module') as ArtifactModule | undefined
      const scoped = scopedId(artifactId)
      const module: ArtifactModule =
        given ?? (scoped ? (UUID.test(scoped.container) ? 'cad' : 'sysml') : UUID.test(artifactId) ? 'product' : artifactId.startsWith('CAD-') ? 'cad' : artifactId.startsWith('SYS-') ? 'sysml' : /^https?:/.test(artifactId) ? 'external' : 'twin')
      const target = { module, id: artifactId, kind: referenceKind({ module, id: artifactId }) ?? (module === 'projects' ? 'document' : undefined) }
      const pinned = typeof args.revision === 'number' ? args.revision : undefined
      let object: { id: string; name: string; type: string; revision: number } | undefined
      let resolved: { label: string; latest?: number; via: string; adapter: boolean } | undefined
      const notes: string[] = []
      if (isRealModuleReference(target)) {
        const port = referencePortsFor(ctx.services ?? {}, registeredReferencePorts()).find((p) => p.supports(target))
        if (port) {
          const r = await port.resolve(projectId, target)
          if (r.state === 'missing') throw new ActionError('not-found', `${artifactId} was not found: ${r.detail ?? 'the owning module does not have it'}`)
          if (r.state === 'found') resolved = { label: r.label ?? artifactId, latest: r.latest, via: port.name, adapter: port.adapter }
          else notes.push(`Module unavailable, not checked: ${r.detail ?? 'the owning module is not available'}. The reference is kept.`)
          if (port.adapter) notes.push(`Checked through ${port.name}.`)
        } else notes.push(`Module unavailable: no read client for ${target.kind} references in this host. The reference is kept.`)
      } else if (isLegacyTwinReference(target)) {
        if (projectId !== 'PRJ-ACT100') throw new ActionError('invalid-arguments', `${artifactId} is a twin object of the illustrative tools (PRJ-ACT100 demo). Reference a System Model element as <projectId>/<elementId>, a CAD entity as <documentUuid>/<entityId> or a product element by UUID.`)
        object = ctx.model.get(artifactId)
        if (!object) throw new ActionError('not-found', `${artifactId} is not in the demo twin.`)
        notes.push('Demo: a twin object of the illustrative SysML or mock CAD tool (PRJ-ACT100), not the SysML or CAD.')
      }
      const revision = pinned ?? object?.revision ?? resolved?.latest
      const name = object?.name ?? resolved?.label ?? artifactId
      let implementationId: string | undefined
      return proposal({
        title: `Link ${c.key} to ${artifactId}`,
        explanation: `Creates an implementation of ${c.key} that references ${artifactId}${name !== artifactId ? ` (${name}${revision ? `, revision ${revision}` : ''})` : ''}. The Concept’s identity does not change if this implementation is replaced later.`,
        preview: [
          { label: 'New implementation', proposed: `${c.name} realized by ${name}`, targetId: c.id },
          { label: 'Artifact reference', proposed: `${module}${target.kind ? ` (${target.kind})` : ''}:${artifactId}${revision ? ` pinned at revision ${revision}` : ' following the latest revision'}` },
        ],
        ...(module === 'analysis' || notes.length ? { assumptions: [...(module === 'analysis' ? ['Analysis references come from a labelled test adapter: no Analysis module exists.'] : []), ...notes] } : {}),
        inspected: object ? [{ id: object.id, detail: `revision ${object.revision} (demo twin)` }] : resolved ? [{ id: artifactId, detail: `${resolved.via}${resolved.latest ? `, revision ${resolved.latest}` : ''}` }] : [],
        async apply(p) {
          const impl = await client.createImplementation(
            { name: `${c.name}: ${name}`, conceptIds: [c.id], artifacts: [{ module, id: artifactId, ...(revision ? { revision } : {}), ...(object ? { kind: object.type, label: `${object.id} ${object.name} (demo twin)` } : { ...(target.kind ? { kind: target.kind } : {}), label: name }) }], reason: `Assistant proposal ${p.proposalId}` },
            { provenance: assistantProvenance(p), idempotencyKey: `${p.conversationId}:${p.proposalId}:link` },
          )
          implementationId = impl.id
          return { summary: `Created ${impl.key} linking ${c.key} to ${artifactId}`, createdIds: [impl.id] }
        },
        async undo() {
          if (!implementationId) return { summary: 'Nothing to undo.' }
          const impl = await client.implementation(implementationId)
          await client.updateImplementation(impl.id, { status: 'retired', reason: 'Undo of an assistant proposal' }, { expectedRevision: impl.revision })
          return { summary: `Retired ${impl.key} (kept in the history)` }
        },
      })
    },
  },
  {
    name: 'conceptualize.propose_requirement',
    label: 'Prepare draft requirements',
    description: 'Prepare DRAFT requirements in Requirements for the quantified constraints of a Concept, linked to it with “proposes”. Approval stays in Requirements; nothing is approved here.',
    parameters: { type: 'object', properties: { conceptId: string }, required: ['conceptId'], additionalProperties: false },
    async run(args, ctx) {
      const { client, projectId } = connection(ctx)
      const requirements = ctx.services?.requirements
      if (!requirements || requirements.mode !== 'api') throw new ActionError('not-available', 'The Requirements service (API mode) is needed to create draft requirements.')
      const c = await resolve(client, argString(args, 'conceptId'))
      const constraints = c.statements.filter((s) => (s.kind === 'constraint' || s.kind === 'performance') && s.quantity)
      if (!constraints.length) throw new ActionError('no-op', `${c.key} has no quantified constraints to turn into requirements.`)
      const drafts = constraints.map((s) => ({ title: `${c.name}: ${s.text}`.slice(0, 200), statement: `The ${c.name.toLowerCase()} shall meet ${s.text.toLowerCase()} ${formatQuantity(s.quantity)}.`, statementId: s.id }))
      const links: string[] = []
      return proposal({
        title: `Propose ${drafts.length} draft requirement(s) for ${c.key}`,
        explanation: 'Creates draft requirements in Requirements (status draft) and links them to the Concept with “proposes”. Review and approval happen in Requirements.',
        preview: drafts.map((d) => ({ label: 'Draft requirement', proposed: d.statement, basis: 'ai-hypothesis' })),
        assumptions: ['Requirement wording is generated from the Concept’s statements; edit it in Requirements before review.'],
        async apply(p) {
          for (const [i, d] of drafts.entries()) {
            const r = await requirements.create({ projectId, title: d.title, statement: d.statement, type: 'performance', rationale: `Proposed from ${c.key} (assistant proposal ${p.proposalId})` }, { idempotencyKey: `${p.conversationId}:${p.proposalId}:req:${i}`, reason: `Proposed from Conceptualize ${c.key}` })
            const l = await client.createLink(c.id, { relation: 'proposes', artifact: { module: 'requirements', id: r.id, revision: r.revision, kind: 'requirement', label: `${r.key} ${r.title}` } }, { provenance: assistantProvenance(p), idempotencyKey: `${p.conversationId}:${p.proposalId}:link:${i}` })
            links.push(l.id)
          }
          return { summary: `Created ${drafts.length} draft requirement(s) and linked them to ${c.key}`, createdIds: [...links] }
        },
        async undo() {
          for (const id of links) await client.removeLink(id, { reason: 'Undo of an assistant proposal' })
          return { summary: 'Removed the links. The draft requirements stay in Requirements (retire them there if not needed).' }
        },
      })
    },
  },
  {
    name: 'conceptualize.request_realization',
    label: 'Prepare a CAD realization request',
    description: 'Record a request for CAD (or SysML) to realize a Concept. No CAD generation API exists: the request is recorded on an implementation and stays pending until the CAD module offers one.',
    parameters: { type: 'object', properties: { conceptId: string, targetModule: { type: 'string', enum: ['cad', 'sysml'] }, description: string }, required: ['conceptId'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const c = await resolve(client, argString(args, 'conceptId'))
      const target = (optString(args, 'targetModule') ?? 'cad') as 'cad' | 'sysml'
      const description = optString(args, 'description') ?? `Generate ${target === 'cad' ? 'geometry' : 'a SysML structure'} realizing ${c.name}`
      const params = Object.fromEntries(c.statements.filter((s) => s.quantity && (s.kind === 'constraint' || s.kind === 'performance')).map((s) => [s.text, s.quantity]))
      return proposal({
        title: `Request ${target.toUpperCase()} realization of ${c.key}`,
        explanation: `${description}. Recorded as a pending realization request (no ${target.toUpperCase()} generation API exists yet).`,
        preview: [{ label: 'Realization request', proposed: description, targetId: c.id }, ...Object.entries(params).map(([k, q]) => ({ label: 'Parameter', proposed: `${k}: ${formatQuantity(q)}`, basis: 'ai-hypothesis' as const }))],
        async apply(p) {
          const prov = { provenance: assistantProvenance(p) }
          const existing = (await client.implementations(c.id)).find((i) => i.status !== 'retired')
          const impl = existing ?? (await client.createImplementation({ name: `Realization of ${c.name}`, conceptIds: [c.id] }, { ...prov, idempotencyKey: `${p.conversationId}:${p.proposalId}:impl` }))
          const after = await client.requestRealization(impl.id, { targetModule: target, requestKind: target === 'cad' ? 'generate-geometry' : 'formalize-structure', description, parameters: params }, { ...prov, expectedRevision: impl.revision, idempotencyKey: `${p.conversationId}:${p.proposalId}:request` })
          const req = after.realizationRequests[after.realizationRequests.length - 1]
          return { summary: `Recorded a pending ${target.toUpperCase()} realization request on ${after.key}`, createdIds: [req.id] }
        },
        async undo(applied) {
          const id = applied.createdIds?.[0]
          if (id) await client.setRealizationStatus(id, 'cancelled', { reason: 'Undo of an assistant proposal' })
          return { summary: 'Cancelled the realization request' }
        },
      })
    },
  },
  {
    name: 'conceptualize.next_steps',
    label: 'Suggest next steps',
    description: 'Maturity assessment of a Concept: completeness checklist, suggested maturity and next steps (deterministic rules, not an AI judgement).',
    parameters: { type: 'object', properties: { conceptId: string }, required: ['conceptId'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const c = await resolve(client, argString(args, 'conceptId'))
      const a = await client.assessment(c.id)
      return {
        kind: 'data',
        data: { concept: `${c.key} ${c.name}`, maturity: a.maturity, suggestedMaturity: a.suggestedMaturity, completeness: a.completeness, counts: a.counts, nextSteps: a.nextSteps, note: a.note },
        summary: `Assessed ${c.key}: ${Math.round(a.completeness * 100)} % complete, ${a.nextSteps.length} next step(s)`,
        inspected: [{ id: c.key, detail: `assessment of rev ${c.revision}` }],
      }
    },
  },
]

const CON = /\b(CON-\d{3,})\b/i

/**
 * DEMO ONLY: maps example prompts to `concepts.*` calls for the scripted demo assistant (no model provider).
 * The reply says it is a scripted demo and that results are AI hypotheses.
 */
/** DEMO ONLY: the deterministic interpreter writes the arguments a model would write for conceptualize.create. */
function demoCreateArguments(text: string): Record<string, unknown> {
  const d = draftConcept(text, 'ai-hypothesis')
  return {
    text,
    name: d.name,
    ...(d.summary ? { summary: d.summary } : {}),
    statements: [...d.statements.map((s) => ({ kind: s.kind, text: s.text, ...(s.quantity ? { quantity: s.quantity } : {}), ...(s.basis && s.basis !== 'ai-hypothesis' ? { basis: s.basis } : {}) })), ...d.notes.map((n) => ({ kind: 'question', text: n }))],
  }
}

export const conceptsDemo: DemoPlanner = (text, ctx) => {
  const design = designDemo(text, ctx)
  if (design) return design
  const t = text.trim()
  const note = '\n\nScripted demo assistant: no language model is connected; the interpretation and estimates are deterministic and labelled as AI hypotheses.'
  let m: RegExpExecArray | null
  if ((m = /\b(?:create|new|capture|add|record)\s+(?:a\s+)?concept\b\s*(?:for|from|:)?\s*:?\s*(.+)$/i.exec(t)) && m[1].trim().length > 3) {
    return { reply: `I prepared a new Concept from your description. The text is kept verbatim; what I interpreted from it is marked as AI hypotheses.${note}`, calls: [{ name: 'conceptualize.create', arguments: demoCreateArguments(m[1].trim()) }] }
  }
  if (/\b(develop|generate|propose|suggest|give me|come up with|explore|create)\b.*\b(alternatives?|concepts|options|solutions|variants)\b/i.test(t) && !/\brequirements?\b/i.test(t)) {
    return { reply: `I prepared alternative Concepts for your objective from the scripted principle library, with a functional decomposition, preliminary estimates from your quantities and a trade study. All of it is an AI hypothesis or estimate for you to review.${note}`, calls: [{ name: 'conceptualize.develop_alternatives', arguments: demoAlternativesArguments(generateExploration(t).exploration) }] }
  }
  if ((m = /\bnext steps?\b.*?(CON-\d{3,})/i.exec(t)) || (m = /\b(CON-\d{3,})\b.*\bnext steps?\b/i.exec(t))) {
    return { reply: `Here is the deterministic maturity assessment of ${m[1].toUpperCase()} with suggested next steps.${note}`, calls: [{ name: 'conceptualize.next_steps', arguments: { conceptId: m[1].toUpperCase() } }] }
  }
  if ((m = /\bcompare\b.*?(CON-\d{3,})/i.exec(t))) {
    return { reply: `I compared the alternatives of ${m[1].toUpperCase()}. Scores are preliminary unless marked as verified evidence.${note}`, calls: [{ name: 'conceptualize.compare', arguments: { conceptId: m[1].toUpperCase() } }] }
  }
  if ((m = /\bdecompose\s+(CON-\d{3,})\s+into\s+(.+)$/i.exec(t))) {
    const children = m[2].replace(/\.$/, '').split(/,|\band\b/).map((s) => s.trim()).filter(Boolean)
    return { reply: `I prepared a decomposition of ${m[1].toUpperCase()}.${note}`, calls: [{ name: 'conceptualize.decompose', arguments: { conceptId: m[1].toUpperCase(), children } }] }
  }
  if ((m = /\blink\s+(CON-\d{3,})\s+(?:to|with)\s+([A-Za-z0-9._-]+\/[A-Za-z0-9._:-]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(t))) {
    return { reply: `I prepared an implementation linking ${m[1].toUpperCase()} to ${m[2]}; the reference is checked through the owning module.${note}`, calls: [{ name: 'conceptualize.link_artifact', arguments: { conceptId: m[1].toUpperCase(), artifactId: m[2] } }] }
  }
  if ((m = /\blink\s+(CON-\d{3,})\s+(?:to|with)\s+([A-Z]{2,4}-\d+)\b/i.exec(t))) {
    return { reply: `I prepared an implementation linking ${m[1].toUpperCase()} to ${m[2].toUpperCase()}.${note}`, calls: [{ name: 'conceptualize.link_artifact', arguments: { conceptId: m[1].toUpperCase(), artifactId: m[2].toUpperCase() } }] }
  }
  if (/\bpropose\b.*\brequirements?\b/i.test(t) && (m = CON.exec(t))) {
    return { reply: `I prepared draft requirements for the quantified constraints of ${m[1].toUpperCase()}. They will be drafts in Requirements; approval stays there.${note}`, calls: [{ name: 'conceptualize.propose_requirement', arguments: { conceptId: m[1].toUpperCase() } }] }
  }
  if (/\b(request|initiate|start)\b.*\bcad\b/i.test(t) && (m = CON.exec(t))) {
    return { reply: `I prepared a CAD realization request for ${m[1].toUpperCase()}. There is no CAD generation API yet, so it will be recorded as pending.${note}`, calls: [{ name: 'conceptualize.request_realization', arguments: { conceptId: m[1].toUpperCase(), targetModule: 'cad' } }] }
  }
  if ((m = /\b(?:select|choose|pick|pursue)\s+(CON-\d{3,})\b/i.exec(t))) {
    return { reply: `I prepared a proposed decision to pursue ${m[1].toUpperCase()}. A reviewer records it in Conceptualize.${note}`, calls: [{ name: 'conceptualize.propose_decision', arguments: { conceptId: m[1].toUpperCase() } }] }
  }
  if ((m = /\b(?:show|read|describe|explain)\b.*?(CON-\d{3,})/i.exec(t))) {
    return { reply: `Here is ${m[1].toUpperCase()}.${note}`, calls: [{ name: 'conceptualize.read', arguments: { conceptId: m[1].toUpperCase() } }] }
  }
  if ((m = /\b(?:find|search)\s+concepts?\s+(?:for|about|with)?\s*(.+)$/i.exec(t))) {
    return { reply: `Concepts matching “${m[1].trim()}”.${note}`, calls: [{ name: 'conceptualize.search', arguments: { text: m[1].trim() } }] }
  }
  return null
}

const actions: AssistantActionDefinition[] = [...conceptActions, ...designActions, ...visualActions, ...intentActions, ...architectureActions]

export const conceptsAssistant: AssistantContribution = { actions, demo: conceptsDemo }
