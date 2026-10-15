---
help_id: conceptualize.api
title: Conceptualize API and integration
kind: api
summary: HTTP API at /api/concepts/v1 (OpenAPI 3.1, interactive reference), events, idempotency, provenance headers, and the SDK ConceptsService for other modules.
keywords: [api, openapi, rest, sdk, events, sse, integration, ConceptsService]
related: [conceptualize.overview]
---
- **HTTP**: `/api/concepts/v1`, OpenAPI at `/api/concepts/v1/openapi.json`, interactive reference at
  `/api/concepts/v1/docs`. Writes need `If-Match` or `expectedRevision`; creates need `Idempotency-Key`.
  Provenance headers: `X-Source-Kind`, `X-Conversation-Id`, `X-Proposal-Id`, `X-Message-Id`.
- **Events**: Server-Sent Events at `/projects/{projectId}/events` (concept.created, concept.revised,
  concept.relationships-changed, concept.implementation-linked and -unlinked, concept.selected,
  concept.superseded, concept.decision-recorded).
- **Other modules** use only the SDK `ConceptsService` (`services.concepts`): `get`, `list`,
  `conceptsForArtifact`, `implementations`, `subscribe`. They never read Conceptualize tables.
- **Explorations**: `POST /projects/{projectId}/explorations` creates a parent, alternatives,
  decompositions, preliminary evidence and a trade study atomically; `…/undo` archives them.
- **Design knowledge and batch** (Design Reasoning R1): `POST /projects/{projectId}/batch` takes
  `items: [{ op, as?, body }]`, all or nothing, with placeholders (`$fn`) replaced in later bodies. Item
  ops use the R1 names. Where a v1 operationId differs, OpenAPI marks the operation with
  `x-r1-operation`:

  | R1 name | v1 operationId |
  | --- | --- |
  | proposeDecision | createDecision |
  | putScores | putTradeScores |
  | createLink (design link) | createDesignLink |
  | traverse | traverseGraph |
  | linkTypes, links | listLinkTypes, listDesignLinks |

  The v1 `createLink` (Concept → artifact link) is `createConceptLink` in a batch. Graph reads:
  `/graph/traverse`, `/graph/neighbourhood`, `/graph/paths`, `/search`.
