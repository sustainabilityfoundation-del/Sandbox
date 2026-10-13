import { ModelLoadError } from './errors'

const GLB_MAGIC = 0x46546c67 // 'glTF'
const CHUNK_JSON = 0x4e4f534a // 'JSON'
const HEADER_BYTES = 12

/** The parts of the glTF JSON we inspect before handing off to three.js. */
interface GltfJsonSummary {
  extensionsRequired?: string[]
  buffers?: { uri?: string }[]
  images?: { uri?: string }[]
}

/**
 * Validates the GLB container and checks that the model is self-contained and
 * uses no extensions we can't decode. Throws a ModelLoadError otherwise.
 */
export function inspectGlb(buffer: ArrayBuffer, fileName: string): void {
  if (buffer.byteLength < HEADER_BYTES + 8) {
    throw new ModelLoadError('File is empty or truncated', `“${fileName}” is too small to be a GLB model.`)
  }

  const view = new DataView(buffer)
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    throw new ModelLoadError(
      'Not a GLB file',
      `“${fileName}” has a .glb extension but does not contain glTF binary data. ` +
        'It may have been renamed from another format.',
    )
  }

  const version = view.getUint32(4, true)
  if (version !== 2) {
    throw new ModelLoadError(
      'Unsupported glTF version',
      `“${fileName}” is glTF version ${version}. Only glTF 2.0 is supported; re-export from a current SolidWorks version.`,
    )
  }

  const jsonLength = view.getUint32(12, true)
  const chunkType = view.getUint32(16, true)
  if (chunkType !== CHUNK_JSON || HEADER_BYTES + 8 + jsonLength > buffer.byteLength) {
    throw new ModelLoadError('File is damaged', `“${fileName}” has an invalid GLB structure.`)
  }

  let json: GltfJsonSummary
  try {
    const text = new TextDecoder().decode(new Uint8Array(buffer, HEADER_BYTES + 8, jsonLength))
    json = JSON.parse(text) as GltfJsonSummary
  } catch {
    throw new ModelLoadError('File is damaged', `“${fileName}” contains unreadable glTF metadata.`)
  }

  const isExternal = (uri?: string) => uri !== undefined && !uri.startsWith('data:')
  if (json.buffers?.some((b) => isExternal(b.uri)) || json.images?.some((i) => isExternal(i.uri))) {
    throw new ModelLoadError(
      'Model is not self-contained',
      `“${fileName}” references external files, which cannot be loaded from a single upload. ` +
        'Re-export as a GLB with all geometry and textures embedded.',
    )
  }

  const required = json.extensionsRequired ?? []
  if (required.includes('KHR_draco_mesh_compression')) {
    throw new ModelLoadError(
      'Draco-compressed GLB',
      `“${fileName}” uses Draco mesh compression, which this viewer does not decode yet. ` +
        'Re-export the model without mesh compression.',
    )
  }
  if (required.includes('KHR_texture_basisu')) {
    throw new ModelLoadError(
      'Compressed textures not supported',
      `“${fileName}” uses KTX2/Basis textures, which this viewer does not decode yet.`,
    )
  }
}
