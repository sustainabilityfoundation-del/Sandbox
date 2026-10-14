# Requirements ↔ SysML: supported mappings and SDK usage

Maintained by the Requirements agent. Contracts: [requirements-contracts.md](requirements-contracts.md).
It defines what the Requirements side provides, how consumers use it, and (since sprint 003) how the
SysML tool uses it: `packages/tool-sysml/src/requirements.tsx`.

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

| Brief §6 item | Provided by Requirements | SysML tool (sprint 003) |
| --- | --- | --- |
| Place an existing requirement in a SysML view | `list` / `resolve` / `get` by UUID; contract test suite | Add Requirement Reference → *Existing requirement*: searchable list of projected requirements not yet used (shown by `displayId`, i.e. the key, and title); creates a usage with `references` to the canonical UUID |
| Create requirements from SysML through the API | `create()` with `tool:sysml` entitlement (canonical fields only, server-enforced) | *New requirement*: title and statement, `create()` with one idempotency key per dialog (a retry reuses it), then the usage and `references` once the projection contains the UUID |
| Edit canonical fields from either tool, same validation | `update()` with `expectedRevision`; identical server validation; 409 on conflict | Inspector *Edit text* (title, statement) with `expectedRevision` and `projectId`; conflict explained with the current revision, input kept, *Load latest (keep my edits)* |
| Link requirements to supported SysML elements | `references` / `satisfies` in the twin (SysML-owned); allocation via Requirements | Unchanged: Connect adds `satisfies` (part → usage) |
| Navigate between requirements and representations | Requirements tool *Show in SysML* (Trace tab, SysML section) selects the usages and opens SysML | Inspector *Open in Requirements*: `select([uuid])` + `openTool('requirements')`; the selection is shared |
| Configuration- and baseline-aware retrieval | `scope.configurationId`, `scope.baselineId` on `get`/`list`/`resolve`/`traceLinks` | Reads pass the view's `projectId` and `configurationId`; `SharedContext` has no baseline, so SysML shows the working revision |
| Refresh affected views after committed changes | `subscribe(projectId)`: SSE events after commit (outbox), dedupe by `eventId` | Not duplicated: the workspace projection refreshes the model; the inspector rereads when the projected revision changes |

### Rules the SysML tool follows

- The usage stores only `{ kind: 'requirement' }` and the `references` link. Title and statement
  are read from the projection (diagram label, text notation `doc` comment) or from
  `requirements.get` (inspector), never written to the SysML element.
- SysML imports only `@ews/platform-sdk` (`usePlatformServices`), never `@ews/requirements-client`
  (enforced by `boundaries.test.ts`). Keys come from `displayId`, never from the UUID.
- **Projection timing.** A new requirement becomes a twin object only after the workspace projection
  refreshes (change event, about 150 ms). Until then the twin refuses links to it. The tool waits for
  `api.getModel().get(uuid)` (`waitForObject`, 100 ms polling, 10 s timeout). On timeout it says
  that the requirement exists in Requirements and offers *Add usage*, which retries the link without
  creating the requirement again.
- **Lost responses.** If `create()` fails after the request reached the server, the input stays and
  the retry sends the same idempotency key: the server returns the first result, so no duplicate.
- **Unavailable service** (no service in the host, not entitled, API down): the dialog and the
  inspector explain this and show no stored copy; nothing is created locally.
- **Permissions** are the server's: `tool:sysml` allows the canonical subset (title, statement,
  rationale, type on create); users with neither `tool:sysml` nor `tool:requirements` get
  `forbidden`. Tested in `services/api/test/sysml.test.ts`.
- Rationale is not edited from SysML: `RequirementSummary` carries no rationale (contract request 7).
- **AI coverage** (AGENTS.md, AI capability design). Placing maps to the existing
  `sysml.add_requirement_reference` (the same usage and `references` batch as the dialog; action unchanged).
  Creating and editing canonical text from SysML have no assistant operation yet: assistant
  proposals can contain only twin changes, so an API write cannot be previewed and applied
  (contract request 3, deferred). Navigation maps to the platform's selection and `openTool`.
  The proposal-preview policy is unchanged.

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
