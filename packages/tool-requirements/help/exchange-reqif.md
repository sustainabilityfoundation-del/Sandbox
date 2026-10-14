---
help_id: requirements.exchange.reqif
title: Import and export (ReqIF, JSON)
kind: guide
summary: Exchange specifications with other tools as ReqIF 1.2 or JSON, with a preview before anything changes.
keywords: [reqif, import, export, exchange, doors, polarion, jama, codebeamer, json, reqifz]
related: [requirements.collections, requirements.troubleshooting]
---

## Import

1. On **Import / export**, choose a `.reqif`, `.reqifz` or `.json` file and **Preview**.
2. Review new, changed, unchanged and conflicting records, attribute and relationship mappings, findings
   and unsupported content.
3. Decide conflicts, then apply. Nothing is deleted because it is missing from the file.

Re-importing from the same exchange source updates the matched requirements instead of duplicating them.

## Export

Export a selection, a collection or a baseline. The report lists anything that cannot be represented
exactly in the target format.

Tested with externally produced ReqIF files (Eclipse RMF test cases, DOORS, Polarion, ReqIF Studio and
Enterprise Architect exports). Exchanges *into* commercial tools have not been tested.
