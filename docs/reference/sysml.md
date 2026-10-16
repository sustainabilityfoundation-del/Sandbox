Generated from OpenAPI by scripts/gen-api-reference.mjs; do not edit

# SysML Modeler API

Base path: /api/sysml/v1

## Branches

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /projects/{projectId}/branches | getBranches | Branches of a project | none | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/branches | postBranch | Create a branch at a commit | application/json: object (inline) | 201: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/branches/{branchId} | getBranchById | A branch; ETag is its head commit ID | none | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |

## Commits

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /projects/{projectId}/commits | getCommits | Commits, newest first (optionally only those of a branch) | none | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/commits | postCommit | Commit raw element versions (Systems Modeling API). The core checks well-formedness (references, ownership) before accepting. | application/json: object (inline) | 201: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/commits/{commitId} | getCommitById | A commit with provenance (actor, source, description, typed commands summary) | none | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/commits/{commitId}/changes | getChangesByCommit | The data versions of a commit (payload null = deleted) | none | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/commits/{compareCommitId}/diff | getDiffsByProjectCommit | Element-level semantic diff between a base commit and this commit | none | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |

## Elements

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /projects/{projectId}/commits/{commitId}/elements | getElements | Elements at a commit (paged with page[size] / page[after]; Link header) | none | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/commits/{commitId}/elements/{elementId} | getElementByProjectCommitId | An element at a commit (?derived=true adds name, qualifiedName, owner, source, target …) | none | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/commits/{commitId}/elements/{elementId}/relationships | getRelationshipsByProjectCommitRelatedElement | Relationships related to an element | none | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/commits/{commitId}/roots | getRootsByProjectCommit | Root elements (the root namespace) | none | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |

## Events

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /projects/{projectId}/events | events | Committed-change notifications (Server-Sent Events); resume with Last-Event-ID or ?after | none | 200: text/event-stream: schema (inline); 4XX: application/json: Error; 500: application/json: Error |

## Model services

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /projects/{projectId}/commits/{commitId}/children | getChildren | Members of a namespace with derived summaries (lazy model browser); root namespace by default | none | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/commits/{commitId}/impact | getImpact | Impact analysis: elements that refer to an element (directly: references; transitively to depth) | none | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/commits/{commitId}/model | getModelSnapshot | All elements of the model at a commit (standard JSON), paged with limit/cursor, for editors | none | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/commits/{commitId}/search | searchElements | Find elements by text, metaclass (kinds include specializations) and owner | none | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/commits/{commitId}/text | getText | SysML v2 textual notation of the model or of one namespace (members) | none | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/commits/{commitId}/validation | getValidation | Validation diagnostics of the model at a commit | none | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |

## Projects

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /projects | getProjects | SysML projects of the platform projects you are a member of | none | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |
| POST | /projects | postProject | Create a project (with branch main and commit 1: the root namespace, optionally an initial model in textual notation) | application/json: object (inline) | 201: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId} | getProjectById | A project | none | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |

## Queries

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| POST | /projects/{projectId}/query-results | getQueryResultsByProjectIdQuery | Run a query (subset of the API Query: PrimitiveConstraint on @type, declaredName, name, qualifiedName, owner; CompositeConstraint and/or) | application/json: object (inline) | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |

## Schema

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /commands | describeCommands | Schema discovery: typed command schemas, creatable kinds, supported metaclasses with attributes and references, validation rules | none | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |

## Tags

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /projects/{projectId}/tags | getTags | Tags (baselines) of a project | none | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/tags | postTag | Tag a commit (baseline) | application/json: object (inline) | 201: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |

## Transactions

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| POST | /projects/{projectId}/branches/{branchId}/transactions | postTransaction | Apply typed commands atomically (or dry-run them): change set, diagnostics introduced/resolved, commit with provenance | application/json: object (inline) | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/commits/{commitId}/revert | revertCommit | Undo a commit with a compensating commit on a branch (refused when later commits changed the same elements) | application/json: object &#124; null (inline) | 200: application/json: schema (inline); 4XX: application/json: Error; 500: application/json: Error |
