import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { ModelLoadError } from './errors'
import { assertSupportedFileName } from './fileTypes'
import { inspectGlb } from './glbHeader'
import { buildLoadedModel } from './modelInfo'
import type { LoadedModel } from './types'

/**
 * Parses GLB bytes entirely in memory. Because the buffer is parsed directly,
 * no object URLs are created for the model itself; GLTFLoader revokes the
 * short-lived blob URLs it uses for embedded textures once they have decoded.
 */
export async function parseGlb(buffer: ArrayBuffer, fileName: string): Promise<LoadedModel> {
  inspectGlb(buffer, fileName)

  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  const gltf = await loader.parseAsync(buffer, '')

  if (!gltf.scene) {
    throw new ModelLoadError('Model has no scene', `“${fileName}” contains no viewable geometry.`)
  }
  return buildLoadedModel(gltf, fileName, buffer.byteLength)
}

/** Loads a model the user picked or dropped. Nothing leaves the browser. */
export async function loadModelFromFile(file: File): Promise<LoadedModel> {
  assertSupportedFileName(file.name)
  if (file.size === 0) {
    throw new ModelLoadError('File is empty', `“${file.name}” contains no data.`)
  }
  return parseGlb(await file.arrayBuffer(), file.name)
}

/** Loads a model bundled with the site, such as the optional sample. */
export async function loadModelFromUrl(url: string, fileName: string): Promise<LoadedModel> {
  const response = await fetch(url)
  const contentType = response.headers.get('content-type') ?? ''
  // SPA hosts often answer missing files with index.html, so check the type too.
  if (!response.ok || contentType.includes('text/html')) {
    throw new ModelLoadError('Model not found', `Could not download “${fileName}” (HTTP ${response.status}).`)
  }
  return parseGlb(await response.arrayBuffer(), fileName)
}
