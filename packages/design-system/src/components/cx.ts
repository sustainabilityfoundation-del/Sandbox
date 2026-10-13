/** Joins class names, skipping falsy values. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/** Combines a static class string with a React Aria className render function. */
export function rac<T>(base: string, extra?: string | ((state: T) => string)): string | ((state: T) => string) {
  if (typeof extra === 'function') return (state: T) => cx(base, extra(state))
  return cx(base, extra)
}
