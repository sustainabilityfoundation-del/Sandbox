---
help_id: conceptualize.implementation
title: Implementations and artifact links
kind: guide
summary: Link Concepts to SysML elements, CAD representations, components, analysis results and documents through ConceptImplementations; replace them without changing the Concept.
keywords: [implementation, link, artifact, cad, sysml, replace, stale, broken, realization, cad generation]
operations: [conceptualize.link_artifact, conceptualize.request_realization]
related: [conceptualize.integration, conceptualize.requirements]
---
A **ConceptImplementation** (`IMP-001`) realizes one or more Concepts. It references artifacts owned by
other modules, version-aware (pinned to the revision current when linked):

| Type | ID |
| --- | --- |
| System Model element | `<projectId>/<elementId>` (both UUIDs); revision = commit number on the default branch |
| CAD Modeler entity | `<documentUuid>/<entityId>`; revision = CAD document revision |
| Analysis result | test-adapter ID (no Analysis module exists) |
| Product element | A product element of Project Management (product registry), by UUID |
| Project document | A Project Management document, work item or milestone, by UUID (for example review minutes used as evidence) |
| External | URL or document reference |
| Demo twin object (PRJ-ACT100 only) | SYS-…, CAD-…, ROD-…: objects written by the retired illustrative SysML and mock CAD tools (kept data), shown with a **Demo twin** badge |

**Replace** swaps an artifact in one change (the old reference stays in the history); **Unlink**
removes it. The Concept's identity, revisions and intent never change; a Concept stays valid when its
CAD model is deleted.

Status badges: *Current*, *Changed since linked* (stale; **Accept revision N** pins the new revision
after you reviewed the change), *Not found* (broken), *Follows latest*, *Test adapter*.
References to the real modules are checked through the owning module: product elements, project
documents and (once those modules register them) SysML and CAD Modeler entities through the Project
Management registry. Until the SDK provides SysML and CAD Modeler read clients, System Model elements are
checked by a labelled **adapter** (existence at the head of the default branch; a newer commit is shown as
*Changed since linked*, although the element itself may be unchanged). Without a read client the badge says
*Not checked*.

**Request CAD generation** records a pending realization request: no CAD generation API exists yet,
and Conceptualize has no CAD kernel.

A pending realization request can be **cancelled**, or marked **fulfilled by** the artifact that
realizes it (the artifact is then linked to the implementation).
