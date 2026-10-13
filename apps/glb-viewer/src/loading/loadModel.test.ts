import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ModelLoadError } from './errors'
import { assertSupportedFileName } from './fileTypes'
import { loadModelFromFile } from './loadModel'

const samplePath = resolve(__dirname, '../../public/models/sample.glb')

function sampleFile(name = 'sample.glb'): File {
  return new File([readFileSync(samplePath)], name)
}

function glbWithJson(json: object): ArrayBuffer {
  let text = JSON.stringify(json)
  while (text.length % 4) text += ' '
  const body = new TextEncoder().encode(text)
  const buffer = new ArrayBuffer(20 + body.length)
  const view = new DataView(buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, buffer.byteLength, true)
  view.setUint32(12, body.length, true)
  view.setUint32(16, 0x4e4f534a, true)
  new Uint8Array(buffer, 20).set(body)
  return buffer
}

describe('assertSupportedFileName', () => {
  it('accepts .glb in any case', () => {
    expect(() => assertSupportedFileName('Bracket.GLB')).not.toThrow()
  })

  it.each([
    ['part.SLDPRT', /native SolidWorks/i],
    ['assembly.sldasm', /native SolidWorks/i],
    ['model.step', /STEP/],
    ['model.gltf', /\.glb instead/],
    ['model.stl', /STL/],
    ['notes.txt', /Unsupported/],
  ])('rejects %s with a helpful message', (name, pattern) => {
    let error: unknown
    try {
      assertSupportedFileName(name)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(ModelLoadError)
    const { title, message } = error as ModelLoadError
    expect(`${title} ${message}`).toMatch(pattern)
  })
})

describe('loadModelFromFile', () => {
  it('rejects a renamed non-GLB file', async () => {
    const file = new File(['solid cube\nendsolid cube\n'.repeat(4)], 'fake.glb')
    await expect(loadModelFromFile(file)).rejects.toThrow(/does not contain glTF binary/)
  })

  it('rejects an empty file', async () => {
    await expect(loadModelFromFile(new File([], 'empty.glb'))).rejects.toThrow(/no data/)
  })

  it('rejects GLBs that reference external files', async () => {
    const file = new File([glbWithJson({ asset: { version: '2.0' }, buffers: [{ uri: 'a.bin', byteLength: 4 }] })], 'x.glb')
    await expect(loadModelFromFile(file)).rejects.toThrow(/external files/)
  })

  it('rejects Draco-compressed GLBs with a specific message', async () => {
    const file = new File(
      [glbWithJson({ asset: { version: '2.0' }, extensionsRequired: ['KHR_draco_mesh_compression'] })],
      'x.glb',
    )
    await expect(loadModelFromFile(file)).rejects.toThrow(/Draco/)
  })

  it('loads the sample, preserving hierarchy, names and materials', async () => {
    const model = await loadModelFromFile(sampleFile('Bracket.glb'))
    const names = [...model.nameById.values()]

    expect(model.fileName).toBe('Bracket.glb')
    expect(model.tree.name).toBe('Bracket.glb')
    // Original names, not three.js' sanitised ones ("Base_Plate-1", "Shaft_Ø20-1").
    expect(names).toContain('Base Plate-1')
    expect(names).toContain('Shaft Ø20-1')
    expect(names).toContain('M8 Hex Bolt-4')
    expect(names).toContain('Gusset-1 · 2')
    expect(names.some((n) => n.startsWith('Unnamed'))).toBe(false)

    const assembly = model.tree.children[0]
    expect(assembly.name).toBe('Bracket Assembly')
    expect(assembly.children.map((c) => c.name)).toEqual([
      'Base Plate-1',
      'Upright-1',
      'Gusset-1',
      'Shaft Sub-Assembly-1',
      'Fasteners',
    ])

    // 14 glTF meshes, one of which has two primitives.
    expect(model.meshCount).toBe(15)
    expect(model.triangleCount).toBeGreaterThan(1000)
    expect(model.tree.triangleCount).toBe(model.triangleCount)

    const materialNames = new Set<string>()
    model.scene.traverse((o) => {
      const m = (o as { material?: { name: string } | { name: string }[] }).material
      if (m) (Array.isArray(m) ? m : [m]).forEach((x) => materialNames.add(x.name))
    })
    expect(materialNames).toEqual(new Set(['Plain Carbon Steel', 'Aluminium 6061', 'Blue Anodised', 'Black Rubber']))

    expect(model.bounds.isEmpty()).toBe(false)
    for (const [id, parentId] of model.parentById) {
      expect(model.objectsById.get(id)?.parent?.uuid).toBe(parentId)
    }
  })
})
