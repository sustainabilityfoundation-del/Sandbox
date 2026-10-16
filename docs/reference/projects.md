Generated from OpenAPI by scripts/gen-api-reference.mjs; do not edit

# Project Management API

Base path: /api/projects/v1

## Activity

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /projects/{projectId}/activity | listActivity | Audit events of the project, newest first (module audits stay in the modules) | none | 200: application/json: array&lt;ActivityEntry&gt;; 401: application/json: Error; 500: application/json: Error |

## Documents

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /projects/{projectId}/documents | listDocuments | Documents and attachments | none | 200: application/json: array&lt;Document&gt;; 401: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/documents | createDocument | Create a document record (content is uploaded as versions) | application/json: CreateDocument | 201: application/json: Document; 401: application/json: Error; 422: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/documents/{documentId} | getDocument | A document with its versions | none | 200: application/json: Document; 401: application/json: Error; 404: application/json: Error; 500: application/json: Error |
| PATCH | /projects/{projectId}/documents/{documentId} | updateDocument | Edit document metadata or lifecycle (release needs a reviewer) | application/json: UpdateDocument | 200: application/json: Document; 401: application/json: Error; 403: application/json: Error; 409: application/json: Error; 422: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/documents/{documentId}/versions | uploadDocumentVersion | Upload a new immutable version (raw bytes) | */*: string (inline) | 201: application/json: Document; 401: application/json: Error; 409: application/json: Error; 413: application/json: Error; 422: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/documents/{documentId}/versions/{version}/content | downloadDocumentVersion | Download a version (hash verified on read) | none | 200: application/octet-stream: string (inline); 401: application/json: Error; 404: application/json: Error; 500: application/json: Error; 503: application/json: Error |

## Events

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /projects/{projectId}/events | projectEvents | Committed-change notifications (Server-Sent Events) | none | 200: text/event-stream: ProjectsEvent; 401: application/json: Error; 500: application/json: Error |

## Lifecycle

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| DELETE | /projects/{projectId} | deleteProject | Soft-delete a project (restorable during the retention period); module data is never deleted | none | 200: application/json: Project; 401: application/json: Error; 403: application/json: Error; 422: application/json: Error; 428: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/archive | archiveProject | Archive: read-only for every member; module data unchanged | application/json: Transition | 200: application/json: Project; 401: application/json: Error; 403: application/json: Error; 422: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/duplicate | duplicateProject | Duplicate a project’s configuration (and optionally members and planning items) into a new project | application/json: object (inline) | 201: application/json: Project; 401: application/json: Error; 403: application/json: Error; 409: application/json: Error; 422: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/lifecycle | lifecycleHistory | Project revisions: metadata, lifecycle status and record-state changes | none | 200: application/json: array&lt;object (inline)&gt;; 401: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/restore | restoreProject | Restore an archived project, or a deleted one within its retention period | application/json: Transition | 200: application/json: Project; 401: application/json: Error; 403: application/json: Error; 422: application/json: Error; 500: application/json: Error |

## Links

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /projects/{projectId}/links | listLinks | Links owned by Project Management | none | 200: application/json: array&lt;Link&gt;; 401: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/links | createLink | Create a link (validated by the link rules; meanings owned by a module are refused) | application/json: CreateLink | 201: application/json: Link; 401: application/json: Error; 409: application/json: Error; 422: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/links/{linkId}/remove | removeLink | Remove a link (recorded; never deleted) | application/json: RemoveLink | 200: application/json: Link; 401: application/json: Error; 404: application/json: Error; 422: application/json: Error; 500: application/json: Error |

## Members

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /projects/{projectId}/members | listMembers | Members and roles (the platform membership is the single authorization source) | none | 200: application/json: array&lt;Member&gt;; 401: application/json: Error; 500: application/json: Error |
| DELETE | /projects/{projectId}/members/{userId} | removeMember | Remove a member | none | 204: none; 401: application/json: Error; 403: application/json: Error; 404: application/json: Error; 422: application/json: Error; 500: application/json: Error |
| PUT | /projects/{projectId}/members/{userId} | setMember | Add a member or change a role (the last administrator and the owner stay administrators) | application/json: SetMember | 200: application/json: object (inline); 401: application/json: Error; 403: application/json: Error; 422: application/json: Error; 500: application/json: Error |

## Milestones

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /projects/{projectId}/milestones | listMilestones | Milestones by due date | none | 200: application/json: array&lt;Milestone&gt;; 401: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/milestones | createMilestone | Create a milestone (deliverables: artifact IDs, delivers links) | application/json: CreateMilestone | 201: application/json: Milestone; 401: application/json: Error; 422: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/milestones/{milestoneId} | getMilestone | A milestone | none | 200: application/json: Milestone; 401: application/json: Error; 404: application/json: Error; 500: application/json: Error |
| PATCH | /projects/{projectId}/milestones/{milestoneId} | updateMilestone | Edit a milestone (achieving one with open work returns warnings, never refuses) | application/json: UpdateMilestone | 200: application/json: Milestone; 401: application/json: Error; 409: application/json: Error; 422: application/json: Error; 500: application/json: Error |

## Product structure

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /projects/{projectId}/breakdowns | listBreakdowns | Named breakdowns (product breakdown, physical assembly, other) | none | 200: application/json: array&lt;Breakdown&gt;; 401: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/breakdowns | createBreakdown | Create a breakdown | application/json: object (inline) | 201: application/json: Breakdown; 401: application/json: Error; 409: application/json: Error; 422: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/breakdowns/{breakdownId}/edges | addBreakdownEdge | Place an element in a breakdown (below a parent, or as a root); cycles are refused | application/json: object (inline) | 201: application/json: object (inline); 401: application/json: Error; 409: application/json: Error; 422: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/breakdowns/{breakdownId}/edges/{edgeId}/remove | removeBreakdownEdge | Remove an element from a breakdown position (recorded; the element stays) | none | 204: none; 401: application/json: Error; 404: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/breakdowns/{breakdownId}/tree | breakdownTree | The breakdown as a tree (a projection; elements under two parents appear twice) plus unplaced elements | none | 200: application/json: object (inline); 401: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/product-elements | listProductElements | Product elements of the project (product, system, subsystem, assembly, part, other) | none | 200: application/json: array&lt;ProductElement&gt;; 401: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/product-elements | createProductElement | Create a product element, optionally placed in a breakdown | application/json: object (inline) | 201: application/json: ProductElement; 401: application/json: Error; 404: application/json: Error; 422: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/product-elements/{elementId} | getProductElement | A product element (by UUID or twin alias) | none | 200: application/json: ProductElement; 401: application/json: Error; 404: application/json: Error; 500: application/json: Error |
| PATCH | /projects/{projectId}/product-elements/{elementId} | updateProductElement | Edit a product element (new immutable revision); properties are merged | application/json: object (inline) | 200: application/json: ProductElement; 401: application/json: Error; 409: application/json: Error; 422: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/product-elements/{elementId}/history | productElementHistory | Immutable revisions of a product element | none | 200: application/json: array&lt;object (inline)&gt;; 401: application/json: Error; 500: application/json: Error |

## Projects

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /me/recent-projects | recentProjects | Projects you opened recently (newest first, at most 20) | none | 200: application/json: array&lt;Project&gt;; 401: application/json: Error; 500: application/json: Error |
| GET | /projects | listProjects | Projects you are a member of (search, filter, sort) | none | 200: application/json: ProjectPage; 401: application/json: Error; 500: application/json: Error |
| POST | /projects | createProject | Create a blank project or one from a template; you become its administrator | application/json: CreateProject | 200: application/json: DryRun; 201: application/json: Project; 401: application/json: Error; 409: application/json: Error; 422: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId} | getProject | A project with counts | none | 200: application/json: Project; 401: application/json: Error; 403: application/json: Error; 404: application/json: Error; 500: application/json: Error |
| PATCH | /projects/{projectId} | updateProject | Edit project metadata and lifecycle status (key and owner need administrator) | application/json: UpdateProject | 200: application/json: Project; 401: application/json: Error; 403: application/json: Error; 409: application/json: Error; 422: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/context | getProjectContext | The project context without recording a recent entry (for the assistant and refreshes) | none | 200: application/json: ProjectContext; 401: application/json: Error; 403: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/open | openProject | Open a project: records it as recently opened for you and returns the project context | none | 200: application/json: ProjectContext; 401: application/json: Error; 403: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/provision | provisionProject | Retry module provisioning (pending or failed modules; all of them with force) | none | 200: application/json: array&lt;ModuleState&gt;; 401: application/json: Error; 403: application/json: Error; 500: application/json: Error |

## Registry

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /projects/{projectId}/artifacts | listArtifacts | Artifact registry of the project (search, filter, sort) | none | 200: application/json: ArtifactPage; 401: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/artifacts/resolve | resolveArtifacts | Registry records for native references (unknown refs are absent from the result) | application/json: object (inline) | 200: application/json: array&lt;Artifact&gt;; 401: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/artifacts/{artifactId} | getArtifact | A registry record with its links (both directions) | none | 200: application/json: allOf(Artifact, object (inline)); 401: application/json: Error; 404: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/artifacts/{artifactId}/history | artifactHistory | Observations of a registry record (versions seen, lifecycle, availability); module history stays in the module | none | 200: application/json: array&lt;object (inline)&gt;; 401: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/reconcile | reconcileProject | Make the artifact registry converge with every installed module now | none | 200: application/json: object (inline); 401: application/json: Error; 500: application/json: Error |

## Templates

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /templates | listTemplates | Built-in project templates (configuration and planning items only; never engineering artifacts) | none | 200: application/json: array&lt;Template&gt;; 401: application/json: Error; 500: application/json: Error |
| GET | /templates/{templateId} | getTemplate | A template | none | 200: application/json: Template; 401: application/json: Error; 404: application/json: Error; 500: application/json: Error |

## Work items

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /projects/{projectId}/work-items | listWorkItems | Tasks, issues and risks | none | 200: application/json: WorkItemPage; 401: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/work-items | createWorkItem | Create a task, issue or risk, optionally about artifacts (subject-of links, same transaction) | application/json: CreateWorkItem | 200: application/json: DryRun; 201: application/json: WorkItem; 401: application/json: Error; 403: application/json: Error; 422: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/work-items/{workItemId} | getWorkItem | A work item | none | 200: application/json: WorkItem; 401: application/json: Error; 404: application/json: Error; 500: application/json: Error |
| PATCH | /projects/{projectId}/work-items/{workItemId} | updateWorkItem | Edit a work item; status changes follow the rules per kind (accepting a risk needs a reviewer and a rationale) | application/json: UpdateWorkItem | 200: application/json: WorkItem; 401: application/json: Error; 403: application/json: Error; 409: application/json: Error; 422: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/work-items/{workItemId}/history | workItemHistory | Immutable revisions of a work item | none | 200: application/json: array&lt;object (inline)&gt;; 401: application/json: Error; 500: application/json: Error |
