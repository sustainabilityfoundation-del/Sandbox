---
help_id: sysml.troubleshooting
title: SysML demo troubleshooting
kind: troubleshooting
summary: Resolve missing links, unavailable services and rejected changes.
keywords: [sysml, demo]
---

- Empty selection: the selected object has no explicit SysML representation/reference. Add the appropriate link; do not create a duplicate physical component.
- Requirement service unavailable: use the full workspace. The harness cannot create or edit canonical requirement text.
- New requirement not visible: allow the platform projection to refresh before linking it; retry using the same creation operation rather than duplicating the requirement.
- Already represented/referenced: select the existing element instead of creating a second one.
- Invalid owner or connection: nesting is limited to one level; connect parts to parts or parts to requirement usages.
- Stale revision or denied write: refresh and review the current object and permissions before retrying. Dialog input is retained after a failed write.
- Text cannot be edited: this is intentional for this demo. Use [SysML Modeler](help:sysml-modeler.overview) for supported textual modeling.
