# AGENTS.md: @ews/design-system

The one component library, token set and icon registry for the shell, every tool and the assistant.
Owner: the ui-ux-design-system agent (Platform area). Reference: [docs/modules/design-system](../../docs/modules/design-system/README.md).

## Rules

- **Behaviour from React Aria Components, appearance from tokens.** New components wrap a React Aria
  component (or plain markup when React Aria has none) and style it with semantic Tailwind classes
  (`bg-surface`, `text-fg-2`, `border-line`, `h-ctl`, `rounded-control`) or `var(--ws-…)` in `@layer components`.
  No hard-coded colours outside `theme/tokens.css`.
- **Tokens are layered.** `--ws-palette-*` holds the approved Focused Canvas palette and is used only inside
  `tokens.css`; components use semantic roles (`--ws-surface`, `--ws-text-2`, `--ws-accent`, `--ws-success`).
  The dark shell uses `--ws-shell-*` and the `.ws-shell-scope` class, which remaps the semantic roles, so ordinary
  components work on it. Both themes define every role; `theme/designSystem.test.ts` checks WCAG AA contrast for
  text pairs (4.5:1) and non-text marks (3:1). Add a pair there when you add a role that carries text.
- **Status colours** have a text variant (`--ws-success`, AA on surfaces) and a solid variant
  (`--ws-success-solid`, the palette value, for dots and icons). Never convey status by colour alone: pair an icon
  and words (`Badge`, `StatusBadge`, `StatusBarItem`, `Notice`).
- **Typography:** IBM Plex Sans for the interface, IBM Plex Mono (`font-mono`, `.ws-num`) for IDs, values,
  parameters and code. Steps: 12 (metadata), 13 (toolbars, trees, fields), 14 (body), 15 (panel headings),
  16, 18–20 (document and project headings). Body sizes follow density (`text-ui`, `text-ui-sm`, `text-ui-xs`);
  fixed steps are `text-12` … `text-20`. Nothing below 12 px.
- **Density:** `comfortable` (default) and `compact` change control, row, toolbar and status-bar heights through
  tokens (`h-ctl`, `h-ctl-sm`, `h-toolbar`, `h-statusbar`, `w-rail`). Never hard-code those heights.
- **Icons:** `AppIcon` with semantic names only. Lucide (`lucide-react`, ISC) is imported only in
  `icons/registry.tsx`. A new name goes in `icons/names.ts` (additive; never rename or remove) and is mapped in the
  registry to a Lucide icon or a custom glyph made with `createLucideIcon` (same 24-unit grid and stroke). Sizes:
  16 in toolbars, trees and menus, 18–20 in primary navigation. Icon-only controls need a label (the tooltip).
- **Fonts and icons are self-hosted** from npm; no CDN. Record every dependency with its licence in
  `docs/dependencies.md`.
- **Shared contract.** Component props, token names and icon names are a shared contract (root AGENTS.md,
  *Contract changes*): prefer additive changes, bump the package minor version, and record the change in
  `CHANGELOG.md` here. Run `npm run check`, `npm run build:harnesses` and every tool harness for changes that
  affect tools.

## Checks

`npx vitest run packages/design-system` (styling contract, icon registry, contrast, palette), `npm run check`.
