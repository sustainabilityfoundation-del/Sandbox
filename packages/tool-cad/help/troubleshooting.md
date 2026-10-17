---
help_id: cad.troubleshooting
title: Mock CAD troubleshooting
kind: troubleshooting
summary: Explain invalid dimensions, empty views and stale snapshots.
keywords: [cad, demo]
---

- No shape for a selection: it has no CAD representation through the explicit model links. Keep the selection and inspect the existing representations.
- Hidden part: restore it through Visibility, then use Fit.
- Invalid dimension: enter a finite number in mm within the documented range; blank or unsupported parameters are rejected.
- Stale revision: refresh, review the latest values and reapply the intended edit instead of overwriting another change.
- Snapshot disabled: Apply or Reset pending dimension inputs first.
- Snapshot stale: an input revision changed; create a new snapshot to capture the updated representation. Existing artifacts remain immutable.
- Missing solid modeling commands: this tool has no kernel. Use [CAD](help:cad-modeler.overview).
