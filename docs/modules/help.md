# Help and documentation system

Status: implemented (help schema 1, SDK 1.4.0), sprint
[005](../sprints/005-help-system.md). Decision: [ADR-0014](../decisions/0014-unified-help-system.md).

The coordinator owns this architecture and its contracts. **Each module agent owns its module's
documentation and contextual help mappings** (root [AGENTS.md](../../AGENTS.md), "Help and documentation").

## 1. What people get

- A **Help (?) button** at the right end of the header. Its menu: Help Centre, Contextual help (F1),
  Getting started, Keyboard shortcuts, one submenu per available module (User guide, Feature reference,
  Tutorials, Keyboard shortcuts, Troubleshooting, API documentation, whichever exist), API
  documentation, About and versions.
- Module submenus come from the Help Service, which reads the **tool registry** and the
  **subscription**: installed, enabled and permitted modules appear; others do not.
- **F1** anywhere: help for the focused control, else the active tool, else the selected object's type,
  else the workspace guide.
- **Help Centre**: search across all available modules, navigation by module, topics with version and
  source, related topics, tutorials, API links; works on phones.
- **Guided tutorials** (Driver.js) that highlight controls step by step, with a written version.
- **Interactive API reference** (Scalar) for each HTTP API, served by the backend from local files.

## 2. Architecture

```
packages/<module>/help/*.md         module documentation (Markdown + front matter), owned by the module
packages/<module>/src/help.ts       HelpManifest built from those files + mappings, tutorials, shortcuts
        │  ToolDefinition.help (SDK 1.4)
        ▼
apps/workspace/src/help/            Help Service (registry-driven, subscription-filtered)
   helpService.ts  createHelpService(sources)      search · topic · contextual · tutorials · open
   workspaceHelp.ts  sources = platform + tools + AI interface; services.help
   HelpMenu.tsx · HelpCentre.tsx · contextual.ts (F1) · tours.ts (Driver.js) · HelpMarkdown.tsx
        │                                    │
        ▼                                    ▼
people (menu, F1, Help Centre)        assistant: read_help operation (same service, same filtering)
```

- Contract: `packages/platform-sdk/src/contract/help.ts` (`HelpManifest`, `HelpTopic`, `HelpTutorial`,
  `HelpShortcut`, `HelpContextMapping`, `HelpApiReference`, `HelpContext`, `HelpService`,
  `parseHelpMarkdown`, `validateHelpManifest`). Tools receive the service as `ToolApi.services.help`.
- No parallel infrastructure: discovery uses the tool registry; visibility uses the entitlement check
  (`canOpenTool`); the service is offered through the existing `PlatformServices`.
- The documentation framework is not part of the runtime: the app reads the Markdown at build time
  (`import.meta.glob`); the portal reads the same files.

## 3. Help manifest (schema version 1)

| Field | Content |
| --- | --- |
| `schemaVersion` | `1`; the service serves no topics from an unknown schema version (the module is listed with the problem) |
| `moduleId`, `displayName` | Same ID as the tool; every topic ID starts with `<moduleId>.` |
| `moduleVersion`, `docsVersion` | A different major version is flagged "documentation may be out of date" |
| `landingTopic` | The user guide entry (usually `<module>.overview`) |
| `topics` | Parsed from `help/*.md` |
| `contextMappings` | Toolbar items, `data-help-id` controls, assistant operations, object types and properties → topic |
| `tutorials` | Steps naming controls by help ID; each tutorial has a written topic |
| `shortcuts` | Keys, action, topic |
| `apiReferences` | OpenAPI (interactive reference) and other API documentation |
| `keywords` | Module-level search terms |

### Help IDs

Lower-case, dot-separated, namespaced by module: `requirements.requirement.create`,
`requirements.lifecycle`, `sysml.block.create`, `cad.sketch.constraint.apply`. Keep them stable when the
interface changes; a renamed screen keeps its IDs. Controls carry them as `data-help-id`; toolbar items
get theirs from `contextMappings` automatically.

