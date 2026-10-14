# Requirements ↔ SysML: supported mappings and SDK usage

Maintained by the Requirements agent. Contracts: [requirements-contracts.md](requirements-contracts.md).
SysML-side UI changes are coordinator work (contracts §10.3); this document defines what the
Requirements side provides and how consumers use it.

Reference read in full: OMG *Systems Modeling Language (SysML) v2.0, Part 1: Language*,
formal/26-03-02 (§7.15 Allocations, §7.21 Requirements, §7.24 Verification Cases, §9.6 Requirement
Derivation Domain Library). **This module does not claim SysML v2 conformance.** The platform's
SysML tool is an illustrative editor over the shared twin, not a SysML v2 implementation.

## 1. Ownership (contracts §2)

| Aspect | Owner | Where |
| --- | --- | --- |
| Canonical requirement: identity (UUID), key, title, statement, rationale, type, lifecycle, reviews, baselines | Requirements | PostgreSQL schema `requirements` via the API |
| Requirement usage in a SysML view (`references`: SysML element → requirement) | SysML | Shared twin |
| Satisfaction claim (`satisfies`: SysML part → requirement usage) | SysML | Shared twin |
| Verification records (`verifies`, exact requirement revision) | Requirements tool, as twin artifacts | Shared twin (ADR-0007) |
| `derives-from`, `decomposes`, `depends-on`, `allocated-to` | Requirements | `requirements.relationships` |

A SysML view never holds an editable copy of the statement: it shows the canonical text read
through `RequirementsService` by canonical UUID (or a legacy twin ID resolved with `resolve()`).

## 2. Mapping to SysML v2 constructs

| This platform | SysML v2 construct (spec clause) | Direction | Status |
| --- | --- | --- | --- |
| Requirement (canonical) | `requirement def` / `requirement` usage (§7.21.2); the statement maps to documentation text, not to constraint expressions | — | Mapped conceptually; the platform stores text only |
| Key (`REQ-001`) | Short name / declared ID (`<'REQ-001'>`) | — | Display only; never used as identity |
| `references` (SysML element → requirement) | A requirement usage in the model that stands for the canonical requirement | element → requirement | Supported (SysML tool, twin) |
| `decomposes` (child → parent) | Nested (composite) requirement usage of the parent, or a requirement referenced as a required constraint (§7.21.1) | child → parent | Mapped; we store an explicit relationship, not containment |
| `derives-from` (derived → original) | `Derivation` connection: `originalRequirement` = our `to`, `derivedRequirements` include our `from` (§9.6) | derived → original | Mapped |
| `satisfies` (part → requirement usage) | Satisfy requirement usage (§7.21.4): asserts the requirement holds with the part bound to its subject | part → requirement | SysML-owned; a modelled claim, not evidence |
| `allocated-to` (requirement → component) | Allocation usage (§7.15) from the requirement to the part usage representing the component | requirement → component | Mapped; endpoint is a twin component ID |
| Verification method / acceptance criteria | Verification case objective with `verify` requirement memberships (§7.24) | — | Not mapped: we store method and criteria as text; results are twin artifacts |
| `depends-on` | Generic dependency | from → to | Mapped to a dependency; no requirement-specific semantics |

### Unsupported (stated explicitly)

- Subjects, actors, stakeholders, concerns, assumed and required constraint expressions (§7.21.1).
- Requirement definitions as reusable templates with parameter redefinition.
- Negated satisfaction, `#refinement` and other metadata-based relationships.
- Verdict evaluation of verification cases.
- Textual or XMI/JSON SysML v2 exchange (no import/export of SysML models).

Approval (reviews), verification results (artifacts), compliance assessment and modelled
satisfaction stay four different records; nothing in the mapping turns one into another.

## 3. What the Requirements side provides for SysML (brief §6)

| Brief §6 item | Provided by Requirements | Coordinator work |
| --- | --- | --- |
| Place an existing requirement in a SysML view | `list` / `resolve` / `get` by UUID; contract test suite | SysML view stores `references` to the UUID |
| Create requirements from SysML through the API | `create()` with `tool:sysml` entitlement (canonical fields only, server-enforced) | SysML create dialog |
| Edit canonical fields from either tool, same validation | `update()` with `expectedRevision`; identical server validation; 409 on conflict | SysML edit form |
| Link requirements to supported SysML elements | `references` / `satisfies` in the twin (SysML-owned); allocation via Requirements | SysML linking UI |
| Navigate between requirements and representations | Requirements tool selects the twin object (legacy ID until migration, then UUID); SysML usage selection resolves to the requirement | `openTool` wiring |
| Configuration- and baseline-aware retrieval | `scope.configurationId`, `scope.baselineId` on `get`/`list`/`resolve`/`traceLinks` | Pass the view's context |
| Refresh affected views after committed changes | `subscribe(projectId)`: SSE events after commit (outbox), dedupe by `eventId` | Forward to detached windows |

## 4. SDK usage examples (SysML and CAD consumers)

Consumers import only `@ews/platform-sdk` types; they never import `@ews/requirements-*`.

