import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AvailabilityContext, CapabilityEntry, ModuleManifest } from '../index'
import { CommandModelProvider, useCommandModel, useContextSet, usePalette } from './commandHooks'
import { buildCommandModel, EMPTY_COMMAND_MODEL } from './commandModel'

/*
 * The hooks are read-only views of the provided model, so a server render (react-dom/server, no DOM and no extra
 * dependency) exercises them fully: what a tool view would render from them.
 */

const ctx: AvailabilityContext = {
  context: { projectId: 'P1', configurationId: 'c', modelRevision: 1, selectedIds: [], scenarioId: 's', pinned: false, workspaceConfigurationId: 'c' },
  selection: [],
  services: {},
  entitlements: [],
  connections: { aiAccount: true, api: true },
}

const manifest: Pick<ModuleManifest, 'id' | 'name' | 'commandLayout'> = {
  id: 'demo',
  name: 'Demo',
  commandLayout: {
    tabs: [{ id: 'home', label: 'Home', groups: [{ id: 'edit', label: 'Edit' }] }],
    palettes: [
      { id: 'sketch', label: 'Sketch tools', when: { kind: 'context', id: 'sketch' }, groups: [{ id: 'lines', label: 'Lines' }] },
      { id: 'general', label: 'General', groups: [{ id: 'g', label: 'G' }] },
    ],
    contextSets: [{ id: 'edge', label: 'Edge', when: [{ kind: 'context', id: 'selection:edge' }] }],
  },
}

const entry = (over: Partial<CapabilityEntry> & { id: string }): CapabilityEntry => ({ module: 'demo', surface: 'toolbar', label: over.id, effect: 'view', status: 'implemented', coverage: 'none', ...over })
const verified = ['packages/x/src/a.test.ts::a'] as CapabilityEntry['verifiedBy']
const entries = [
  entry({ id: 'demo.line', label: 'Line', toolbarItem: 'line', verifiedBy: verified, placements: [{ surface: 'palette', palette: 'sketch', group: 'lines', order: 1 }] }),
  entry({ id: 'demo.fillet', label: 'Fillet', placements: [{ surface: 'context', set: 'edge', order: 1 }], backlog: ['BL-1'] }),
  entry({ id: 'demo.g', label: 'G', toolbarItem: 'g', verifiedBy: verified, placements: [{ surface: 'palette', palette: 'general', group: 'g', order: 1 }] }),
]
const items = [
  { type: 'button' as const, id: 'line', label: 'Line', onClick: () => undefined },
  { type: 'button' as const, id: 'g', label: 'G', onClick: () => undefined },
]

function View({ paletteId, setId }: { paletteId?: string; setId: string }) {
  const model = useCommandModel()
  const palette = usePalette(paletteId)
  const set = useContextSet(setId)
  return (
    <div>
      <span data-tabs>{model.tabs.length}</span>
      <span data-palette>{palette ? `${palette.id}:${palette.groups.flatMap((g) => g.commands.map((c) => `${c.id}=${c.state.kind}`)).join(',')}` : 'none'}</span>
      <span data-set>{set ? `${set.id}:${set.commands.map((c) => `${c.id}=${'state' in c ? c.state.kind : c.type}`).join(',')}` : 'none'}</span>
    </div>
  )
}

const render = (model: Parameters<typeof CommandModelProvider>[0]['model'], props: { paletteId?: string; setId: string }) =>
  renderToStaticMarkup(
    <CommandModelProvider model={model}>
      <View {...props} />
    </CommandModelProvider>,
  )

describe('command hooks', () => {
  it('yield the empty model outside a provider, so a tool renders nothing instead of failing', () => {
    const html = renderToStaticMarkup(<View setId="edge" />)
    expect(html).toContain('<span data-tabs="true">0</span>')
    expect(html).toContain('<span data-palette="true">none</span>')
    expect(html).toContain('<span data-set="true">none</span>')
    expect(EMPTY_COMMAND_MODEL.menus).toEqual([])
  })

  it('usePalette() returns the first palette that applies now, and usePalette(id) only that one while it applies', () => {
    const noContext = buildCommandModel(manifest, entries, items, ctx)
    expect(render(noContext, { setId: 'edge' })).toContain('<span data-palette="true">general:demo.g=ready</span>')
    expect(render(noContext, { paletteId: 'sketch', setId: 'edge' })).toContain('<span data-palette="true">none</span>')

    const sketching = buildCommandModel(manifest, entries, items, ctx, undefined, { contexts: ['sketch'] })
    expect(render(sketching, { setId: 'edge' })).toContain('<span data-palette="true">sketch:demo.line=ready</span>')
    expect(render(sketching, { paletteId: 'general', setId: 'edge' })).toContain('<span data-palette="true">general:demo.g=ready</span>')
  })

  it('useContextSet(id) returns the set only while every prerequisite holds, with planned members and no handler', () => {
    const idle = buildCommandModel(manifest, entries, items, ctx)
    expect(render(idle, { setId: 'edge' })).toContain('<span data-set="true">none</span>')
    const edge = buildCommandModel(manifest, entries, items, ctx, undefined, { contexts: ['selection:edge'] })
    expect(render(edge, { setId: 'edge' })).toContain('<span data-set="true">edge:demo.fillet=planned</span>')
    const fillet = edge.contextSets[0].commands[0]
    expect('onInvoke' in (fillet as { state: object }).state).toBe(false)
    expect(render(edge, { setId: 'unknown' })).toContain('<span data-set="true">none</span>')
  })
})
