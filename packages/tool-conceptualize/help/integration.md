---
help_id: conceptualize.integration
title: Engineering integration and change notifications
kind: guide
summary: All implementation artifacts and requirement links with their status; stale and broken references appear as change notifications for review.
keywords: [integration, notifications, impact, stale, broken, synchronization]
related: [conceptualize.implementation, conceptualize.requirements]
---
The **Integration** page lists every reference of the project. **Change notifications** list references
whose artifact changed since it was linked or no longer exists. Changes in implementations never
overwrite design intent: review the change, then accept the new revision (a recorded synchronization),
revise the Concept, or replace the artifact.

Checks run in the browser through the Requirements service and the shared model (v1); analysis
references are labelled test-adapter references and are not checked.
