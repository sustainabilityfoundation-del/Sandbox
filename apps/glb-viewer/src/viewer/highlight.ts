import { Color, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three'
import { isMesh } from '../loading/modelInfo'

const HIGHLIGHT = new Color('#2f7dff')

function highlightCopy(material: Material): Material {
  const copy = material.clone()
  const standard = copy as MeshStandardMaterial
  if (standard.emissive) {
    standard.emissive.copy(HIGHLIGHT)
    standard.emissiveIntensity = 0.45
    standard.emissiveMap = null
  } else if (standard.color) {
    standard.color.lerp(HIGHLIGHT, 0.6)
  }
  return copy
}

/**
 * Temporarily swaps every mesh under `root` to a tinted copy of its own
 * material, keeping textures, transparency and wireframe state. Materials are
 * often shared between parts, so copies are used rather than editing in place.
 * Returns a function that restores the originals and frees the copies.
 */
export function applyHighlight(root: Object3D): () => void {
  const swaps: { mesh: Mesh; original: Mesh['material']; copies: Material[] }[] = []

  root.traverse((object) => {
    if (!isMesh(object)) return
    const original = object.material
    if (Array.isArray(original)) {
      const copies = original.map(highlightCopy)
      object.material = copies
      swaps.push({ mesh: object, original, copies })
    } else {
      const copy = highlightCopy(original)
      object.material = copy
      swaps.push({ mesh: object, original, copies: [copy] })
    }
  })

  return () => {
    for (const { mesh, original, copies } of swaps) {
      mesh.material = original
      copies.forEach((c) => c.dispose()) // textures are shared with the original
    }
  }
}

/** Switches every material in the model between solid and wireframe. */
export function setWireframe(root: Object3D, wireframe: boolean): void {
  root.traverse((object) => {
    if (!isMesh(object)) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if ('wireframe' in material) (material as MeshStandardMaterial).wireframe = wireframe
    }
  })
}
