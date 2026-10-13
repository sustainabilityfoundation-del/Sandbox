import { Box3, type Group, type InstancedMesh, type Mesh, type Object3D } from 'three'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import type { LoadedModel, ModelTreeNode } from './types'

interface GltfJsonNames {
  scenes?: { name?: string }[]
  nodes?: { name?: string }[]
  meshes?: { name?: string; primitives?: unknown[] }[]
}

/** three.js records which glTF entity each object came from; primitives isn't in the typings. */
interface Association {
  nodes?: number
  meshes?: number
  primitives?: number
}

export function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true
}

export function triangleCountOf(mesh: Mesh): number {
  const geometry = mesh.geometry
  const vertexCount = geometry.index ? geometry.index.count : (geometry.attributes.position?.count ?? 0)
  const start = Math.min(geometry.drawRange.start, vertexCount)
  const drawn = Math.min(vertexCount - start, geometry.drawRange.count)
  const triangles = Math.floor(drawn / 3)
  const instanced = mesh as InstancedMesh
  return instanced.isInstancedMesh ? triangles * instanced.count : triangles
}

/**
 * GLTFLoader sanitises object names for animation binding (spaces become
 * underscores, dots and brackets are removed). Recover the names exactly as
 * SolidWorks wrote them from the original glTF JSON.
 */
function originalNames(gltf: GLTF): Map<Object3D, string> {
  const json = gltf.parser.json as GltfJsonNames
  const names = new Map<Object3D, string>()
  const primitiveMeshes: [Object3D, number][] = []

  for (const [entity, ref] of gltf.parser.associations) {
    const object = entity as Object3D
    if (!object.isObject3D) continue
    const association = ref as Association

    if (association.nodes !== undefined) {
      const name = json.nodes?.[association.nodes]?.name
      if (name) names.set(object, name)
    } else if (association.meshes !== undefined && association.primitives !== undefined) {
      // One mesh of a multi-material body; three.js groups these under the node.
      const meshName = json.meshes?.[association.meshes]?.name
      if (meshName) names.set(object, `${meshName} · ${association.primitives + 1}`)
      else primitiveMeshes.push([object, association.primitives])
    }
  }

  // Unnamed primitives take their part's name, e.g. "Gusset-1 · 2".
  for (const [object, primitive] of primitiveMeshes) {
    const parentName = object.parent ? names.get(object.parent) : undefined
    if (parentName) names.set(object, `${parentName} · ${primitive + 1}`)
  }

  const sceneName = json.scenes?.[0]?.name
  if (sceneName) names.set(gltf.scene, sceneName)
  return names
}

let loadCounter = 0

/** Builds the hierarchy, lookup tables and statistics for a parsed GLB. */
export function buildLoadedModel(gltf: GLTF, fileName: string, fileSize: number): LoadedModel {
  const scene = gltf.scene as Group
  const names = originalNames(gltf)
  const objectsById = new Map<string, Object3D>()
  const parentById = new Map<string, string>()
  const nameById = new Map<string, string>()

  const visit = (object: Object3D, parentId: string | null): ModelTreeNode => {
    objectsById.set(object.uuid, object)
    if (parentId) parentById.set(object.uuid, parentId)

    const mesh = isMesh(object)
    const name = names.get(object) || object.name || (mesh ? 'Unnamed mesh' : 'Unnamed group')
    nameById.set(object.uuid, name)

    const children = object.children.map((child) => visit(child, object.uuid))
    const ownTriangles = mesh ? triangleCountOf(object) : 0

    return {
      id: object.uuid,
      name,
      kind: mesh ? 'mesh' : 'group',
      children,
      meshCount: (mesh ? 1 : 0) + children.reduce((sum, c) => sum + c.meshCount, 0),
      triangleCount: ownTriangles + children.reduce((sum, c) => sum + c.triangleCount, 0),
    }
  }

  const tree = visit(scene, null)
  // The root is labelled with the file name: it's the most useful handle for users.
  tree.name = fileName
  nameById.set(scene.uuid, fileName)

  scene.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(scene)

  return {
    id: `model-${++loadCounter}`,
    fileName,
    fileSize,
    scene,
    tree,
    objectsById,
    parentById,
    nameById,
    meshCount: tree.meshCount,
    triangleCount: tree.triangleCount,
    bounds,
  }
}
