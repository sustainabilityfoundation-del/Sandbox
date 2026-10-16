Generated from OpenAPI by scripts/gen-api-reference.mjs; do not edit

# CAD Modeler API

Base path: /api/cad/v1

## Documents

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /projects/{projectId}/documents | listDocuments | CAD documents of a project (current revision summaries) | none | 200: application/json: array&lt;object (inline)&gt;; 4XX: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/documents | createDocument | Store a new CAD document as revision 1 | application/json: object (inline) | 201: application/json: object (inline); 4XX: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/documents/{documentId} | getDocument | The current (or a given) revision of a CAD document, with its native content | none | 200: application/json: object (inline); 4XX: application/json: Error; 500: application/json: Error |
| PUT | /projects/{projectId}/documents/{documentId} | saveRevision | Save a new revision of a CAD document | application/json: object (inline) | 200: application/json: object (inline); 4XX: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/documents/{documentId}/archive | archiveDocument | Archive or restore a CAD document (revisions are never deleted) | application/json: object (inline) | 200: application/json: object (inline); 4XX: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/documents/{documentId}/entities/{entityId} | resolveEntity | Resolve a CAD Modeler entity for cross-module references (ArtifactRef, CR-CAD-1) | none | 200: application/json: object (inline); 4XX: application/json: Error; 500: application/json: Error |

## Events

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /projects/{projectId}/events | cadEvents | Committed-change notifications (Server-Sent Events) | none | 200: text/event-stream: schema (inline); 4XX: application/json: Error; 500: application/json: Error |

## Revisions

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /projects/{projectId}/documents/{documentId}/revisions | listRevisions | Revision history (newest first) with provenance | none | 200: application/json: array&lt;object (inline)&gt;; 4XX: application/json: Error; 500: application/json: Error |
