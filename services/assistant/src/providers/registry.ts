import type { AssistantProvider, AuthMethod } from './types'

/** Registered provider adapters. The settings page lists whatever is registered here. */
export class ProviderRegistry {
  private readonly providers = new Map<string, AssistantProvider>()

  register(provider: AssistantProvider): this {
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(provider.id)) throw new Error(`Invalid provider ID “${provider.id}”.`)
    if (this.providers.has(provider.id)) throw new Error(`Provider ${provider.id} is already registered.`)
    this.providers.set(provider.id, provider)
    return this
  }

  get(id: string): AssistantProvider | undefined {
    return this.providers.get(id)
  }

  list(): AssistantProvider[] {
    return [...this.providers.values()]
  }

  method(providerId: string, methodId: string): { provider: AssistantProvider; method: AuthMethod } | undefined {
    const provider = this.get(providerId)
    const method = provider?.methods.find((m) => m.id === methodId)
    return provider && method ? { provider, method } : undefined
  }
}
