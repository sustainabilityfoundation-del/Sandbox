# Project Management module

Status: **Phase A approved (15 October 2026); increment I1 implemented** (see the progress file). ADRs stay Proposed until the acceptance workflow validates them. Nothing here is
implemented unless the [progress file](../../specifications/project-management-progress.md) says so.

Brief: [project-management.md](../../specifications/project-management.md) ·
Contracts: [project-management-contracts.md](../../specifications/project-management-contracts.md) ·
Decisions: ADR-0060 to ADR-0068 (Proposed) in [docs/decisions](../../decisions/).

| Document | Content |
| --- | --- |
| [inspection.md](inspection.md) | What exists in the repository; overlaps and conflicts |
| [architecture.md](architecture.md) | Module architecture, placement, consistency, authorization, availability |
| [information-model.md](information-model.md) | Unified project information model, artifact contract, kinds, relationships |
| [api.md](api.md) | Project and artifact HTTP API and the proposed SDK 1.7 contract |
| [schema.md](schema.md) | PostgreSQL schema `projects` |
| [registration-and-provisioning.md](registration-and-provisioning.md) | How modules register artifacts; how a new project starts empty in every module |
| [interchange-package.md](interchange-package.md) | Open, versioned project package (`.ewsproj`) |
| [lifecycle-and-persistence.md](lifecycle-and-persistence.md) | Lifecycle transitions, persistence guarantees, integrity checks |
| [views.md](views.md) | Views as projections |
| [ai-operations.md](ai-operations.md) | `projects.*` assistant operations |
| [plan.md](plan.md) | Phased plan, brief §9 acceptance mapping, backlog |

| ADR | Decision |
| --- | --- |
| [0060](../../decisions/0060-projects-module-placement.md) | Project Management as a service-backed module that indexes, not copies |
| [0061](../../decisions/0061-projects-artifact-registry-and-global-identity.md) | Artifact registry and global artifact identity |
| [0062](../../decisions/0062-projects-artifact-registration-and-provisioning.md) | Registration from module outboxes plus reconciliation; provisioning without seed data |
| [0063](../../decisions/0063-projects-product-structure-home-and-twin-migration.md) | Server-side product registry in Project Management; twin components migrate by projection and aliases |
| [0064](../../decisions/0064-projects-interchange-package.md) | Open, versioned project interchange package |
| [0065](../../decisions/0065-projects-lifecycle-retention-and-deletion.md) | Project lifecycle, archive, soft delete with retention; never delete module data |
| [0066](../../decisions/0066-projects-blob-store.md) | Content-addressed blob store behind an interface |
| [0067](../../decisions/0067-projects-baselines.md) | Project baselines as sets of pinned module versions |
| [0068](../../decisions/0068-projects-views-as-projections.md) | Views as projections; no maintained copies |
| [0069](../../decisions/0069-projects-operation-records.md) | Persisted multi-module operation records with idempotent, resumable steps (C7) |
| [0071](../../decisions/0071-projects-browser-data-import.md) | Explicit, user-confirmed import of browser twin data (C8) |
