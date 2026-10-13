/** An error with a short title and a user-facing explanation. */
export class ModelLoadError extends Error {
  readonly title: string

  constructor(title: string, message: string) {
    super(message)
    this.name = 'ModelLoadError'
    this.title = title
  }
}

export interface UserFacingError {
  title: string
  message: string
}

/** Turns anything thrown during loading into something worth showing a user. */
export function describeLoadError(error: unknown, fileName: string): UserFacingError {
  if (error instanceof ModelLoadError) {
    return { title: error.title, message: error.message }
  }

  const raw = error instanceof Error ? error.message : String(error)

  if (/draco/i.test(raw)) {
    return {
      title: 'Draco-compressed GLB',
      message:
        `“${fileName}” uses Draco mesh compression, which this viewer does not decode yet. ` +
        'Re-export the model without mesh compression.',
    }
  }
  if (/ktx2|basisu/i.test(raw)) {
    return {
      title: 'Compressed textures not supported',
      message: `“${fileName}” uses KTX2/Basis textures, which this viewer does not decode yet.`,
    }
  }

  return {
    title: 'Could not read model',
    message:
      `“${fileName}” could not be parsed as a glTF 2.0 binary (.glb). ` +
      `The file may be damaged or incomplete. Details: ${raw}`,
  }
}
