---
help_id: projects.assistant
title: Project operations for the assistant
kind: reference
summary: The projects.* operations the assistant can use. Reads run directly; every change is a preview you apply.
keywords: [assistant, ai, projects.create, projects.open, product element, store document, list artifacts]
related: [projects.overview, projects.product-structure]
---

| Operation | What it does | Change? |
| --- | --- | --- |
| `projects.get_context` | The open project: key, name, status, your role, modules and their states, settings, default tools | read |
| `projects.list_projects` | Projects you are a member of | read |
| `projects.create` | A new, empty project (checked on the server before the preview); you become administrator | preview, Apply |
| `projects.open` | Switches the window to another project (the window reloads) | preview, Apply |
| `projects.list_artifacts` | Every registered artifact of the open project across modules, with global IDs, kinds, versions and availability | read |
| `projects.create_product_element` | A product element, optionally below a parent in the product breakdown | preview, Apply |
| `projects.add_breakdown_edge` | Places an existing element below a parent | preview, Apply |
| `projects.store_document` | Stores a file (for example a STEP export) as a project document, recording where it came from: the source artifact and its exact revision, and the tool and version that produced it | preview, Apply |

Rules:

- The assistant works only in the open project and with your permissions. The server checks every change exactly
  as it does for the interface.
- Nothing changes until you choose **Apply** in the preview. Applied changes record the conversation and proposal
  they came from.
- Values the assistant suggests (names, properties) are marked as AI suggestions in the preview.
- A stored file's provenance is recorded with its version and cannot be edited later; a new export is a new version.
