import type { ImageAdapter } from './types'

/** Installed image adapters. Test adapters are refused when the registry is created for production. */
export class AdapterRegistry {
  private readonly adapters = new Map<string, ImageAdapter>()
  constructor(private readonly options: { production: boolean }) {}

  register(adapter: ImageAdapter): this {
    if (adapter.testOnly && this.options.production) throw new Error(`The test adapter ${adapter.id} is never registered in production.`)
    if (this.adapters.has(adapter.id)) throw new Error(`Adapter ${adapter.id} is already registered.`)
    this.adapters.set(adapter.id, adapter)
    return this
  }

  get(id: string): ImageAdapter | undefined {
    return this.adapters.get(id)
  }

  /** Real adapters first, then test adapters. */
  list(): ImageAdapter[] {
    return [...this.adapters.values()].sort((a, b) => Number(a.testOnly) - Number(b.testOnly))
  }
}
