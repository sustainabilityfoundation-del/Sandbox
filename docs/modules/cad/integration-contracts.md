# CAD: integration contracts

Status: Proposed (CAD agent). Binding rules: contracts §4–§6. Items marked **CR** are contract change
requests for the coordinator (also listed in the progress file). Nothing here changes other modules.

## 1. Identity and references

- CAD owns documents, parts, features, parameters, sketches and their revisions (document
  `version`). Entity IDs are document-local and deterministic; global identity is
  `cadm:<documentUuid>/<entityId>`; faces use their stable names (`cadm:<doc>/ext-5/cap-end`).
- **CR-CAD-1 (ArtifactRef for CAD entities):** other modules reference CAD entities
  with SDK 1.5 `ArtifactRef { module: 'cad', id: 'cadm:<doc>/<entity>', kind, revision }`, `kind` ∈
  `cad-document | cad-part | cad-feature | cad-parameter | cad-face`, `revision` = document version
  (omit to follow the latest). Twin `CAD-…` IDs keep their current meaning. Alternative: a new
  `ArtifactModule` value `'cad-modeler'` (SDK minor bump). ADR-0026.
- Outbound references (CAD → others) are stored in the CAD document (`references[]`) with roles
  `represents`, `satisfies`, `verifies`, `realizes`, `traces`, `related`; implemented with commands
  and UI. Targets are referenced, never copied.

## 2. Requirements

- Association: `add_reference { subject: <part|feature|parameter|face>, role: 'satisfies' | 'verifies', target: { module: 'requirements', id: <requirement UUID>, revision? } }`.
- Validation of targets through `services.requirements.get/resolve` in the view (planned; today the
  ID of non-twin targets is stored as entered, without validation; only twin components are checked
  against the model).
- Verification evidence (planned Phase 3): mass and geometry checks recorded as twin verification
  artifacts by the Requirements module, referencing the CAD document version.

## 3. SysML

- `traces` references from CAD parts to SysML elements (twin IDs). Synchronisation is explicit and
  controlled: no implicit mapping of SysML blocks to geometry (contracts §4; AGENTS.md).
- Planned: a mapping table (block → part, part usage → component instance, port → named interface
  semantic) proposed through service proposals, never automatic.

## 4. Conceptualize

- `realizes` references from CAD parts to Concept UUIDs (stored now). With CR-CAD-1, Conceptualize
  ConceptImplementations can point to CAD parts via ArtifactRef; `conceptsForArtifact`
  then shows "realizes concept" in the CAD inspector (planned, uses `services.concepts`).
- Alternatives: several CAD documents or parts can realise one concept; concept identity is never
  stored in geometry.

## 5. AI Interface

- Operations: `cad-modeler.*` actions (see [ai-commands.md](ai-commands.md)); mutations are SDK 1.5
  service proposals with module `cad-modeler`; the capability inventory lists every toolbar item and
  operation (17 entries).
- Discovery: `cad-modeler.query list_commands` returns the catalogue; help topics document each
  operation.

## 6. Shared twin and the mock CAD tool

- **CR-CAD-3 (twin projection, proposal):** when a part `represents` a twin component, show a
  read-time projection (ADR-0012) of document title, version and mass properties on the component,
  owned by CAD. No dimension synchronisation in Phase 1.
- **CR-CAD-4 (mock replacement):** a separate ADR proposing to retire `cad`, migrate
  `cad-representation` objects non-destructively and move the ADR-0006 delegation; coordinator
  decision at integration review.

## 7. Platform services and persistence

- **CR-CAD-2:** `PlatformServices.cad?: CadDocumentService` (SDK minor) with `list`, `get(id,
  revision?)`, `saveRevision(doc, { expectedRevision, idempotencyKey })`, `subscribe`; backed by
  `services/cad` hosted by `services/api` at `/api/cad/v1` (contracts §2, §6). Until then: files.

## 8. Platform integration needs (coordinator-owned files)

Done on `feature/cad` in separate "COORDINATOR REVIEW:" commits (approved): tool registration,
workspace dependency, capability entries and the `cad-modeler` capability module, test lists, root
`cad:` scripts. Pending for the coordinator: boundary rules for `packages/cad-*` in
`boundaries.test.ts`; the AGENTS.md rule "do not claim a CAD kernel"; `apps/workspace/src/platform/capabilities.ts`
("About" page) and `docs/roadmap.md`; ADR numbering; `DEFAULT_OPEN_TOOLS` (unchanged).
