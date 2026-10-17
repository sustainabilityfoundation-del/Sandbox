/** Failure of an assistant operation, with an HTTP status and a message a person can act on. */
export class AssistantError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AssistantError'
  }
}
