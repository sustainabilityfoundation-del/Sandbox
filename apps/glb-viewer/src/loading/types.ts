import type { Box3, Group, Object3D } from 'three'

export type NodeKind = 'group' | 'mesh'

/** A plain, React-friendly mirror of the loaded scene graph. */
export interface ModelTreeNode {
  /** The Object3D uuid; used as a stable key across the app. */
  id: string
  /** Original glTF name (unsanitised), or a readable fallback. */
  name: string
  kind: NodeKind
  children: ModelTreeNode[]
  /** Number of meshes in this subtree, including itself. */
  meshCount: number
  /** Number of triangles in this subtree, including itself. */
  triangleCount: number
}

export interface LoadedModel {
  /** Unique per load, so React can remount viewer pieces on replacement. */
  id: string
  fileName: string
  fileSize: number
  scene: Group
  tree: ModelTreeNode
  objectsById: Map<string, Object3D>
  parentById: Map<string, string>
  nameById: Map<string, string>
  meshCount: number
  triangleCount: number
  /** World-space bounds of the whole model at load time. */
  bounds: Box3
}