### Topic files

```markdown
---
help_id: requirements.requirement.create
title: Create a requirement
kind: guide            # overview | guide | reference | tutorial | shortcuts | troubleshooting | api
summary: One or two sentences.
keywords: [add, new, create]
object_types: [requirement]
operations: [requirements.update]   # assistant operations this topic documents
related: [requirements.requirement.edit]
---
Body in Markdown. Link topics with [text](help:requirements.lifecycle).
```

Explain inputs, outputs, constraints, dependencies and expected behaviour, not only what a command does.
User documentation lives in `help/`; developer documentation stays in `docs/` and `AGENTS.md`.

## 4. Help Service behaviour

| Need | Behaviour |
| --- | --- |
| Discovery | Sources are re-read on every call: installing, removing or losing access changes results immediately |
| Context | `contextual(ctx)`: control → toolbar item → operation → object property → object type → module landing → workspace guide |
| Search | All available modules or one; ranked by title, keywords, summary, body; hits carry module, docs version, source and a snippet |
| Versions | Schema mismatch: no topics, problem listed. Major version mismatch: served with a warning |
| Missing docs | Module listed with "No documentation yet"; unknown or unavailable topic opens the Help Centre with an explanation |
| Permissions | Every listing, topic, search and context answer is filtered by subscription |

## 5. AI access and retrieval

- Platform operation **`read_help`**: a topic by ID, a keyword search, or help for an object or
  operation. It uses the same service, so subscription filtering applies. Every result carries module,
  documentation version and source file.
- Documentation is never the source of executable behaviour: the assistant acts only through the
  operation registry (PLATFORM_TOOLS and tool assistant contributions), and `read_help` says so in
  every answer.
- RAG-ready without a vector database: topics have stable IDs, summaries, keywords, related links,
  object types, operations, versions and sources. A later retrieval index can chunk topic bodies by
  heading, embed them and keep the same IDs and provenance; `search` is the interface it would replace.

## 6. Documentation technology

| Tool | Role | Status |
| --- | --- | --- |
| Markdown + front matter in `help/` | Single source for app, assistant and portal | Implemented |
| In-app Help Centre | Reading, search, navigation, works offline (bundled) | Implemented |
| Driver.js 1.8.0 | Guided tours and feature highlighting; loaded on demand | Implemented |
| OpenAPI + Scalar 1.72.3 | Interactive REST reference at `/api/requirements/v1/docs`, served from the local package, no external requests | Implemented |
| Docusaurus | Central portal and versioned docs from the same `help/` files | Planned (ADR-0014): not yet set up |
| Storybook | Design-system component documentation and tests | Planned |
| TypeDoc | Generated TypeScript API docs for `@ews/platform-sdk` and module clients | Planned |

### Web and desktop, offline

The Help Centre, tutorials and topics are compiled into the application bundle, so they work without
a network in the browser and in a future desktop build. The API reference is served by the local
backend with no CDN, fonts or hosted services. The planned portal is a static site that can be bundled
with the desktop build or hosted for the web.

## 7. Definition of done for modules

A module feature is complete only when its documentation is: the module's manifest validates, every
toolbar item and assistant operation maps to a topic, significant controls carry `data-help-id`, and the
help pages are updated in the same change. `apps/workspace/src/help/help.test.ts` enforces the
checkable parts. Modules that ship no help yet are listed in `KNOWN_DOCUMENTATION_GAPS` there; that list
may only shrink.

## 8. Not yet done

- SysML and CAD documentation (module agents; listed as known gaps).
- Docusaurus portal, Storybook, TypeDoc (ADR-0014 plan).
- Semantic (embedding) search; translations; documentation for SysML/CAD operations in `read_help`.
- Server-side documentation access control (today filtering is in the client, like subscriptions).