```tsx
import { RequirementsServiceError, type RequirementSummary } from '@ews/platform-sdk'
import { usePlatformServices, useSharedContext, useToolApi } from '@ews/platform-sdk/react'
import { useEffect, useState } from 'react'

// 1. Show a requirement usage with the canonical text (SysML property panel).
function RequirementUsagePanel({ requirementRef }: { requirementRef: string /* UUID or legacy REQ-00x */ }) {
  const { requirements } = usePlatformServices()
  const { projectId, configurationId } = useSharedContext()
  const [req, setReq] = useState<RequirementSummary | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!requirements) return
    let alive = true
    const load = () =>
      (/^[0-9a-f-]{36}$/i.test(requirementRef)
        ? requirements.get(requirementRef, { projectId, configurationId })
        : requirements.resolve(requirementRef, { projectId, configurationId })
      ).then((r) => alive && setReq(r ?? null), (e) => alive && setError(e.message))
    void load()
    // Reread after committed changes; events may repeat, rereading is idempotent.
    const off = requirements.subscribe(projectId, () => void load())
    return () => {
      alive = false
      off()
    }
  }, [requirements, requirementRef, projectId, configurationId])
  if (!requirements) return <p>The Requirements service is not available here (not entitled or not provided).</p>
  if (error) return <p role="alert">Could not read the requirement: {error}</p>
  if (req === null) return <p>{requirementRef} does not exist or does not apply to {configurationId}.</p>
  if (!req) return <p>Loading…</p>
  return (
    <section>
      <h3>{req.key} {req.title} <small>rev {req.revision} · {req.status}</small></h3>
      <p>{req.statement}</p>
    </section>
  )
}

// 2. Create a requirement from SysML (canonical fields only; retries are safe with the same key).
async function createFromSysml(api: ReturnType<typeof useToolApi>, title: string, statement: string, retryKey: string) {
  const service = api.services.requirements
  if (!service) throw new Error('Requirements service unavailable')
  const created = await service.create({ projectId: api.getContext().projectId, title, statement, type: 'functional' }, { idempotencyKey: retryKey, reason: 'Created from SysML' })
  // Then record the SysML usage in the twin (SysML-owned): references → created.id
  return created
}

// 3. Edit canonical text from SysML with optimistic concurrency.
async function editStatement(api: ReturnType<typeof useToolApi>, req: RequirementSummary, statement: string) {
  try {
    return await api.services.requirements!.update(req.id, { statement }, { expectedRevision: req.revision, reason: 'Edited in SysML' })
  } catch (e) {
    if (e instanceof RequirementsServiceError && e.code === 'conflict') {
      // Keep the user's text; show that revision e.details?.currentRevision is newer and offer a reload.
    }
    throw e
  }
}

// 4. Baseline-aware read (e.g. a SysML view pinned to a requirements baseline).
async function pinned(api: ReturnType<typeof useToolApi>, id: string, baselineId: string) {
  return api.services.requirements!.get(id, { projectId: api.getContext().projectId, baselineId })
}
```

CAD consumer (read-only):

```ts
// Requirements allocated to the component a CAD representation represents.
import { componentOf } from '@ews/platform-sdk'
async function requirementsForCadSelection(api: import('@ews/platform-sdk').ToolApi, cadId: string) {
  const service = api.services.requirements
  const component = componentOf(api.getModel(), cadId)
  if (!service || !component) return []
  const { projectId, configurationId } = api.getContext()
  const page = await service.list({ projectId, configurationId, limit: 200 })
  const links = await Promise.all(page.items.map(async (r) => ({ r, links: await service.traceLinks(r.id, { projectId, configurationId }) })))
  return links.filter(({ links }) => links.some((l) => l.type === 'allocated-to' && l.to === component.id)).map(({ r }) => r)
}
```

(A CAD view with many requirements should rather use the full API's `allocatedTo` filter; the SDK
contract is intentionally small. A `list({ allocatedTo })` option would be an additive SDK change.)

## 5. Contract test suite for adapters

`@ews/requirements-client/contract-tests` exports `defineRequirementsServiceContract(name, setup)`.
Any `RequirementsService` adapter (HTTP, demo, or a host's own) must pass it:

```ts
import { defineRequirementsServiceContract } from '@ews/requirements-client/contract-tests'
defineRequirementsServiceContract('workspace adapter', async () => ({ service: myAdapter, projectId: 'PRJ-ACT100', settle: async () => {} }))
```

It covers explicit mode and contract version, legacy-ID resolution to the agreed UUIDs, reads by
UUID (unknown → `undefined`), cursor pagination and limits, idempotent creation, field validation,
optimistic concurrency with `details.currentRevision`, exact-revision reads, requirement-owned trace
links with direction, committed-change events, and baseline-scoped reads (or a clear error when an
adapter has no baselines). Current results: demo adapter (root `npm test`), HTTP adapter against the
real API and PostgreSQL as editor `eli` and as SysML-only `nia` (`npm run req:test:db`).
