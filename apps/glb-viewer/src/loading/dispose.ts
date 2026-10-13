import type { BufferGeometry, Material, Mesh, Object3D, Texture } from 'three'

export function materialsOf(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

/** Frees every geometry, material and texture under `root` from the GPU. */
export function disposeObject3D(root: Object3D): void {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()

  root.traverse((object) => {
    const mesh = object as Mesh
    if (mesh.geometry) geometries.add(mesh.geometry)
    if (mesh.material) materialsOf(mesh).forEach((m) => materials.add(m))
  })

  for (const material of materials) {
    for (const value of Object.values(material)) {
      if ((value as Texture | null)?.isTexture) textures.add(value as Texture)
    }
  }

  geometries.forEach((g) => g.dispose())
  materials.forEach((m) => m.dispose())
  textures.forEach((t) => {
    const image = t.source?.data as unknown
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close()
    t.dispose()
  })
}

const pending = new Map<Object3D, ReturnType<typeof setTimeout>>()

/**
 * Disposes after the current React commit, so the renderer never draws (and
 * silently re-uploads) a scene that has already been freed. A remount of the
 * same scene, as React StrictMode does in development, cancels the disposal.
 */
export function scheduleDispose(root: Object3D): void {
  if (pending.has(root)) return
  pending.set(
    root,
    setTimeout(() => {
      pending.delete(root)
      disposeObject3D(root)
    }, 0),
  )
}

export function cancelDispose(root: Object3D): void {
  const timer = pending.get(root)
  if (timer !== undefined) {
    clearTimeout(timer)
    pending.delete(root)
  }
}
