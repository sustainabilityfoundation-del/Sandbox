import { ModelLoadError } from './errors'

const EXPORT_HINT =
  'In SolidWorks, use File › Save As and choose the glTF Binary (*.glb) file type, then open the .glb here.'

const NATIVE_SOLIDWORKS = new Set(['sldprt', 'sldasm', 'slddrw', 'prtdot', 'asmdot'])
const OTHER_CAD = new Set(['step', 'stp', 'iges', 'igs', 'x_t', 'x_b', 'sat', 'jt', '3dxml', 'ipt', 'iam', 'f3d'])
const OTHER_MESH = new Set(['stl', 'obj', 'fbx', '3mf', 'ply', 'dae', 'wrl', 'vrml', 'usdz', 'usd'])

export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase()
}

/**
 * Rejects files this viewer cannot open, with a message that says what to do
 * instead. Only self-contained .glb files are accepted.
 */
export function assertSupportedFileName(fileName: string): void {
  const ext = fileExtension(fileName)
  if (ext === 'glb') return

  if (NATIVE_SOLIDWORKS.has(ext)) {
    throw new ModelLoadError(
      'Native SolidWorks files are not supported',
      `“${fileName}” is a native SolidWorks file, which cannot be read in a browser. ${EXPORT_HINT}`,
    )
  }
  if (OTHER_CAD.has(ext)) {
    throw new ModelLoadError(
      `.${ext.toUpperCase()} files are not supported`,
      `This viewer does not read CAD exchange formats such as STEP or IGES. ${EXPORT_HINT}`,
    )
  }
  if (ext === 'gltf') {
    throw new ModelLoadError(
      'Use a .glb instead of .gltf',
      'A .gltf file usually references separate .bin and texture files, so it cannot be opened on its own. ' +
        'Export as glTF Binary (*.glb), which packs everything into one file.',
    )
  }
  if (OTHER_MESH.has(ext)) {
    throw new ModelLoadError(
      `.${ext.toUpperCase()} files are not supported`,
      `This version only opens .glb files. ${EXPORT_HINT}`,
    )
  }
  throw new ModelLoadError(
    'Unsupported file',
    `“${fileName}” is not a .glb file. ${EXPORT_HINT}`,
  )
}
