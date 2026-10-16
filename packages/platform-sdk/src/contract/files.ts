/**
 * File hand-off between modules and the platform (SDK 1.9, CR-PM-SDK-4). Framework-free.
 * Producers (for example a STEP export) stage a file with its provenance and return the handle; consumers
 * (for example `projects.store_document`) read the bytes by handle, so bytes never pass through the assistant.
 */
export const FILES_CONTRACT_VERSION = '1.0.0'

/** Where a file came from: the source artifact at an exact revision and the producing tool (recorded, never inferred). */
export interface FileProvenance {
  source?: { module: string; kind: string; id: string; revision?: number | string }
  tool?: { name: string; version: string }
  kernel?: { name: string; version: string }
  generatedAt?: string
  notes?: string
  /** Module-specific details, e.g. a STEP read-back report. */
  details?: Record<string, unknown>
}

export interface StagedFile {
  handle: string
  fileName: string
  mediaType: string
  byteSize: number
  sha256: string
  provenance?: FileProvenance
  stagedAt: string
}

/** Files produced in this window, handed between modules without passing their bytes through the assistant. */
export interface FilesService {
  readonly contractVersion: string
  /** Stages a file; returns its handle (valid until the window closes). */
  stage(file: { bytes: Uint8Array; fileName: string; mediaType: string; provenance?: FileProvenance }): Promise<StagedFile>
  /** Metadata of a staged file, or undefined. */
  describe(handle: string): StagedFile | undefined
  /** The bytes of a staged file; throws if the handle is unknown. */
  read(handle: string): Promise<Uint8Array>
  /** Removes a staged file. */
  discard(handle: string): void
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** In-memory `FilesService` (per window); used by the workspace host and the harness. */
export function createMemoryFilesService(): FilesService {
  const files = new Map<string, { meta: StagedFile; bytes: Uint8Array }>()
  return {
    contractVersion: FILES_CONTRACT_VERSION,
    async stage(file) {
      const bytes = new Uint8Array(file.bytes)
      const handle = `file:${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${files.size}`}`
      const meta: StagedFile = {
        handle,
        fileName: file.fileName,
        mediaType: file.mediaType,
        byteSize: bytes.byteLength,
        sha256: await sha256Hex(bytes),
        ...(file.provenance ? { provenance: file.provenance } : {}),
        stagedAt: new Date().toISOString(),
      }
      files.set(handle, { meta, bytes })
      return meta
    },
    describe: (handle) => files.get(handle)?.meta,
    async read(handle) {
      const entry = files.get(handle)
      if (!entry) throw new Error(`No staged file ${handle}.`)
      return new Uint8Array(entry.bytes)
    },
    discard(handle) {
      files.delete(handle)
    },
  }
}
