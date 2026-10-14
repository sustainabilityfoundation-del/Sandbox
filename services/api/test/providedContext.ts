export {}

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string
  }
}
