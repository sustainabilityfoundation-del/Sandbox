Generated from OpenAPI by scripts/gen-api-reference.mjs; do not edit

# Visualization API

Base path: /api/visualization/v1

## Adapters

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /adapters | listAdapters | Image adapters and whether each is available to you in a project | none | 200: application/json: object (inline); 4XX: application/json: Error; 500: application/json: Error |

## Assets

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| POST | /projects/{projectId}/assets | uploadAsset | Upload a reference image (PNG, JPEG or WebP, up to 1.5 MB) | application/json: object (inline) | 201: application/json: Asset; 4XX: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/assets/{assetId} | getAsset | Asset metadata | none | 200: application/json: Asset; 4XX: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/assets/{assetId}/content | getAssetContent | Asset bytes (verified against their SHA-256) | none | 200: image/*: schema (inline); 4XX: application/json: Error; 500: application/json: Error |

## Events

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| GET | /projects/{projectId}/events | streamEvents | Job changes as server-sent events | none | 200: text/event-stream: schema (inline); 4XX: application/json: Error; 500: application/json: Error |

## Jobs

| Method | Path | operationId | Summary | Request body schema | Response schemas |
| --- | --- | --- | --- | --- | --- |
| POST | /projects/{projectId}/batches | createBatch | Request several illustrations; each item has its own outcome | application/json: object (inline) | 200: application/json: object (inline); 4XX: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/jobs | listJobs | Generation jobs, newest first | none | 200: application/json: object (inline); 4XX: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/jobs | createJob | Request an illustration (idempotent) | application/json: object (inline) | 200: application/json: object (inline); 201: application/json: object (inline); 4XX: application/json: Error; 500: application/json: Error |
| GET | /projects/{projectId}/jobs/{jobId} | getJob | A generation job | none | 200: application/json: Job; 4XX: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/jobs/{jobId}/cancel | cancelJob | Cancel a job | none | 200: application/json: Job; 4XX: application/json: Error; 500: application/json: Error |
| POST | /projects/{projectId}/jobs/{jobId}/retry | retryJob | Run a failed or cancelled job again | none | 200: application/json: Job; 4XX: application/json: Error; 500: application/json: Error |
